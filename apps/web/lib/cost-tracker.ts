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
 *  - Durable cross-session persistence requires Neon wiring · out of scope
 *    for R24; flagged as follow-up.
 *  - LRU eviction after MAX_SESSIONS prevents unbounded growth on warm instances.
 *
 * Pricing reads from models.json via @agiworkforce/types helpers, resolved for an
 * explicit date (models may carry dated `pricingSchedule` windows). Cache pricing
 * uses the catalog's own rates when declared; the fallbacks are:
 *  - cache_read: 10% of input cost (published 90% cache-read discount).
 *  - cache_creation: 125% / 200% of input cost for Anthropic-style disjoint
 *    accounting (5m / 1h TTL), and the plain input rate for inclusive-prompt
 *    providers, i.e. no surcharge for a model that declares no write price.
 *
 * Reasoning tokens (OpenAI o-series, Anthropic extended thinking) are billed
 * at the same per-token rate as regular output tokens, matching codex-cli's
 * TokenUsage struct (input_tokens, cached_input_tokens, output_tokens,
 * reasoning_output_tokens, total_tokens).
 *
 * OTEL attributes follow GenAI semantic conventions (standard) plus
 * codex.usage.* vendor extensions, aligned with codex-cli's attribute map.
 * No opentelemetry package dependency; callers receive a plain attribute object.
 */

import 'server-only';

import { getModelMetadataById, resolveEffectiveModelPricing } from '@agiworkforce/types';
import type { CpstUsageFields } from '@/lib/cpst-telemetry';

export interface ModelUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  requestCount: number;
  costUsd: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  /** Subset of cacheCreationInputTokens written to Anthropic's 1h cache TTL
   *  (billed at 2.0x input instead of the 5m rate's 1.25x). */
  cacheCreation1hInputTokens?: number;
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
 * Calculate cost in USD for a model/usage pair, at an explicit date.
 *
 * Pricing source: models.json via getModelMetadataById.
 *   inputCost / outputCost = USD per 1M tokens.
 *   cached_input = USD per 1M read tokens (when present in catalog).
 *
 * `asOf` is REQUIRED and never defaulted here: a model may carry a
 * `pricingSchedule` of dated windows (UTC calendar days, both bounds
 * inclusive), so the billed rate is a function of the request date. No shipped
 * model schedules a price today; the mechanism exists for an announced PRODUCT
 * price change. Keeping the clock out of this function means a given
 * (model, usage, date) always produces the same cost.
 *
 * Fallback when model not in catalog: $0 (unknown model warning logged by caller).
 */
