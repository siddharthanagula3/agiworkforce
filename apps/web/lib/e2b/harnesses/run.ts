import type { AgentEvent } from '@agiworkforce/types/protocol';
import { MAX_ERROR_MESSAGE_LENGTH } from './limits';
import type {
  HarnessOutcome,
  HarnessProcessPort,
  HarnessRunRequest,
  HarnessRunner,
  HarnessStream,
  HarnessUsageReport,
} from './types';

export interface RunHarnessInput {
  runner: HarnessRunner;
  port: HarnessProcessPort;
  request: HarnessRunRequest;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void | Promise<void>;
}

export interface RunHarnessResult {
  command: string;
  exitCode: number;
  outcome: HarnessOutcome;
}

function usageEvent(usage: HarnessUsageReport): AgentEvent {
  return {
    type: 'usage',
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
    ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
  };
}

export async function runHarness(input: RunHarnessInput): Promise<RunHarnessResult> {
  const command = input.runner.buildCommand(input.request);
  const parser = input.runner.createParser(input.request);

  let queue: Promise<void> = Promise.resolve();
  const emit = (events: readonly AgentEvent[]): void => {
    for (const event of events) {
      queue = queue.then(() => input.onEvent(event));
    }
  };
  const consume = (line: string, stream: HarnessStream): void => {
    if (input.signal.aborted) return;
    emit(parser.push(line, stream));
  };

  const process = await input.port.run({
    command,
    cwd: input.request.workspacePath,
    timeoutMs: input.request.timeoutMs,
    signal: input.signal,
    onStdout: (line) => consume(line, 'stdout'),
    onStderr: (line) => consume(line, 'stderr'),
  });

  const flushed = parser.finish(process.exitCode);
  emit(flushed.events);

  const aborted = input.signal.aborted;
  const errorMessage =
    flushed.outcome.errorMessage ?? process.error?.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  const outcome: HarnessOutcome = {
    ...flushed.outcome,
    ...(aborted ? { stopReason: 'cancelled' as const } : {}),
    ...(errorMessage && !aborted ? { errorMessage } : {}),
  };

  if (outcome.usage) emit([usageEvent(outcome.usage)]);
  emit([{ type: 'stop', reason: outcome.stopReason }]);
  await queue;

  return { command, exitCode: process.exitCode, outcome };
}
