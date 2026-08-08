import 'server-only';

import type {
  ChatRequest,
  ContentBlock,
  ProviderAdapter,
  ProviderMessage,
  StreamChunk,
  ToolDef,
  ToolUseBlock,
} from '@agiworkforce/types';

import {
  CLOUD_CODE_LIST_FILES_TOOL,
  CLOUD_CODE_READ_FILE_TOOL,
  CLOUD_CODE_RUN_COMMAND_TOOL,
  classifyCommandRisk,
  cloudCodeAgentToolDefs,
} from './cloud-code-agent-tools';

/**
 * Cloud Code agent turn — the bounded model↔tool loop.
 *
 * This is the piece that turns Cloud Code from a remote terminal (user types a
 * command, `runCloudCodeCommand` runs it) into a goal-directed agent: the user
 * states an objective once and the model drives the sandbox toward it.
 *
 * WHAT THIS FILE OWNS
 *   - Assembling the provider request (system prompt, tools, transcript).
 *   - Draining `ProviderAdapter.stream()` into completed tool calls.
 *   - Enforcing the loop bounds (max steps, wall clock, cancellation).
 *   - Routing each tool call through the approval boundary.
 *
 * WHAT IT DELIBERATELY DOES NOT OWN
 *   - **Risk classification.** `classifyCommandRisk` is the single owner; this
 *     file never second-guesses it. A loop that could downgrade a verdict would
 *     make the classifier's fail-closed design meaningless.
 *   - **Sandbox mechanics.** Execution goes through the injected `ToolRunner`,
 *     which the caller builds from the session's own E2B executor and scope, so
 *     this module has no sandbox lifecycle knowledge and stays unit-testable.
 *   - **Billing.** The caller wraps the loop in reserve/settle. Exposed here as
 *     `onStepCommitted`, invoked before each provider call so a caller can
 *     extend its lease — matching how the metered chat path reserves a provider
 *     step before every external call.
 *   - **Persistence.** Emitted as events; the caller writes rows (0082).
 */

/** Bounds. A loop without these is an unbounded spend on someone's card. */
export const CLOUD_CODE_AGENT_MAX_STEPS = 24;
export const CLOUD_CODE_AGENT_MAX_DURATION_MS = 10 * 60_000;
/** Tool output beyond this is truncated before it re-enters the context. */
export const CLOUD_CODE_AGENT_MAX_TOOL_OUTPUT = 30_000;

export type CloudCodeAgentStopReason =
  | 'done'
  | 'max_steps'
  | 'timeout'
  | 'cancelled'
  | 'error'
  | 'denied'
  | 'awaiting_approval';