function calculateCostUsd(modelId: string, usage: NormalizedUsage, asOf: Date): number {
  const meta = getModelMetadataById(modelId);
  if (!meta) {
    return 0;
  }

  const effective = resolveEffectiveModelPricing(meta, asOf);
  const inputPerM = effective.inputCost ?? 0;
  const outputPerM = effective.outputCost ?? 0;

  // Use catalog cached_input price when available; fall back to 10% of input rate.
  // cached_input is defined on ModelMetadata as an optional sparse field sourced
  // from packages/ai/model-registry/catalog/models.synced.json (upstream-derived)
  // or models.curation.json overrides.
  // Confirmed prices (June 2026): Anthropic = 0.10× input, OpenAI = 0.10× input,
  // DeepSeek = per catalog, Gemini 3.5 Flash = $0.15/M.
  const cacheReadPerM =
    typeof effective.cached_input === 'number' ? effective.cached_input : inputPerM * 0.1;

  // Cache creation:
  //  - Anthropic 5m TTL: 1.25× input rate (published: write costs +25%).
  //  - Anthropic 1h TTL: 2.0× input rate (published: write costs +100%).
  //  - OpenAI: free cache writes UNTIL the GPT-5.6 family, which bills writes at
  //    1.25× the uncached input rate on both automatic and explicit breakpoints.
  //    That is expressed in the catalog as a `cached_write` price, so a declared
  //    write price is billed and an undeclared one is not — pre-5.6 OpenAI models
  //    declare none and their written tokens bill once, at the input rate.
  // Anthropic's response only breaks cacheCreationInputTokens down into
  // cacheCreation1hInputTokens when a request mixes 5m/1h TTLs; the remainder
  // is billed at the 5m rate. See anthropic.ts's stable-prefix 1h upgrade.
  const isAnthropic = meta.provider === 'anthropic';
  const cacheCreationPerM =
    typeof effective.cached_write === 'number'
      ? effective.cached_write
      : isAnthropic
        ? inputPerM * 1.25
        : inputPerM;
  const cacheCreation1hPerM =
    typeof effective.cached_write_1h === 'number'
      ? effective.cached_write_1h
      : isAnthropic
        ? inputPerM * 2.0
        : inputPerM;

  const rawInputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  // Reasoning tokens are billed at the same rate as output tokens.
  // Reference: codex-cli TokenUsage.reasoning_output_tokens · counted at output rate.
  const reasoningTokens = usage.reasoningOutputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const cacheCreationTotal = usage.cacheCreationInputTokens ?? 0;
  const cacheCreation1h = Math.min(
    cacheCreationTotal,
    Math.max(0, usage.cacheCreation1hInputTokens ?? 0),
  );
  const cacheCreation5m = cacheCreationTotal - cacheCreation1h;

  // Token-accounting convention differs by provider, which decides whether cache
  // tokens must be SUBTRACTED from the input bucket before costing:
  //  - Anthropic reports input_tokens DISJOINT from cache_read/cache_creation
  //    (per Anthropic docs: cache tokens are billed separately, not part of
  //    input_tokens). Summing input + cacheRead + cacheCreation is correct.
  //  - OpenAI (prompt_tokens), Gemini (promptTokenCount) and DeepSeek
  //    (prompt_tokens / prompt_cache_hit_tokens) report INCLUSIVE prompt counts:
  //    the cached tokens are a SUBSET of the prompt total. Billing the full
  //    prompt at input rate PLUS the cached subset at the cache-read rate would
  //    double-charge the cached portion. Subtract cache tokens from the billable
  //    input bucket so each token is billed exactly once. Written tokens are part
  //    of that subset too, so they leave the input bucket and are re-billed above
  //    at cacheCreationPerM — which equals the input rate when no write price is
  //    declared, so an undeclared write costs exactly what it always did.
  const billableInput = isAnthropic
    ? rawInputTokens
    : Math.max(0, rawInputTokens - cacheRead - cacheCreationTotal);

  return (
    (billableInput * inputPerM) / 1_000_000 +
    (outputTokens * outputPerM) / 1_000_000 +
    (reasoningTokens * outputPerM) / 1_000_000 +
    (cacheRead * cacheReadPerM) / 1_000_000 +
    (cacheCreation5m * cacheCreationPerM) / 1_000_000 +
    (cacheCreation1h * cacheCreation1hPerM) / 1_000_000
  );
}

/**
 * Record usage for a model within a session.
 * Creates the session entry if it does not exist.
 *
 * `asOf` is the request date used to pick the model's effective rates (see
 * `calculateCostUsd`). It is the ONLY place in this module a clock is read, and
 * production call sites pass their own `new Date()` so the billing date is the
 * request's date rather than whenever this module happens to run.
 */
export function recordModelUsage(
  sessionId: string,
  modelId: string,
  usage: NormalizedUsage,
  asOf: Date = new Date(),
): void {
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
    reasoningOutputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    requestCount: 0,
    costUsd: 0,
  };

  existing.inputTokens += usage.inputTokens ?? 0;
  existing.outputTokens += usage.outputTokens ?? 0;
  existing.reasoningOutputTokens += usage.reasoningOutputTokens ?? 0;
  existing.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  existing.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  existing.requestCount += 1;
  existing.costUsd += calculateCostUsd(modelId, usage, asOf);

  sessionMap.set(modelId, existing);
}

/**
 * Retrieve a snapshot of all model usage for the given session.
 * Returns an empty Map if the session has not been seen.
 * The returned Map is a deep copy · mutations do not affect the store.
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

/**
 * Infer the GenAI system name from a provider string or model ID prefix.
 *
 * Maps internal provider keys to OpenTelemetry GenAI semantic convention
 * gen_ai.system values. Falls back to the raw provider string when unknown.
 * Reference: codex-cli otel-attributes.ts inferGenAiSystem().
 */
export function inferGenAiSystem(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'google') return 'google_ai_studio';
  if (normalized === 'xai') return 'xai';
  if (normalized === 'deepseek') return 'deepseek';
  if (normalized === 'perplexity') return 'perplexity';
  if (normalized === 'qwen') return 'qwen';
  if (normalized === 'moonshot') return 'moonshot';
  if (normalized === 'zhipu') return 'zhipu';
  if (normalized === 'openrouter') return 'openrouter';
  if (normalized === 'ollama') return 'ollama';
  if (normalized === 'lmstudio') return 'lmstudio';
  return normalized;
}

