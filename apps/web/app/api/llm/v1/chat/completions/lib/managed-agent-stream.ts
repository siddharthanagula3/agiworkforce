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
  appendCloudAgentEvent,
  transitionCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';
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
  /** Durable owner notification, completed before the terminal event is exposed. */
  onTerminal?: (outcome: 'completed' | 'failed' | 'cancelled') => Promise<void>;
  /** A persisted approval boundary survives a client disconnect. */
  preserveAwaitingInputOnCancel?: () => boolean;
  /**
   * AUDIT-FIX SYS-21: the request view of the model that ACTUALLY served, after
   * any managed-failover rotation inside the loop. Settlement must price by it,
   * not by the primary that failed. Defaults to `processed`.
   */
  getServingRequest?: () => ProcessedRequest;
  /**
   * AUDIT-FIX BUG-10/STR-5: owner for server-side assistant-turn persistence.
   * When present (and the request carried `assistant_message_id`), the turn is
   * written server-side on completion AND on cancellation, so a tab close
   * mid-stream no longer loses a fully-generated, fully-billed turn.
   */
  userId?: string;
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
  let terminalReported = false;
  // AUDIT-FIX BUG-10/STR-5: accumulate the same visible prose the browser
  // accumulates, so a server-side save reproduces what the user actually saw.
  // Skipped entirely when the turn is not persistable (no conversation, no
  // assistant_message_id, or a Temporary Chat) so no work is done for nothing.
  const persistable = Boolean(input.userId) && canPersistAssistantTurn(input.processed);
  let assistantText = '';
  const interactiveCards = new Map<string, InteractiveCard>();
  let turnPersisted = false;

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
    if (!input.runJournal || lastTaskState === state) return;
    await transitionCloudAgentRun(input.runJournal.db, {
      userId: input.runJournal.userId,
      runId: input.runJournal.runId,
      state,
    });
    lastTaskState = state;
  };

  /**
   * The request view that reflects the model actually serving right now. The
   * managed-usage reservation and free-trial reservation are the PRIMARY's
   * (one reservation spans every attempt); only the provider/model used for
   * pricing and attribution follow the rotation.
   */
  const servingRequest = (): ProcessedRequest => input.getServingRequest?.() ?? input.processed;

  const settle = async (reason: string, outcome: 'completed' | 'failed' | 'cancelled') => {
    if (settled) return;
    const serving = servingRequest();
    if (input.processed.managedUsage) {
      await finalizeObservedManagedUsage({
        reservation: input.processed.managedUsage,
        provider: serving.provider,
        model: serving.chatRequest.model,
        usage: input.usage,
        reason,
        cancelled: outcome !== 'completed',
        // CPST Stage-0 telemetry, MANAGED CLOUD ONLY. Read from the SERVING
        // request view so a rotated attempt reports the route and retry count
        // that actually produced the bill. 'cancelled' is the agent's own
        // terminal signal, which is why it is not derived from the charge.
        cpst: buildCpstUsageFields(serving, {
          billingOutcome: outcome === 'completed' ? 'completed' : 'failed',
          ...(outcome === 'cancelled' ? { cancelled: true } : {}),
        }),
      });
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
              reportedFailure ? 'failed' : 'completed',
            );
            if (input.processed.managedUsage) {
              await markManagedUsageClientDelivered(input.processed.managedUsage).catch((error) => {
                logger.warn(
                  { error, requestId: input.processed.requestId },
                  'Managed agent delivery marker could not be persisted',
                );
              });
            }
            await persistTurn(false);
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
          if (input.runJournal) {
            for (const envelope of extractManagedAgentEventEnvelopes(next.value)) {
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
          if (input.runJournal) {
            await transitionJournal(
              input.preserveAwaitingInputOnCancel?.() ? 'awaiting_input' : 'cancelled',
            );
          }
          // AUDIT-FIX BUG-10/STR-5: an aborted turn is saved as
          // truncated-but-complete rather than vanishing. Billing has already
          // settled above, so the user is never charged for a turn with no
          // record of it.
          await persistTurn(true);
          await reportTerminal('cancelled');
        }
      }
    },
  });
}
