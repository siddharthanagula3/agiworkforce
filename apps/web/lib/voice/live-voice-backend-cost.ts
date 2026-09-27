import 'server-only';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { LLMCostCalculator, normalizeProviderId } from '@/lib/services/llm-cost-calculator';
import { nativeServerToolMicrousdPerRequest } from '@/lib/web-search/native-search-pricing';

/**
 * `AGI-32`. A live voice session delegates to a backend responses model with
 * web search enabled, and the provider bills that model's tokens and those
 * search calls separately from the per-minute session rate. Only the session
 * rate reached the ledger, so every token the backend model spent, on every
 * voice session ever held, was invisible in `cogs_summary()`.
 *
 * The session's own settlement charges this spend to the customer at provider
 * cost, inside the reservation it already holds, so the cost row written here
 * carries `customerCanonicalCents: 0` and is never billed a second time.
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

export interface LiveVoiceBackendCost {
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  searchCalls: number;
  tokenCostMicrousd: number;
  searchCostMicrousd: number;
  totalMicrousd: number;
}

export function priceLiveVoiceBackend(
  input: Pick<RecordLiveVoiceBackendCostInput, 'provider' | 'backendModel' | 'reported'>,
): LiveVoiceBackendCost {
  const model = input.reported.model?.trim() || input.backendModel?.trim() || null;
  const promptTokens = clamp(input.reported.inputTokens, MAX_TOKENS_PER_SESSION);
  const completionTokens = clamp(input.reported.outputTokens, MAX_TOKENS_PER_SESSION);
  const cachedTokens = Math.min(
    clamp(input.reported.cachedTokens, MAX_TOKENS_PER_SESSION),
    promptTokens,
  );
  const searchCalls = clamp(input.reported.webSearchCalls, MAX_SEARCH_CALLS_PER_SESSION);
  const tokenCostMicrousd =
    model && (promptTokens > 0 || completionTokens > 0)
      ? LLMCostCalculator.calculateCostMicrousd(input.provider, model, {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        })
      : 0;
  const providerId = normalizeProviderId(input.provider);
  const searchCostMicrousd =
    searchCalls > 0 && providerId
      ? searchCalls * nativeServerToolMicrousdPerRequest(providerId, 'web_search')
      : 0;
  return {
    model,
    promptTokens,
    completionTokens,
    cachedTokens,
    searchCalls,
    tokenCostMicrousd,
    searchCostMicrousd,
    totalMicrousd: tokenCostMicrousd + searchCostMicrousd,
  };
}

/**
 * Writes the backend model's spend as its own cost event, keyed on the session
 * so a retried close cannot double-count it.
 */
export async function recordLiveVoiceBackendCost(
  input: RecordLiveVoiceBackendCostInput,
): Promise<void> {
  const cost = priceLiveVoiceBackend(input);
  if (cost.searchCalls > 0 && cost.searchCostMicrousd === 0) {
    logger.info(
      { sessionId: input.sessionId, provider: input.provider, searchCalls: cost.searchCalls },
      'Live voice backend web_search calls recorded without a published unit rate',
    );
  }
  if (cost.totalMicrousd === 0) return;
  if (
    !cost.model &&
    cost.tokenCostMicrousd === 0 &&
    (cost.promptTokens > 0 || cost.completionTokens > 0)
  ) {
    logger.warn(
      { sessionId: input.sessionId, userId: input.userId },
      'Live voice backend usage reported without a model; token cost cannot be priced',
    );
  }

  try {
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      provider: input.provider,
      model: cost.model,
      actualCostCents: ledgerCentsFromMicrousd(cost.totalMicrousd),
      providerEstimatedCostMicrousd: cost.totalMicrousd,
      sourceRef: `${LIVE_VOICE_BACKEND_COST_SOURCE}:${input.sessionId}`,
      taskOutcome: 'delivered',
      taskRef: `voice-live:${input.sessionId}`,
      surface: input.surface ?? null,
      customerCanonicalCents: 0,
      usage: {
        operation: 'chat',
        sessionId: input.sessionId,
        promptTokens: cost.promptTokens,
        completionTokens: cost.completionTokens,
        cachedTokens: cost.cachedTokens,
        totalTokens: cost.promptTokens + cost.completionTokens,
        webSearchCalls: cost.searchCalls,
        searchCostMicrousd: cost.searchCostMicrousd,
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