export interface CloudCodeToolInvocation {
  toolUseId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface CloudCodeToolOutcome {
  output: string;
  isError: boolean;
}

/**
 * Executes one tool call against the session sandbox. Supplied by the caller so
 * this loop never touches E2B directly.
 *
 * `runCommand` is only ever called for a command the loop has already cleared
 * through the approval boundary.
 */
export interface CloudCodeToolRunner {
  readFile(path: string): Promise<CloudCodeToolOutcome>;
  listFiles(path: string | undefined): Promise<CloudCodeToolOutcome>;
  runCommand(command: string): Promise<CloudCodeToolOutcome>;
  /** write_file / create_folder / execute_code, owned by lib/e2b/execution-tools. */
  runSharedExecutionTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CloudCodeToolOutcome>;
}

/**
 * A command the loop refuses to run unattended. The caller persists this as a
 * `cloud_code_agent_approvals` row and suspends the turn; on approval it
 * resumes with `preApproved` carrying the decision.
 */
export interface CloudCodeApprovalRequest {
  stepIndex: number;
  toolUseId: string;
  command: string;
  reason: string;
}

export interface CloudCodeAgentEvent {
  type: 'assistant-text' | 'tool-start' | 'tool-end';
  stepIndex: number;
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  output?: string;
  isError?: boolean;
}

export interface CloudCodeAgentResult {
  stopReason: CloudCodeAgentStopReason;
  stepsUsed: number;
  /**
   * Summed provider usage across every step of the turn. Zeros when no
   * provider call reported usage, which the caller must treat as "unknown"
   * rather than "free".
   */
  usage: CloudCodeTurnUsage;
  finalMessage: string;
  /** Set when stopReason === 'awaiting_approval'. */
  pendingApproval?: CloudCodeApprovalRequest;
  /** Full transcript, so a resumed turn continues rather than restarts. */
  messages: ProviderMessage[];
  errorMessage?: string;
}

export interface RunCloudCodeAgentTurnInput {
  adapter: ProviderAdapter;
  model: string;
  goal: string;
  runner: CloudCodeToolRunner;
  signal: AbortSignal;
  /** Repository context for the system prompt, when the session has one. */
  repositoryUrl?: string | null;
  workspacePath?: string;
  /** Resume: prior transcript from a suspended turn. */
  priorMessages?: ProviderMessage[];
  /** Resume: the decision for the command that suspended the turn. */
  preApproved?: { toolUseId: string; command: string; approved: boolean };
  /** Called before each provider call so the caller can extend its usage lease. */
  onStepCommitted?: (stepIndex: number) => Promise<void> | void;
  onEvent?: (event: CloudCodeAgentEvent) => Promise<void> | void;
  maxSteps?: number;
  maxDurationMs?: number;
  now?: () => number;
}

function buildSystemPrompt(input: RunCloudCodeAgentTurnInput): string {
  const lines = [
    'You are AGI Code, working inside an isolated cloud sandbox on the user behalf.',
    '',
    'How to work:',
    '- Read before you write. Use read_file and list_files to ground every edit in the current contents.',
    '- Prefer small, verifiable steps. After a change, run the project checks that already exist.',
    '- Do not invent files, APIs, or commands you have not observed in this workspace.',
    '- When you are done, stop calling tools and reply with a short summary of what changed and what you verified.',
    '',
    'Boundaries you cannot negotiate:',
    '- Destructive, privileged, dependency-installing, and network commands pause for the user approval.',
    '- Some commands are refused outright. If one is refused, do not attempt to reach the same effect another way.',
    '- Everything happens in this sandbox. There is no access to the user machine.',
  ];
  if (input.repositoryUrl) lines.push('', `Repository: ${input.repositoryUrl}`);
  if (input.workspacePath) lines.push(`Workspace: ${input.workspacePath}`);
  return lines.join('\n');
}

/** OpenAI-shaped defs from the tool contract → the adapter boundary shape. */
function toProviderToolDefs(): ToolDef[] {
  return cloudCodeAgentToolDefs().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters,
  }));
}

export function truncateToolOutput(
  output: string,
  limit = CLOUD_CODE_AGENT_MAX_TOOL_OUTPUT,
): string {
  if (output.length <= limit) return output;
  const omitted = output.length - limit;
  // Keep the TAIL: compiler and test output puts the failure at the end, and a
  // head-truncated log reliably hides the reason the agent needs to see.
  return `[${omitted} earlier characters omitted]\n${output.slice(output.length - limit)}`;
}

interface DrainedTurn {
  text: string;
  toolCalls: ToolUseBlock[];
  /**
   * Provider-reported token usage for this assistant turn, when the stream
   * emitted a `usage` chunk. Previously the `default: break` below swallowed
   * it, which is why the turn could not be billed at what it actually cost.
   */
  usage?: CloudCodeTurnUsage;
}

/** Token usage accumulated across every provider call in a turn. */
export interface CloudCodeTurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Collect one assistant turn from the provider stream. Tool arguments arrive as
 * partial JSON across `tool-use-delta` chunks and are only parsed once the
 * matching `tool-use-end` has been seen.
 */
