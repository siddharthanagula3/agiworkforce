import 'server-only';

import { logger } from '@/lib/logger';
import {
  finalizeObservedManagedUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { markManagedUsageClientDelivered } from '@/lib/services/managed-usage-request-service';
import { recordFreeTrialTokens } from '@/lib/services/free-trial-service';
import {
  appendCloudAgentEvent,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import type { ProcessedRequest } from './request-processor';

const TERMINAL_EVENT = 'data: [DONE]\n\n';

function isTerminalEvent(value: Uint8Array): boolean {
  return new TextDecoder().decode(value).trim() === 'data: [DONE]';
}

function containsReportedFailure(value: Uint8Array): boolean {
  const text = new TextDecoder().decode(value);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const event = JSON.parse(line.slice(6)) as {
        choices?: Array<{
          delta?: {
            x_stream_error?: unknown;
            x_research_status?: { phase?: unknown };
          };
        }>;
      };
      const delta = event.choices?.[0]?.delta;
      if (delta?.x_stream_error !== undefined || delta?.x_research_status?.phase === 'error') {
        return true;
      }
    } catch {
      // Non-JSON/custom SSE events are forwarded unchanged and are not treated
      // as a billing outcome signal.
    }
  }
  return false;
}

function extractAgentEventEnvelopes(value: Uint8Array): AgentEventEnvelope[] {
  const envelopes: AgentEventEnvelope[] = [];
  const text = new TextDecoder().decode(value);
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      for (const choice of payload.choices ?? []) {
        const envelope = parseAgentEventDelta(choice.delta?.x_agent_event);
        if (envelope) envelopes.push(envelope);
      }
    } catch {
      // Other OpenAI-compatible/custom events are not canonical activity.
    }
  }
  return envelopes;
}

export interface ManagedAgentStreamInput {
  generator: AsyncGenerator<Uint8Array, unknown>;
  processed: ProcessedRequest;
  usage: ObservedProviderUsage;
  completionReason: string;
  cancellationReason: string;
  runJournal?: {
    db: DatabaseAdapter;
    userId: string;
    runId: string;
  };
}

/**
 * Adapt a custom research/tool generator to a response stream while enforcing
 * the managed-billing terminal invariant: provider usage is durably settled
 * before `[DONE]` becomes visible to the client. Generator-owned terminal
 * events are consumed and exactly one route-owned terminal event is emitted.
 */
export function buildManagedAgentStream(
  input: ManagedAgentStreamInput,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let settled = false;
  let reportedFailure = false;
  let lastTaskState: AgentTaskState | undefined;

  const transitionJournal = async (state: AgentTaskState) => {
    if (!input.runJournal || lastTaskState === state) return;
    await transitionCloudAgentRun(input.runJournal.db, {
      userId: input.runJournal.userId,
      runId: input.runJournal.runId,
      state,
    });
    lastTaskState = state;
  };

  const settle = async (reason: string, cancelled: boolean) => {
    if (settled) return;
    if (input.processed.managedUsage) {
      await finalizeObservedManagedUsage({
        reservation: input.processed.managedUsage,
        provider: input.processed.provider,
        model: input.processed.chatRequest.model,
        usage: input.usage,
        reason,
        cancelled,
      });
    } else if (input.processed.freeTrial) {
      await recordFreeTrialTokens({
        userId: input.processed.freeTrial.userId,
        requestId: input.processed.freeTrial.requestId,
        tokens: input.usage.inputTokens + input.usage.outputTokens,
      });
    }
    settled = true;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // A generator may already emit [DONE]. Consume it and continue pulling
        // until the generator itself terminates; only then can settlement run.
        while (true) {
          const next = await input.generator.next();
          if (next.done) {
            if (input.runJournal) {
              if (reportedFailure) {
                await transitionJournal('failed');
              } else if (
                lastTaskState === undefined ||
                lastTaskState === 'queued' ||
                lastTaskState === 'running' ||
                lastTaskState === 'paused'
              ) {
                await transitionJournal('ready_for_review');
              }
            }
            await settle(
              reportedFailure
                ? `${input.completionReason}_reported_failure`
                : input.completionReason,
              reportedFailure,
            );
            if (input.processed.managedUsage) {
              await markManagedUsageClientDelivered(input.processed.managedUsage).catch((error) => {
                logger.warn(
                  { error, requestId: input.processed.requestId },
                  'Managed agent delivery marker could not be persisted',
                );
              });
            }
            controller.enqueue(encoder.encode(TERMINAL_EVENT));
            controller.close();
            return;
          }
          if (isTerminalEvent(next.value)) continue;
          if (containsReportedFailure(next.value)) reportedFailure = true;
          if (input.runJournal) {
            for (const envelope of extractAgentEventEnvelopes(next.value)) {
              const run = await appendCloudAgentEvent(input.runJournal.db, {
                userId: input.runJournal.userId,
                runId: input.runJournal.runId,
                envelope,
              });
              lastTaskState = run.state;
            }
          }
          controller.enqueue(next.value);
          return;
        }
      } catch (error) {
        try {
          await input.generator.return(undefined);
        } catch {
          // Preserve the original stream failure.
        }
        try {
          await settle(`${input.completionReason}_stream_failed`, true);
        } catch (settlementError) {
          logger.error(
            { settlementError, requestId: input.processed.requestId },
            'Managed agent failure settlement could not be persisted',
          );
        }
        if (input.runJournal) {
          await transitionJournal('failed').catch((journalError) => {
            logger.error(
              { journalError, requestId: input.processed.requestId },
              'Managed agent failure state could not be persisted',
            );
          });
        }
        controller.error(error);
      }
    },
    async cancel() {
      try {
        await input.generator.return(undefined);
      } finally {
        try {
          await settle(input.cancellationReason, true);
        } finally {
          if (input.runJournal) await transitionJournal('cancelled');
        }
      }
    },
  });
}
