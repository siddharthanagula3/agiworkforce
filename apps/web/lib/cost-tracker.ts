/**
 * Per-session cost tracker for web API routes.
 *
 * Architecture: module-level Map keyed by sessionId. Each value is a
 * Map<modelId, ModelUsage> accumulated within that session.
 *
 * Trade-offs vs reference (reference/src/cost-tracker.ts):
 *  - Reference persists to project config (CLI pattern). Web runs serverless;
 *    localStorage is unreachable from Next.js API routes. Module-level state
 *    survives warm Lambda instances and resets on cold start.
 *  - Durable cross-session persistence requires Supabase wiring — out of scope
 *    for R24; flagged as follow-up.
 *  - LRU eviction after MAX_SESSIONS prevents unbounded growth on warm instances.
 *
 * Pricing reads from models.json via @agiworkforce/types helpers. Cache pricing:
 *  - cache_read: 10% of input cost (Anthropic's published 90% discount).
 *  - cache_creation: 125% of input cost (Anthropic's 25% write surcharge).
 *  These constants mirror prompt-cache-helper.ts calculateCacheSavings().
 */

import 'server-only';

import { getModelMetadataById } from '@agiworkforce/types';

export interface ModelUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  requestCount: number;
  costUsd: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

// Maximum number of concurrent sessions tracked. Oldest session is evicted.
const MAX_SESSIONS = 1000;

// Map<sessionId, Map<modelId, ModelUsage>>
const sessionStore = new Map<string, Map<string, ModelUsage>>();

// Track insertion order for LRU eviction.
const sessionOrder: string[] = [];

function evictIfNeeded() {
  while (sessionOrder.length > MAX_SESSIONS) {
    const oldest = sessionOrder.shift();
    if (oldest) {
      sessionStore.delete(oldest);
    }
  }
}

/**
 * Calculate cost in USD for a model/usage pair.
 *
 * Pricing source: models.json via getModelMetadataById.
 *   inputCost / outputCost = USD per 1M tokens.
 *   cached_input = USD per 1M read tokens (when present in catalog).
 *
 * Fallback when model not in catalog: $0 (unknown model warning logged by caller).
 */
function calculateCostUsd(modelId: string, usage: NormalizedUsage): number {
  const meta = getModelMetadataById(modelId);
  if (!meta) {
    return 0;
  }

  const inputPerM = meta.inputCost ?? 0;
  const outputPerM = meta.outputCost ?? 0;

  // Use catalog cached_input price when available; fall back to 10% of input rate.
  // cached_input is a sparse optional field in the catalog not in the base type.
  const catalogCachedInput = (meta as unknown as Record<string, unknown>)['cached_input'];
  const cacheReadPerM =
    typeof catalogCachedInput === 'number' ? catalogCachedInput : inputPerM * 0.1;

  // Cache creation is charged at 125% of input rate (Anthropic: +25% write surcharge).
  const cacheCreationPerM = inputPerM * 1.25;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const cacheCreation = usage.cacheCreationInputTokens ?? 0;

  return (
    (inputTokens * inputPerM) / 1_000_000 +
    (outputTokens * outputPerM) / 1_000_000 +
    (cacheRead * cacheReadPerM) / 1_000_000 +
    (cacheCreation * cacheCreationPerM) / 1_000_000
  );
}

/**
 * Record usage for a model within a session.
 * Creates the session entry if it does not exist.
 */
export function recordModelUsage(sessionId: string, modelId: string, usage: NormalizedUsage): void {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, new Map());
    sessionOrder.push(sessionId);
    evictIfNeeded();
  }

  const sessionMap = sessionStore.get(sessionId)!;
  const existing = sessionMap.get(modelId) ?? {
    modelId,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    requestCount: 0,
    costUsd: 0,
  };

  existing.inputTokens += usage.inputTokens ?? 0;
  existing.outputTokens += usage.outputTokens ?? 0;
  existing.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  existing.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  existing.requestCount += 1;
  existing.costUsd += calculateCostUsd(modelId, usage);

  sessionMap.set(modelId, existing);
}

/**
 * Retrieve a snapshot of all model usage for the given session.
 * Returns an empty Map if the session has not been seen.
 * The returned Map is a deep copy — mutations do not affect the store.
 */
export function getModelUsageReport(sessionId: string): Map<string, ModelUsage> {
  const source = sessionStore.get(sessionId);
  if (!source) return new Map();
  // Deep-copy each ModelUsage so the caller cannot mutate the store.
  return new Map(Array.from(source.entries()).map(([k, v]) => [k, { ...v }]));
}

/**
 * Get total session cost in USD across all models.
 */
export function getSessionTotalCostUsd(sessionId: string): number {
  const report = sessionStore.get(sessionId);
  if (!report) return 0;
  let total = 0;
  for (const usage of report.values()) {
    total += usage.costUsd;
  }
  return total;
}

/**
 * Reset all usage data for a session (e.g., on session end or test teardown).
 */
export function resetModelUsage(sessionId: string): void {
  sessionStore.delete(sessionId);
  const idx = sessionOrder.indexOf(sessionId);
  if (idx !== -1) sessionOrder.splice(idx, 1);
}

/**
 * Reset all sessions. Primarily for tests.
 */
export function resetAllSessions(): void {
  sessionStore.clear();
  sessionOrder.length = 0;
}
