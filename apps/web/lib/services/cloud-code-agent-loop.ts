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
  CLOUD_CODE_COMMAND_DEADLINE_MS,
  CLOUD_CODE_TURN_BUDGET_MS,
  nestedDeadlineMs,
} from '@/lib/deadline-policy';
import {
  CLOUD_CODE_LIST_FILES_TOOL,
  CLOUD_CODE_READ_FILE_TOOL,
  CLOUD_CODE_RUN_COMMAND_TOOL,
  classifyCommandRisk,
  cloudCodeAgentToolDefs,
  executeCodeAsShellCommand,
} from './cloud-code-agent-tools';
import { EXECUTE_CODE_TOOL, isExecutionTool } from '@/lib/e2b/execution-tools';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
  type ObservedProviderUsage,
  type ProviderUsageObservation,
} from './managed-usage-accounting-service';

export const CLOUD_CODE_AGENT_MAX_STEPS = 24;
export const CLOUD_CODE_AGENT_MAX_DURATION_MS = CLOUD_CODE_TURN_BUDGET_MS;
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

export interface CloudCodeToolRunner {
  readFile(path: string): Promise<CloudCodeToolOutcome>;
  listFiles(path: string | undefined): Promise<CloudCodeToolOutcome>;
  runCommand(command: string, timeoutMs: number): Promise<CloudCodeToolOutcome>;
  runSharedExecutionTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CloudCodeToolOutcome>;
}

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
  usage: CloudCodeTurnUsage;
  finalMessage: string;
  pendingApproval?: CloudCodeApprovalRequest;
  messages: ProviderMessage[];
  errorMessage?: string;
}

export interface RunCloudCodeAgentTurnInput {
  adapter: ProviderAdapter;
  model: string;
  goal: string;
  runner: CloudCodeToolRunner;
  signal: AbortSignal;
  repositoryUrl?: string | null;
  workspacePath?: string;
  priorMessages?: ProviderMessage[];
  preApproved?: { toolUseId: string; command: string; approved: boolean };
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
  return `[${omitted} earlier characters omitted]\n${output.slice(output.length - limit)}`;
}

interface DrainedTurn {
  text: string;
  toolCalls: ToolUseBlock[];
  usage?: CloudCodeProviderCallUsage;
  /**
   * An adapter reports a provider failure as a chunk, not a throw. Dropping it
   * turned a refused or unpaid provider call into a turn that stopped for
   * `done` with nothing to show.
   */
  error?: string;
}

const EMPTY_PROVIDER_TURN_MESSAGE =
  'The model returned no answer and ran no commands. Nothing was changed in the environment.';

export type CloudCodeTurnUsage = ObservedProviderUsage;

type CloudCodeProviderCallUsage = Pick<
  ProviderUsageObservation,
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'
  | 'cacheWrite1hTokens'
  | 'reasoningTokens'
>;

export async function drainAssistantTurn(stream: AsyncIterable<StreamChunk>): Promise<DrainedTurn> {
  let text = '';
  let usage: CloudCodeProviderCallUsage | undefined;
  let error: string | undefined;
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
      case 'error':
        error ??= chunk.message;
        break;
      case 'usage':
        usage = {
          inputTokens: chunk.inputTokens ?? 0,
          outputTokens: chunk.outputTokens ?? 0,
          cacheReadTokens: chunk.cacheReadTokens ?? 0,
          cacheWriteTokens: chunk.cacheWriteTokens ?? 0,
          cacheWrite1hTokens: chunk.cacheWrite1hTokens ?? 0,
          reasoningTokens: chunk.reasoningTokens ?? 0,
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
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        input = {};
      }
    }
    toolCalls.push({ type: 'tool_use', id, name, input });
  }
  return { text, toolCalls, usage, ...(error ? { error } : {}) };
}

function toolResultBlock(toolUseId: string, outcome: CloudCodeToolOutcome): ContentBlock {
  return {
    type: 'tool_result',
    toolUseId,
    content: truncateToolOutput(outcome.output || (outcome.isError ? 'Tool failed.' : 'OK')),
    isError: outcome.isError,
  };
}

