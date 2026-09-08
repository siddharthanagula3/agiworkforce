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
import { upstreamFailureCopy } from '@/app/api/llm/v1/chat/completions/lib/upstream-error-copy';
import { logger } from '@/lib/logger';
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

const MAX_LOGGED_PROVIDER_FAILURE_CHARS = 2_000;
const NEUTRAL_PROVIDER_LABEL = 'the model provider';
const PROVIDER_OPERATION_PREFIX = 'provider:';
const TOOL_OPERATION_PREFIX = 'tool:';

/**
 * Reads may be replayed after an outcome nobody observed; anything that runs in
 * the workspace may not, because a replay runs it again.
 */
export function cloudCodeToolRetrySafety(toolName: string): CloudCodeRetrySafety {
  return toolName === CLOUD_CODE_READ_FILE_TOOL || toolName === CLOUD_CODE_LIST_FILES_TOOL
    ? 'safe'
    : 'unsafe';
}

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

/**
 * How a provider call or a tool call is actually performed.
 *
 * Inline they are performed directly, which is the default and the behaviour
 * this loop has always had. Durably each one is a separately recorded step, so
 * an invocation that dies mid-turn resumes from the last one that finished
 * instead of replaying the whole turn. The loop does not know or care which:
 * it hands over a key, a retry-safety classification, and a thunk.
 */
export interface CloudCodeProviderStepRequest {
  operationKey: string;
  step: number;
  execute: () => Promise<DrainedTurn>;
}

export type CloudCodeRetrySafety = 'safe' | 'unsafe';

export interface CloudCodeToolStepRequest {
  operationKey: string;
  step: number;
  toolName: string;
  args: Record<string, unknown>;
  /**
   * `safe` may be replayed after an unknown outcome; `unsafe` may not. A read
   * is safe. Anything that runs a command in the workspace is not: replaying it
   * would run it a second time.
   */
  retrySafety: CloudCodeRetrySafety;
  execute: () => Promise<CloudCodeToolOutcome>;
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
  /**
   * Read between steps and before every tool call. A stop arrives as a row in
   * another request, not as an abort on this one's signal, so the loop asks
   * rather than waits: what it must not do after a stop is issue the next side
   * effect.
   */
  isCancelled?: () => boolean;
  onStepCommitted?: (stepIndex: number) => Promise<void> | void;
  providerExecutor?: (request: CloudCodeProviderStepRequest) => Promise<DrainedTurn>;
  toolExecutor?: (request: CloudCodeToolStepRequest) => Promise<CloudCodeToolOutcome>;
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

export interface DrainedTurn {
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

function providerFailureMessage(
  error: unknown,
  input: RunCloudCodeAgentTurnInput,
  stepIndex: number,
): string {
  const failure = upstreamFailureCopy(error, input.adapter.id);
  const message = withoutVendorName(failure.message, input.adapter.id);
  logger.error(
    {
      provider: input.adapter.id,
      model: input.model,
      stepIndex,
      code: failure.code,
      upstream: rawProviderFailure(error).slice(0, MAX_LOGGED_PROVIDER_FAILURE_CHARS),
    },
    '[code] provider failed an agent turn step',
  );
  return message;
}

function withoutVendorName(message: string, provider: string): string {
  if (!provider) return message;
  const named = new RegExp(`\\b${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  if (!named.test(message)) return message;
  const neutral = message.replace(named, NEUTRAL_PROVIDER_LABEL);
  return neutral.charAt(0).toUpperCase() + neutral.slice(1);
}

function rawProviderFailure(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
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
    if (input.signal.aborted || input.isCancelled?.()) {
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
      const runProviderStep = () => drainAssistantTurn(input.adapter.stream(request, input.signal));
      drained = input.providerExecutor
        ? await input.providerExecutor({
            operationKey: `${PROVIDER_OPERATION_PREFIX}${stepsUsed}`,
            step: stepsUsed,
            execute: runProviderStep,
          })
        : await runProviderStep();
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
        errorMessage: providerFailureMessage(error, input, stepsUsed),
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
        errorMessage: providerFailureMessage(drained.error, input, stepsUsed),
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
      if (input.isCancelled?.()) {
        if (results.length > 0) messages.push({ role: 'user', content: results });
        return { stopReason: 'cancelled', stepsUsed, finalMessage, messages, usage };
      }
      stepsUsed += 1;
      await input.onEvent?.({
        type: 'tool-start',
        stepIndex: stepsUsed,
        toolName: call.name,
        toolArgs: call.input,
      });

      let outcome: CloudCodeToolOutcome;

      // Only the branches that actually reach the workspace go through the
      // executor. A refusal and an unknown tool produce their answer here and
      // touch nothing, so recording them as durable steps would be ceremony.
      const runToolStep = (
        execute: () => Promise<CloudCodeToolOutcome>,
      ): Promise<CloudCodeToolOutcome> =>
        input.toolExecutor
          ? input.toolExecutor({
              operationKey: `${TOOL_OPERATION_PREFIX}${stepsUsed}:${call.id}`,
              step: stepsUsed,
              toolName: call.name,
              args: call.input,
              retrySafety: cloudCodeToolRetrySafety(call.name),
              execute,
            })
          : execute();

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
          outcome = await runToolStep(() => input.runner.runCommand(command, commandDeadlineMs()));
        }
      } else if (call.name === CLOUD_CODE_READ_FILE_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : '';
        outcome = path
          ? await runToolStep(() => input.runner.readFile(path))
          : { output: 'read_file requires a "path".', isError: true };
      } else if (call.name === CLOUD_CODE_LIST_FILES_TOOL) {
        const path = typeof call.input['path'] === 'string' ? call.input['path'] : undefined;
        outcome = await runToolStep(() => input.runner.listFiles(path));
      } else if (isExecutionTool(call.name)) {
        outcome = await runToolStep(() =>
          input.runner.runSharedExecutionTool(call.name, call.input),
        );
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
