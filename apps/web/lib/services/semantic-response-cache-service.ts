import 'server-only';

import { createHash } from 'node:crypto';
import { getOptionalEnv } from '@shared/utils/env';
import { microusdFromCents } from '@agiworkforce/types';
import { releaseSha } from '@/lib/server/hosting';
import { getKeyValueStore } from '@/lib/server/key-value';
import { logger } from '@/lib/logger';
import { recordCacheHitCostEvent } from '@/lib/services/cogs-ledger-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';

/**
 * A cache for the answers a repeat is genuinely safe to serve from.
 *
 * "Semantic" here means the question is recognised as the same question after
 * Unicode and whitespace normalisation, not that a nearby embedding is close
 * enough: an embedding neighbour is a different question with a similar shape,
 * and serving one for the other is a wrong answer the user cannot see is wrong.
 *
 * Safety is a precondition, not a heuristic. A turn qualifies only when it
 * offered the model no tools, attached no files, asked for nothing that changes
 * between calls, and ran at temperature zero, so the provider had no freedom and
 * no fresh input. Anything else is served live. The key is scoped to a tenant and
 * to the release, so a prompt change, a model change or a deploy all miss.
 *
 * Every hit writes its own accounting line: the ledger records a zero-cost row
 * carrying what the call would have cost, so the saving is summable rather than
 * inferred from rows that are not there.
 */

export const SEMANTIC_RESPONSE_CACHE_ENABLED_ENV = 'AGI_SEMANTIC_RESPONSE_CACHE_ENABLED';
export const SEMANTIC_RESPONSE_CACHE_MECHANISM = 'agi_semantic_response_cache';

const REDIS_KEY_PREFIX = 'agi-src';
const UNKNOWN_RELEASE_SHA = 'unknown';
const CACHE_ENTRY_SCHEMA_VERSION = 1;
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const DISABLED_ENV_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'off', 'disabled']);

export type SemanticCacheCallType = 'support-answer';

const TTL_SECONDS_BY_CALL_TYPE: Readonly<Record<SemanticCacheCallType, number>> = {
  'support-answer': DEFAULT_TTL_SECONDS,
};

export type SemanticCacheIneligibility =
  | 'tools_offered'
  | 'attachments_present'
  | 'fresh_data_required'
  | 'non_deterministic_sampling'
  | 'empty_input';

export interface SemanticCacheSafety {
  /** True when the turn offered the model any tool, including a retrieval tool. */
  toolsOffered: boolean;
  /** True when the turn carried a file, an image or any other attachment. */
  attachmentsPresent: boolean;
  /** True when the answer depends on anything that changes between calls. */
  freshDataRequired: boolean;
  temperature: number;
}

export interface SemanticCacheUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
}

export interface SemanticCacheKeyFields {
  callType: SemanticCacheCallType;
  tenantId: string;
  provider: string;
  modelId: string;
  routeId?: string | null;
  /** Manifest stamps of the prompts the turn sent, so a prompt change misses. */
  promptStamps: readonly string[];
  systemPrompt: string;
  input: string;
}

export interface SemanticCacheEntry {
  content: string;
  usage: SemanticCacheUsage;
}

interface StoredRecord extends SemanticCacheEntry {
  schemaVersion: number;
}

export type SemanticCacheOutcome = 'hit' | 'miss' | 'ineligible' | 'disabled';

export interface SemanticCacheLookup {
  outcome: SemanticCacheOutcome;
  entry?: SemanticCacheEntry;
  reason?: SemanticCacheIneligibility;
}

export function isSemanticResponseCacheEnabled(): boolean {
  const configured = getOptionalEnv(SEMANTIC_RESPONSE_CACHE_ENABLED_ENV)?.trim().toLowerCase();
  if (!configured) return true;
  return !DISABLED_ENV_VALUES.has(configured);
}

