import 'server-only';

import { createHash } from 'node:crypto';
import { getOptionalEnv } from '@shared/utils/env';
import { getKeyValueStore } from '@/lib/server/key-value';
import { logger } from '@/lib/logger';

export const EXACT_RESPONSE_CACHE_ENABLED_ENV = 'AGI_EXACT_RESPONSE_CACHE_ENABLED';
export const EXACT_RESPONSE_CACHE_MECHANISM = 'agi_exact_response_cache';

const REDIS_KEY_PREFIX = 'agi-xrc';
const RELEASE_SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const CACHE_ENTRY_SCHEMA_VERSION = 1;

const DISABLED_ENV_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'off', 'disabled']);

export type ExactResponseCachePrivacyClass = 'user_private' | 'shared_deterministic';

export type ExactResponseCacheCallType = 'conversation-title-generation';

const CACHE_TTL_SECONDS_BY_CALL_TYPE: Readonly<Record<ExactResponseCacheCallType, number>> = {
  'conversation-title-generation': 7 * 24 * 60 * 60,
};

export interface ExactResponseCacheUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningOutputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  cachedInputTokens?: number;
}

export interface ExactResponseCacheEntry {
  content: string;
  usage: ExactResponseCacheUsage;
}

interface StoredCacheRecord extends ExactResponseCacheEntry {
  schemaVersion: number;
}

export interface ExactResponseCacheKeyFields {
  callType: ExactResponseCacheCallType;
  tenantId: string;
  privacyClass: ExactResponseCachePrivacyClass;
  modelId: string;
  route: string;
  systemPrompt: string;
  input: string;
  tools?: unknown;
  temperature: number;
  responseFormat?: string;
}

export type ExactResponseCacheOutcome = 'hit' | 'miss' | 'bypassed';

export interface ExactResponseCacheLookupResult {
  outcome: ExactResponseCacheOutcome;
  entry?: ExactResponseCacheEntry;
}

function resolveReleaseShaForCacheInvalidation(): string {
  const candidates = [
    process.env['AGI_RELEASE_SHA'],
    process.env['VERCEL_GIT_COMMIT_SHA'],
    process.env['GITHUB_SHA'],
  ];
  const sha = candidates
    .map((value) => value?.trim().toLowerCase() ?? '')
    .find((value) => RELEASE_SHA_PATTERN.test(value));
  return sha ?? 'unknown';
}

export function isExactResponseCacheEnabled(): boolean {
  const configured = getOptionalEnv(EXACT_RESPONSE_CACHE_ENABLED_ENV)?.trim().toLowerCase();
  if (!configured) return true;
  return !DISABLED_ENV_VALUES.has(configured);
}

function cacheKey(fields: ExactResponseCacheKeyFields): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      callType: fields.callType,
      privacyClass: fields.privacyClass,
      modelId: fields.modelId,
      route: fields.route,
      systemPrompt: fields.systemPrompt,
      input: fields.input,
      tools: fields.tools ?? null,
      temperature: fields.temperature,
      responseFormat: fields.responseFormat ?? null,
      appVersion: resolveReleaseShaForCacheInvalidation(),
    }),
  );
  return [REDIS_KEY_PREFIX, fields.callType, fields.tenantId, hash.digest('hex')].join(':');
}

function isStoredCacheRecord(value: unknown): value is StoredCacheRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record['schemaVersion'] === CACHE_ENTRY_SCHEMA_VERSION &&
    typeof record['content'] === 'string' &&
    typeof record['usage'] === 'object' &&
    record['usage'] !== null
  );
}

export async function lookupExactResponseCache(
  fields: ExactResponseCacheKeyFields,
  options: { bypass: boolean },
): Promise<ExactResponseCacheLookupResult> {
  if (options.bypass) return { outcome: 'bypassed' };
  if (!isExactResponseCacheEnabled()) return { outcome: 'bypassed' };

  const store = getKeyValueStore();
  if (!store) return { outcome: 'miss' };

  try {
    const stored = await store.get<unknown>(cacheKey(fields));
    if (!isStoredCacheRecord(stored)) return { outcome: 'miss' };
    return { outcome: 'hit', entry: { content: stored.content, usage: stored.usage } };
  } catch (error) {
    logger.warn(
      { error, callType: fields.callType },
      '[exact-response-cache] lookup failed; treating as a miss (fail-open)',
    );
    return { outcome: 'miss' };
  }
}

export async function storeExactResponseCache(
  fields: ExactResponseCacheKeyFields,
  entry: ExactResponseCacheEntry,
  options: { bypass: boolean },
): Promise<void> {
  if (options.bypass || !isExactResponseCacheEnabled()) return;

  const store = getKeyValueStore();
  if (!store) return;

  const record: StoredCacheRecord = { schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, ...entry };
  try {
    await store.set(cacheKey(fields), record, {
      ttlSeconds: CACHE_TTL_SECONDS_BY_CALL_TYPE[fields.callType],
    });
  } catch (error) {
    logger.warn(
      { error, callType: fields.callType },
      '[exact-response-cache] store failed; the next identical call will miss again',
    );
  }
}