export async function runCloudCodeAgentTurn(
  input: RunCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const maxSteps = input.maxSteps ?? CLOUD_CODE_AGENT_MAX_STEPS;
  const maxDurationMs = input.maxDurationMs ?? CLOUD_CODE_AGENT_MAX_DURATION_MS;

  const commandDeadlineMs = (): number =>
    nestedDeadlineMs(CLOUD_CODE_COMMAND_DEADLINE_MS, maxDurationMs, now() - startedAt);

  const messages: ProviderMessage[] = input.priorMessages
    ? [...input.priorMessages]
    : [{ role: 'user', content: input.goal }];

  const tools = toProviderToolDefs();
  const system = buildSystemPrompt(input);
  let stepsUsed = 0;
  let finalMessage = '';

  if (input.preApproved) {
    const { toolUseId, command, approved } = input.preApproved;
    const outcome: CloudCodeToolOutcome = approved
      ? await input.runner.runCommand(command, commandDeadlineMs())
      : { output: `The user declined to run: ${command}`, isError: true };
    messages.push({ role: 'user', content: [toolResultBlock(toolUseId, outcome)] });
    await input.onEvent?.({
      type: 'tool-end',
      stepIndex: stepsUsed,
      toolName: CLOUD_CODE_RUN_COMMAND_TOOL,
      toolArgs: { command },
      output: outcome.output,
      isError: outcome.isError,
    });
  }

  const usage = createObservedProviderUsage();

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
      accumulateObservedProviderUsage(usage, drained.usage, {
        provider: input.adapter.id,
        model: input.model,
      });
    }

    if (drained.error) {
      return {
        stopReason: 'error',
        stepsUsed,
        finalMessage,
        messages,
        usage,
        errorMessage: drained.error,
      };
    }

    if (drained.text) {
      finalMessage = drained.text;
      await input.onEvent?.({ type: 'assistant-text', stepIndex: stepsUsed, text: drained.text });
    }

    if (drained.toolCalls.length === 0) {
      // Neither words nor work: there is nothing for the reader to read, so
      // this is a failed turn rather than a finished one.
      if (!finalMessage) {
        return {
          stopReason: 'error',
          stepsUsed,
          finalMessage,
          messages,
          usage,
          errorMessage: EMPTY_PROVIDER_TURN_MESSAGE,
        };
      }
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

      const shellCommand =
        call.name === CLOUD_CODE_RUN_COMMAND_TOOL
          ? { command: typeof call.input['command'] === 'string' ? call.input['command'] : '' }
          : call.name === EXECUTE_CODE_TOOL
            ? executeCodeAsShellCommand(call.input)
            : null;

      if (shellCommand && 'refused' in shellCommand) {
        outcome = { output: `Refused: ${shellCommand.refused}`, isError: true };
      } else if (shellCommand) {
        const { command } = shellCommand;
        const verdict = classifyCommandRisk(command);

        if (verdict.risk === 'denied') {
          outcome = { output: `Refused: ${verdict.reason}`, isError: true };
        } else if (verdict.risk === 'requires_approval') {
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
          outcome = await input.runner.runCommand(command, commandDeadlineMs());
        }
      } else if (call.name === CLOUD_CODE_READ_FILE_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : '';
        outcome = path
          ? await input.runner.readFile(path)
          : { output: 'read_file requires a "path".', isError: true };
      } else if (call.name === CLOUD_CODE_LIST_FILES_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : undefined;
        outcome = await input.runner.listFiles(path);
      } else if (isExecutionTool(call.name)) {
        outcome = await input.runner.runSharedExecutionTool(call.name, call.input);
      } else {
        outcome = {
          output: `Tool "${call.name}" is not available in Code sessions.`,
          isError: true,
        };
      }

      results.push(toolResultBlock(call.id, outcome));
      // The arguments travel with the END event too: the transcript labels each
      // row with the command line, and a step row recorded without them can
      // only ever show the bare tool name.
      await input.onEvent?.({
        type: 'tool-end',
        stepIndex: stepsUsed,
        toolName: call.name,
        toolArgs: call.input,
        output: outcome.output,
        isError: outcome.isError,
      });

      if (stepsUsed >= maxSteps) break;
    }

    messages.push({ role: 'user', content: results });
  }

  return { stopReason: 'max_steps', stepsUsed, finalMessage, messages, usage };
}