/**
 * Mirror the CPST Stage-0 telemetry keys (apps/web/lib/cpst-telemetry.ts) into
 * the codex.usage.* vendor namespace this module already uses.
 *
 * MANAGED CLOUD ONLY, and observability only: this tracker is in-memory and
 * resets on cold start, so it is explicitly NOT a CPST source
 * (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.3, "Surface
 * coverage"). The durable numbers come from the managed-usage ledger; these
 * attributes exist so a span carries the same labels as the row it belongs to.
 *
 * Every key is emitted only when its source field is present — an absent CPST
 * field stays an absent attribute, never a defaulted one.
 */
export function toCpstOtelAttributes(
  cpst: CpstUsageFields,
): Record<string, number | string | boolean> {
  const attrs: Record<string, number | string | boolean> = {};
  if (cpst.taskOutcome !== undefined) attrs['codex.usage.task_outcome'] = cpst.taskOutcome;
  if (cpst.retries !== undefined) attrs['codex.usage.retries'] = cpst.retries;
  if (cpst.fallbackUsed !== undefined) attrs['codex.usage.fallback_used'] = cpst.fallbackUsed;
  if (cpst.fallbackReason !== undefined) attrs['codex.usage.fallback_reason'] = cpst.fallbackReason;
  if (cpst.verifierResult !== undefined) attrs['codex.usage.verifier_result'] = cpst.verifierResult;
  if (cpst.routePlanId !== undefined) attrs['codex.usage.route_plan_id'] = cpst.routePlanId;
  if (cpst.taskFamily !== undefined) attrs['codex.usage.task_family'] = cpst.taskFamily;
  if (cpst.taskFamilyConfidence !== undefined) {
    attrs['codex.usage.task_family_confidence'] = cpst.taskFamilyConfidence;
  }
  return attrs;
}

/**
 * Produce an OpenTelemetry attribute bag for a single LLM usage event.
 *
 * Standard GenAI semantic conventions (spec-stable):
 *   gen_ai.usage.input_tokens         · total prompt tokens (includes cache-read hits)
 *   gen_ai.usage.output_tokens        · completion tokens (excludes reasoning)
 *   gen_ai.usage.cache_read.input_tokens  · tokens served from cache (10% cost)
 *
 * Vendor extensions (codex.usage.* namespace, aligned with codex-cli):
 *   codex.usage.cache_creation_input_tokens · tokens written to cache (125% cost)
 *   codex.usage.reasoning_output_tokens    · thinking/reasoning tokens (output rate)
 *   codex.usage.total_tokens               · sum of all categories for cost attribution
 *
 * The optional `cpst` argument adds the CPST Stage-0 labels (see
 * `toCpstOtelAttributes`). Omitting it leaves the attribute bag byte-identical
 * to what every existing caller already emitted.
 *
 * Returns a plain Record so callers have zero opentelemetry package dependency.
 * Reference: codex-cli otel-attributes.ts toOtelAttributes().
 */
export function toOtelAttributes(
  provider: string,
  modelId: string,
  usage: NormalizedUsage,
  cpst?: CpstUsageFields,
): Record<string, number | string | boolean> {
  const attrs: Record<string, number | string | boolean> = {
    'gen_ai.system': inferGenAiSystem(provider),
    'gen_ai.request.model': modelId,
    'gen_ai.usage.input_tokens': usage.inputTokens ?? 0,
    'gen_ai.usage.output_tokens': usage.outputTokens ?? 0,
  };

  if (usage.cacheReadInputTokens != null) {
    attrs['gen_ai.usage.cache_read.input_tokens'] = usage.cacheReadInputTokens;
  }
  if (usage.cacheCreationInputTokens != null) {
    attrs['codex.usage.cache_creation_input_tokens'] = usage.cacheCreationInputTokens;
  }
  if (usage.cacheCreation1hInputTokens != null) {
    attrs['codex.usage.cache_creation_1h_input_tokens'] = usage.cacheCreation1hInputTokens;
  }
  if (usage.reasoningOutputTokens != null) {
    attrs['codex.usage.reasoning_output_tokens'] = usage.reasoningOutputTokens;
  }

  const total =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.reasoningOutputTokens ?? 0) +
    (usage.cacheCreationInputTokens ?? 0);
  attrs['codex.usage.total_tokens'] = total;

  if (cpst) Object.assign(attrs, toCpstOtelAttributes(cpst));

  return attrs;
}