export async function drainAssistantTurn(stream: AsyncIterable<StreamChunk>): Promise<DrainedTurn> {
  let text = '';
  let usage: CloudCodeTurnUsage | undefined;
  const names = new Map<string, string>();
  const buffers = new Map<string, string>();
  const completed: string[] = [];

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text-delta':
        text += chunk.delta;
        break;
      case 'tool-use-start':
        names.set(chunk.toolUseId, chunk.name);
        buffers.set(chunk.toolUseId, '');
        break;
      case 'tool-use-delta':
        buffers.set(chunk.toolUseId, (buffers.get(chunk.toolUseId) ?? '') + chunk.deltaJson);
        break;
      case 'tool-use-end':
        completed.push(chunk.toolUseId);
        break;
      case 'usage':
        // A provider may emit several usage chunks; the last one is the
        // authoritative total for the turn, matching how the metered chat
        // path treats them.
        usage = {
          inputTokens: chunk.inputTokens ?? 0,
          outputTokens: chunk.outputTokens ?? 0,
          cacheReadTokens: chunk.cacheReadTokens ?? 0,
          cacheWriteTokens: chunk.cacheWriteTokens ?? 0,
        };
        break;
      default:
        break;
    }
  }

  const toolCalls: ToolUseBlock[] = [];
  for (const id of completed) {
    const name = names.get(id);
    if (!name) continue;
    const raw = buffers.get(id) ?? '';
    let input: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        // A model can emit valid JSON that is not an object (`"x"`, `[1]`).
        // Coerce to {} rather than trusting the shape downstream.
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        // Malformed partial JSON: surface as empty args so the tool reports an
        // honest validation error back to the model instead of throwing here.
        input = {};
      }
    }
    toolCalls.push({ type: 'tool_use', id, name, input });
  }
  return { text, toolCalls, usage };
}

function toolResultBlock(toolUseId: string, outcome: CloudCodeToolOutcome): ContentBlock {
  return {
    type: 'tool_result',
    toolUseId,
    content: truncateToolOutput(outcome.output || (outcome.isError ? 'Tool failed.' : 'OK')),
    isError: outcome.isError,
  };
}

/**
 * Run the agent turn.
 *
 * Returns rather than throws for every expected stop: the caller must persist a
 * terminal state and settle usage even when the turn fails, and an exception
 * path makes that easy to skip.
 */
