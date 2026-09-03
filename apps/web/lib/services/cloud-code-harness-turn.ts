import 'server-only';

import type { AgentEvent, AgentEventStopReason, JsonValue } from '@agiworkforce/types/protocol';
import type { E2BExecutor } from '@/lib/e2b/types';
import {
  HARNESS_MAX_TURNS,
  createExecutorProcessPort,
  harnessRunDeadlineMs,
  readHarnessSessionId,
  runHarness,
  writeHarnessSessionId,
  type HarnessRunner,
  type HarnessUsageReport,
} from '@/lib/e2b/harnesses';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
} from './managed-usage-accounting-service';
import type {
  CloudCodeAgentEvent,
  CloudCodeAgentResult,
  CloudCodeAgentStopReason,
} from './cloud-code-agent-loop';

const HARNESS_UNAVAILABLE_MESSAGE = 'This sandbox cannot run the selected coding harness.';
const MAX_TOOL_NAME_LENGTH = 64;

function mapStopReason(reason: AgentEventStopReason): CloudCodeAgentStopReason {
  if (reason === 'end-turn') return 'done';
  if (reason === 'cancelled') return 'cancelled';
  if (reason === 'max-tokens') return 'max_steps';
  return 'error';
}

function hasReportedUsage(usage: HarnessUsageReport): boolean {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cacheReadTokens !== undefined ||
    usage.cacheWriteTokens !== undefined ||
    usage.reasoningTokens !== undefined ||
    usage.costUsd !== undefined
  );
}

function asRecord(value: JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: JsonValue): string {
  if (typeof value === 'string') return value;
  return value === null ? '' : JSON.stringify(value);
}

export function createHarnessStepProjector(): (event: AgentEvent) => CloudCodeAgentEvent | null {
  const argsByToolCall = new Map<string, Record<string, unknown>>();
  let stepIndex = 0;

  return (event) => {
    if (event.type === 'text-delta') {
      return { type: 'assistant-text', stepIndex, text: event.delta };
    }
    if (event.type === 'tool-execution-start') {
      const args = asRecord(event.input);
      argsByToolCall.set(event.toolCallId, args);
      stepIndex += 1;
      return {
        type: 'tool-start',
        stepIndex,
        toolName: event.name.slice(0, MAX_TOOL_NAME_LENGTH),
        toolArgs: args,
      };
    }
    if (event.type === 'tool-execution-end') {
      const args = argsByToolCall.get(event.toolCallId) ?? {};
      argsByToolCall.delete(event.toolCallId);
      return {
        type: 'tool-end',
        stepIndex,
        toolName: event.name.slice(0, MAX_TOOL_NAME_LENGTH),
        toolArgs: args,
        output: asText(event.output),
        isError: event.isError,
      };
    }
    return null;
  };
}

export interface RunCloudCodeHarnessTurnInput {
  runner: HarnessRunner;
  executor: E2BExecutor;
  goal: string;
  workspacePath: string;
  provider: string;
  model: string;
  signal: AbortSignal;
  maxDurationMs?: number;
  elapsedMs?: number;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

export async function runCloudCodeHarnessTurn(
  input: RunCloudCodeHarnessTurnInput,
): Promise<CloudCodeAgentResult> {
  const usage = createObservedProviderUsage();
  const port = createExecutorProcessPort(input.executor);
  if (!port) {
    return {
      stopReason: 'error',
      stepsUsed: 0,
      usage,
      finalMessage: '',
      messages: [],
      errorMessage: HARNESS_UNAVAILABLE_MESSAGE,
    };
  }

  const resumeSessionId = input.runner.supportsResume
    ? await readHarnessSessionId(input.executor, input.runner.runtimeId)
    : null;

  let stepsUsed = 0;
  const result = await runHarness({
    runner: input.runner,
    port,
    request: {
      prompt: input.goal,
      workspacePath: input.workspacePath,
      maxTurns: HARNESS_MAX_TURNS,
      timeoutMs: harnessRunDeadlineMs(input.maxDurationMs, input.elapsedMs ?? 0),
      ...(resumeSessionId ? { resumeSessionId } : {}),
    },
    signal: input.signal,
    onEvent: async (event) => {
      if (event.type === 'tool-execution-end') stepsUsed += 1;
      await input.onEvent?.(event);
    },
  });

  const { outcome } = result;
  if (input.runner.supportsResume && outcome.sessionId) {
    await writeHarnessSessionId(input.executor, input.runner.runtimeId, outcome.sessionId);
  }

  if (outcome.usage && hasReportedUsage(outcome.usage)) {
    const reported = outcome.usage;
    accumulateObservedProviderUsage(
      usage,
      {
        inputTokens: reported.inputTokens ?? 0,
        outputTokens: reported.outputTokens ?? 0,
        cacheReadTokens: reported.cacheReadTokens ?? 0,
        cacheWriteTokens: reported.cacheWriteTokens ?? 0,
        reasoningTokens: reported.reasoningTokens ?? 0,
        ...(reported.costUsd !== undefined ? { providerReportedCostUsd: reported.costUsd } : {}),
      },
      { provider: input.provider, model: input.model },
    );
  }

  return {
    stopReason: mapStopReason(outcome.stopReason),
    stepsUsed,
    usage,
    finalMessage: outcome.finalText,
    messages: [],
    ...(outcome.errorMessage ? { errorMessage: outcome.errorMessage } : {}),
  };
}
