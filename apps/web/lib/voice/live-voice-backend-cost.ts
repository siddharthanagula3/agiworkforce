import 'server-only';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';

/**
 * `AGI-32`. A live voice session delegates to a backend responses model with
 * web search enabled, and the provider bills that model's tokens and those
 * search calls separately from the per-minute session rate. Only the session
 * rate reached the ledger, so every token the backend model spent, on every
 * voice session ever held, was invisible in `cogs_summary()`.
 *
 * This is a company-cost visibility gap and not a customer charge: the customer
 * pays the per-minute rate and nothing here adds to it, which is why every row
 * written here carries `customerCanonicalCents: 0`.
 *
 * The counts are reported by the client that held the WebRTC session, so they
 * are untrusted input: they are clamped to sane bounds before being priced, and
 * a report that claims nothing writes nothing.
 */

export const LIVE_VOICE_BACKEND_COST_SOURCE = 'live_voice_backend';

/** One session cannot plausibly exceed these, and a claim that does is truncated. */
const MAX_TOKENS_PER_SESSION = 10_000_000;
const MAX_SEARCH_CALLS_PER_SESSION = 500;

export interface LiveVoiceBackendUsage {
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  webSearchCalls?: number | null;
}

function clamp(value: number | null | undefined, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), max);
}

export interface RecordLiveVoiceBackendCostInput {
  userId: string;
  organizationId?: string | null;
  provider: string;
  sessionId: string;
  surface?: string | null;
  backendModel: string | null | undefined;
  reported: LiveVoiceBackendUsage;
}

/**
 * Writes the backend model's spend as its own cost event, keyed on the session
 * so a retried close cannot double-count it.
 */
export async function recordLiveVoiceBackendCost(
  input: RecordLiveVoiceBackendCostInput,
): Promise<void> {
  const model = input.reported.model?.trim() || input.backendModel?.trim() || null;
  const promptTokens = clamp(input.reported.inputTokens, MAX_TOKENS_PER_SESSION);
  const completionTokens = clamp(input.reported.outputTokens, MAX_TOKENS_PER_SESSION);
  const cachedTokens = Math.min(
    clamp(input.reported.cachedTokens, MAX_TOKENS_PER_SESSION),
    promptTokens,
  );
  const searchCalls = clamp(input.reported.webSearchCalls, MAX_SEARCH_CALLS_PER_SESSION);

  // The backend model's web_search is the PROVIDER's own tool, not the app's
  // Perplexity fallback and not Google grounding, and the rate card publishes a
  // price for neither of those two things here. Pricing these calls at another
  // vendor's rate would put a false number in the ledger under a provider that
  // never billed it, so the count is carried on the row and the money is left
  // out until a rate exists. Counted and unpriced beats priced and wrong.
  if (searchCalls > 0) {
    logger.info(
      { sessionId: input.sessionId, provider: input.provider, searchCalls },
      'Live voice backend web_search calls recorded without a published unit rate',
    );
  }

  if (promptTokens === 0 && completionTokens === 0) return;
  if (!model) {
    logger.warn(
      { sessionId: input.sessionId, userId: input.userId },
      'Live voice backend usage reported without a model; cost cannot be priced',
    );
    return;
  }

  const usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  const costCents = LLMCostCalculator.calculateCost(input.provider, model, usage);

  try {
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      provider: input.provider,
      model,
      actualCostCents: costCents,
      // Keyed on the session, so the retry of a close that already settled
      // collides on `source_ref` and is discarded rather than counted twice.
      sourceRef: `${LIVE_VOICE_BACKEND_COST_SOURCE}:${input.sessionId}`,
      taskOutcome: 'delivered',
      taskRef: `voice-live:${input.sessionId}`,
      // No `feature`: that field names a rate-card unit price, and this is a
      // token-priced chat call. `delegatedFrom` in the metadata is what marks
      // the row as voice spend rather than an ordinary turn.
      surface: input.surface ?? null,
      // The per-minute session rate is the whole customer charge. This row is
      // COGS only, and a non-zero value here would bill the session twice.
      customerCanonicalCents: 0,
      usage: {
        operation: 'chat',
        sessionId: input.sessionId,
        promptTokens,
        completionTokens,
        cachedTokens,
        totalTokens: usage.totalTokens,
        webSearchCalls: searchCalls,
        delegatedFrom: 'voice_live',
      },
    });
  } catch (error) {
    logger.warn(
      { error, sessionId: input.sessionId, userId: input.userId },
      'Live voice backend cost was not recorded',
    );
  }
}