export async function runCloudCodeAgentTurn(
  input: RunCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const maxSteps = input.maxSteps ?? CLOUD_CODE_AGENT_MAX_STEPS;
  const maxDurationMs = input.maxDurationMs ?? CLOUD_CODE_AGENT_MAX_DURATION_MS;

  const messages: ProviderMessage[] = input.priorMessages
    ? [...input.priorMessages]
    : [{ role: 'user', content: input.goal }];

  const tools = toProviderToolDefs();
  const system = buildSystemPrompt(input);
  let stepsUsed = 0;
  let finalMessage = '';

  // Resume path: the turn suspended on an approval. Apply the decision as this
  // step's tool result before calling the model again, so the model learns the
  // outcome instead of re-proposing the same command.
  if (input.preApproved) {
    const { toolUseId, command, approved } = input.preApproved;
    const outcome: CloudCodeToolOutcome = approved
      ? await input.runner.runCommand(command)
      : { output: `The user declined to run: ${command}`, isError: true };
    messages.push({ role: 'user', content: [toolResultBlock(toolUseId, outcome)] });
    await input.onEvent?.({
      type: 'tool-end',
      stepIndex: stepsUsed,
      toolName: CLOUD_CODE_RUN_COMMAND_TOOL,
      output: outcome.output,
      isError: outcome.isError,
    });
  }

  // Accumulates across EVERY provider call in the turn. A multi-step turn makes
  // many calls, so per-call usage must be summed rather than taken from the
  // last one.
  const usage: CloudCodeTurnUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  while (stepsUsed < maxSteps) {
    if (input.signal.aborted) {
      return { stopReason: 'cancelled', stepsUsed, finalMessage, messages, usage };
    }
    if (now() - startedAt > maxDurationMs) {
      return { stopReason: 'timeout', stepsUsed, finalMessage, messages, usage };
    }

    await input.onStepCommitted?.(stepsUsed);

    const request: ChatRequest = {
      model: input.model,
      messages,
      system,
      tools,
      toolChoice: 'auto',
    };

    let drained: DrainedTurn;
    try {
      drained = await drainAssistantTurn(input.adapter.stream(request, input.signal));
    } catch (error) {
      if (input.signal.aborted) {
        return { stopReason: 'cancelled', stepsUsed, finalMessage, messages, usage };
      }
      return {
        stopReason: 'error',
        stepsUsed,
        finalMessage,
        messages,
        usage,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }

    if (drained.usage) {
      usage.inputTokens += drained.usage.inputTokens;
      usage.outputTokens += drained.usage.outputTokens;
      usage.cacheReadTokens += drained.usage.cacheReadTokens;
      usage.cacheWriteTokens += drained.usage.cacheWriteTokens;
    }

    if (drained.text) {
      finalMessage = drained.text;
      await input.onEvent?.({ type: 'assistant-text', stepIndex: stepsUsed, text: drained.text });
    }

    // No tool calls ⇒ the model is answering, which is how a turn ends.
    if (drained.toolCalls.length === 0) {
      return { stopReason: 'done', stepsUsed, finalMessage, messages, usage };
    }

    const assistantContent: ContentBlock[] = [];
    if (drained.text) assistantContent.push({ type: 'text', text: drained.text });
    assistantContent.push(...drained.toolCalls);
    messages.push({ role: 'assistant', content: assistantContent });

    const results: ContentBlock[] = [];
    for (const call of drained.toolCalls) {
      stepsUsed += 1;
      await input.onEvent?.({
        type: 'tool-start',
        stepIndex: stepsUsed,
        toolName: call.name,
        toolArgs: call.input,
      });

      let outcome: CloudCodeToolOutcome;

      if (call.name === CLOUD_CODE_RUN_COMMAND_TOOL) {
        const command = typeof call.input['command'] === 'string' ? call.input['command'] : '';
        const verdict = classifyCommandRisk(command);

        if (verdict.risk === 'denied') {
          // Refused, but the TURN continues: the model is told why so it can
          // choose a different approach. Only a caller-level policy ends the
          // turn on denial.
          outcome = { output: `Refused: ${verdict.reason}`, isError: true };
        } else if (verdict.risk === 'requires_approval') {
          // Suspend. Everything decided so far is already in `messages`, so the
          // resumed turn continues from here rather than replaying the work.
          messages.push({ role: 'user', content: results });
          return {
            stopReason: 'awaiting_approval',
            stepsUsed,
            finalMessage,
            messages,
            usage,
            pendingApproval: {
              stepIndex: stepsUsed,
              toolUseId: call.id,
              command,
              reason: verdict.reason,
            },
          };
        } else {
          outcome = await input.runner.runCommand(command);
        }
      } else if (call.name === CLOUD_CODE_READ_FILE_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : '';
        outcome = path
          ? await input.runner.readFile(path)
          : { output: 'read_file requires a "path".', isError: true };
      } else if (call.name === CLOUD_CODE_LIST_FILES_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : undefined;
        outcome = await input.runner.listFiles(path);
      } else {
        outcome = await input.runner.runSharedExecutionTool(call.name, call.input);
      }

      results.push(toolResultBlock(call.id, outcome));
      await input.onEvent?.({
        type: 'tool-end',
        stepIndex: stepsUsed,
        toolName: call.name,
        output: outcome.output,
        isError: outcome.isError,
      });

      if (stepsUsed >= maxSteps) break;
    }

    messages.push({ role: 'user', content: results });
  }

  return { stopReason: 'max_steps', stepsUsed, finalMessage, messages, usage };
}