export function normalizeCacheInput(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function semanticCacheIneligibility(
  safety: SemanticCacheSafety,
  input: string,
): SemanticCacheIneligibility | null {
  if (safety.toolsOffered) return 'tools_offered';
  if (safety.attachmentsPresent) return 'attachments_present';
  if (safety.freshDataRequired) return 'fresh_data_required';
  if (safety.temperature !== 0) return 'non_deterministic_sampling';
  if (normalizeCacheInput(input).length === 0) return 'empty_input';
  return null;
}

function cacheKey(fields: SemanticCacheKeyFields): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        callType: fields.callType,
        provider: fields.provider,
        modelId: fields.modelId,
        routeId: fields.routeId ?? null,
        promptStamps: [...fields.promptStamps].sort(),
        systemPrompt: normalizeCacheInput(fields.systemPrompt),
        input: normalizeCacheInput(fields.input),
        release: releaseSha() ?? UNKNOWN_RELEASE_SHA,
      }),
    )
    .digest('hex');
  return [REDIS_KEY_PREFIX, fields.callType, fields.tenantId, digest].join(':');
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record['schemaVersion'] === CACHE_ENTRY_SCHEMA_VERSION &&
    typeof record['content'] === 'string' &&
    record['content'].length > 0 &&
    typeof record['usage'] === 'object' &&
    record['usage'] !== null
  );
}

export async function lookupSemanticResponseCache(
  fields: SemanticCacheKeyFields,
  safety: SemanticCacheSafety,
): Promise<SemanticCacheLookup> {
  if (!isSemanticResponseCacheEnabled()) return { outcome: 'disabled' };
  const ineligible = semanticCacheIneligibility(safety, fields.input);
  if (ineligible) return { outcome: 'ineligible', reason: ineligible };

  const store = getKeyValueStore();
  if (!store) return { outcome: 'miss' };

  try {
    const stored = await store.get<unknown>(cacheKey(fields));
    if (!isStoredRecord(stored)) return { outcome: 'miss' };
    return { outcome: 'hit', entry: { content: stored.content, usage: stored.usage } };
  } catch (error) {
    logger.warn(
      { error, callType: fields.callType },
      '[semantic-response-cache] lookup failed; serving live (fail-open)',
    );
    return { outcome: 'miss' };
  }
}

export async function storeSemanticResponseCache(
  fields: SemanticCacheKeyFields,
  entry: SemanticCacheEntry,
  safety: SemanticCacheSafety,
): Promise<void> {
  if (!isSemanticResponseCacheEnabled()) return;
  if (semanticCacheIneligibility(safety, fields.input)) return;
  if (entry.content.trim().length === 0) return;

  const store = getKeyValueStore();
  if (!store) return;

  const record: StoredRecord = { schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, ...entry };
  try {
    await store.set(cacheKey(fields), record, {
      ttlSeconds: TTL_SECONDS_BY_CALL_TYPE[fields.callType],
    });
  } catch (error) {
    logger.warn(
      { error, callType: fields.callType },
      '[semantic-response-cache] store failed; the next repeat will be served live',
    );
  }
}

/**
 * What the provider call this hit replaced would have cost, in microUSD, priced
 * from the model registry at the cached usage. Zero when the registry has no
 * price for the route, which keeps an unpriced saving out of the total rather
 * than guessing at it.
 */
export function avoidedCostMicrousd(input: {
  provider: string;
  modelId: string;
  routeId?: string | null;
  usage: SemanticCacheUsage;
}): number {
  const cents = LLMCostCalculator.calculateCost(
    input.provider,
    input.modelId,
    {
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      cacheReadInputTokens: input.usage.cachedInputTokens ?? 0,
    },
    undefined,
    input.routeId ?? undefined,
  );
  return microusdFromCents(Math.max(0, cents));
}

export async function recordSemanticCacheHit(input: {
  userId: string;
  organizationId?: string | null;
  provider: string;
  modelId: string;
  routeId?: string | null;
  surface?: string | null;
  sourceRef: string;
  promptStamps: readonly string[];
  usage: SemanticCacheUsage;
}): Promise<void> {
  await recordCacheHitCostEvent({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    provider: input.provider,
    model: input.modelId,
    routeId: input.routeId ?? null,
    surface: input.surface ?? null,
    capability: 'chat',
    mechanism: SEMANTIC_RESPONSE_CACHE_MECHANISM,
    avoidedCostMicrousd: avoidedCostMicrousd(input),
    sourceRef: input.sourceRef,
    promptIds: input.promptStamps,
    usage: {
      operation: 'chat',
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
    },
  });
}
