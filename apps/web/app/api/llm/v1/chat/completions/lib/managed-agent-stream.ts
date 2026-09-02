import 'server-only';

import { logger } from '@/lib/logger';
import {
  calculateObservedProviderUsageCostDollars,
  finalizeObservedManagedUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { markManagedUsageClientDelivered } from '@/lib/services/managed-usage-request-service';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import {
  recordCloudAgentRunSettledUsage,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
import { createCloudAgentEventJournal } from '@/lib/services/cloud-agent-event-journal';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE, type InteractiveCard } from '@agiworkforce/types';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import type { ProcessedRequest } from './request-processor';
import {
  canPersistAssistantTurn,
  extractAssistantTextDelta,
  persistAssistantTurn,
} from './assistant-turn-persistence';
import { extractAssistantInteractiveCardDeltas } from './interactive-card-stream';

const TERMINAL_EVENT = 'data: [DONE]\n\n';

export function isManagedAgentTerminalEvent(value: Uint8Array): boolean {
  return new TextDecoder().decode(value).trim() === 'data: [DONE]';
}

export function containsManagedAgentReportedFailure(value: Uint8Array): boolean {
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

export function extractManagedAgentEventEnvelopes(value: Uint8Array): AgentEventEnvelope[] {
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
  onTerminal?: (outcome: 'completed' | 'failed' | 'cancelled') => Promise<void>;
  preserveAwaitingInputOnCancel?: () => boolean;
  getServingRequest?: () => ProcessedRequest;
  userId?: string;
}

export function buildManagedAgentStream(
  input: ManagedAgentStreamInput,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let settled = false;
  let reportedFailure = false;
  let lastTaskState: AgentTaskState | undefined;
  let terminalReported = false;
  const persistable = Boolean(input.userId) && canPersistAssistantTurn(input.processed);
  let assistantText = '';
  const interactiveCards = new Map<string, InteractiveCard>();
  let turnPersisted = false;
  const journal = input.runJournal ? createCloudAgentEventJournal(input.runJournal) : null;

  const flushJournal = async (): Promise<void> => {
    if (!journal) return;
    const state = await journal.flush();
    if (state !== undefined) lastTaskState = state;
  };

  const persistTurn = async (truncated: boolean): Promise<void> => {
    if (!persistable || turnPersisted || !input.userId) return;
    turnPersisted = true;
    const serving = input.getServingRequest?.() ?? input.processed;
    await persistAssistantTurn({
      processed: input.processed,
      userId: input.userId,
      snapshot: {
        content: assistantText,
        model: serving.chatRequest.model,
        provider: serving.provider,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        truncated,
        interactiveCards: [...interactiveCards.values()],
      },
    });
  };

  const reportTerminal = async (outcome: 'completed' | 'failed' | 'cancelled') => {
    if (terminalReported) return;
    await input.onTerminal?.(outcome);
    terminalReported = true;
  };

  const transitionJournal = async (state: AgentTaskState) => {
    if (!input.runJournal) return;
    // Buffered deltas must land before the run row moves, so a replaying client
    // never sees a terminal run whose last events are still in memory. A failed
    // flush is logged rather than rethrown: losing the tail of the text deltas
    // is recoverable — the assistant turn is persisted from its own buffer —
    // whereas failing to record the terminal state strands the run.
    await flushJournal().catch((error: unknown) => {
      logger.warn(
        { error, requestId: input.processed.requestId },
        'Buffered cloud agent events could not be journaled before the run transition',
      );
    });
    if (lastTaskState === state) return;
    await transitionCloudAgentRun(input.runJournal.db, {
      userId: input.runJournal.userId,
      runId: input.runJournal.runId,
      state,
    });
    lastTaskState = state;
  };

  const servingRequest = (): ProcessedRequest => input.getServingRequest?.() ?? input.processed;

  const recordRunUsage = async (costCents: number | null, settlementKey: string) => {
    if (!input.runJournal) return;
    try {
      await recordCloudAgentRunSettledUsage(input.runJournal.db, {
        userId: input.runJournal.userId,
        runId: input.runJournal.runId,
        billingIdempotencyKey: settlementKey,
        usage: {
          providerCalls: input.usage.providerCalls,
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          reasoningTokens: input.usage.reasoningTokens,
          costCents,
        },
      });
    } catch (error) {
      logger.warn(
        { error, requestId: input.processed.requestId },
        'Per-task usage could not be recorded on the cloud agent run',
      );
    }
  };

  const settle = async (reason: string, outcome: 'completed' | 'failed' | 'cancelled') => {
    if (settled) return;
    const serving = servingRequest();
    if (input.processed.managedUsage) {
      const finalization = await finalizeObservedManagedUsage({
        reservation: input.processed.managedUsage,
        provider: serving.provider,
        model: serving.chatRequest.model,
        usage: input.usage,
        reason,
        cancelled: outcome !== 'completed',
        cpst: buildCpstUsageFields(serving, {
          billingOutcome: outcome === 'completed' ? 'completed' : 'failed',
          ...(outcome === 'cancelled' ? { cancelled: true } : {}),
        }),
      });
      await recordRunUsage(
        finalization.actualCostCents,
        input.processed.managedUsage.idempotencyKey,
      );
    } else if (input.processed.freeTrial) {
      const inputTokens = input.usage.inputTokens;
      const outputTokens = input.usage.outputTokens;
      await settleFreeTrialRequest({
        reservation: input.processed.freeTrial,
        outcome,
        provider: serving.provider,
        model: serving.chatRequest.model,
        measuredCostDollars: calculateObservedProviderUsageCostDollars(input.usage, {
          provider: serving.provider,
          model: serving.chatRequest.model,
        }),
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          cacheReadInputTokens: input.usage.cacheReadTokens,
          cacheCreationInputTokens: input.usage.cacheWriteTokens,
          cacheCreation1hInputTokens: input.usage.cacheWrite1hTokens,
        },
      });
      await recordRunUsage(null, input.processed.freeTrial.requestId);
    }
    settled = true;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const next = await input.generator.next();
          if (next.done) {
            if (input.runJournal) {
              await flushJournal();
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
              reportedFailure ? 'failed' : 'completed',
            );
            if (input.processed.managedUsage && !reportedFailure) {
              await markManagedUsageClientDelivered(input.processed.managedUsage).catch((error) => {
                logger.warn(
                  { error, requestId: input.processed.requestId },
                  'Managed agent delivery marker could not be persisted',
                );
              });
            }
            await persistTurn(reportedFailure);
            await reportTerminal(reportedFailure ? 'failed' : 'completed');
            controller.enqueue(encoder.encode(TERMINAL_EVENT));
            controller.close();
            return;
          }
          if (isManagedAgentTerminalEvent(next.value)) continue;
          if (containsManagedAgentReportedFailure(next.value)) reportedFailure = true;
          if (persistable) {
            assistantText += extractAssistantTextDelta(next.value);
            for (const card of extractAssistantInteractiveCardDeltas(next.value)) {
              if (
                interactiveCards.has(card.cardId) ||
                interactiveCards.size < INTERACTIVE_CARDS_MAX_PER_MESSAGE
              ) {
                interactiveCards.set(card.cardId, card);
              }
            }
          }
          if (journal) {
            for (const envelope of extractManagedAgentEventEnvelopes(next.value)) {
              const state = await journal.append(envelope);
              if (state !== undefined) lastTaskState = state;
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
          await settle(`${input.completionReason}_stream_failed`, 'failed');
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
        await reportTerminal('failed').catch((terminalError) => {
          logger.error(
            { terminalError, requestId: input.processed.requestId },
            'Managed agent terminal owner could not record failure',
          );
        });
        await persistTurn(true).catch((persistError) => {
          logger.error(
            { persistError, requestId: input.processed.requestId },
            'Managed agent failure marker could not be persisted',
          );
        });
        controller.error(error);
      }
    },
    async cancel() {
      try {
        await input.generator.return(undefined);
      } finally {
        try {
          await settle(input.cancellationReason, 'cancelled');
        } finally {
          const awaitingInput = input.preserveAwaitingInputOnCancel?.() ?? false;
          if (input.runJournal) {
            await transitionJournal(awaitingInput ? 'awaiting_input' : 'cancelled');
          }
          if (!awaitingInput) {
            await persistTurn(true);
          }
          await reportTerminal('cancelled');
        }
      }
    },
  });
}
