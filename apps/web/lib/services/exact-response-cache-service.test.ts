import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

class FakeRedis {
  store = new Map<string, unknown>();
  failOnGet = false;
  failOnSet = false;

  async get<T>(key: string): Promise<T | null> {
    if (this.failOnGet) throw new Error('upstash unavailable');
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown, _opts?: { ex: number }): Promise<'OK'> {
    if (this.failOnSet) throw new Error('upstash unavailable');
    this.store.set(key, value);
    return 'OK';
  }
}

let redisClient: FakeRedis | null = null;
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () =>
    redisClient ? createUpstashKeyValueStore(redisClient as unknown as UpstashRedisLike) : null,
}));

import { createUpstashKeyValueStore, type UpstashRedisLike } from '@agiworkforce/key-value';

import {
  EXACT_RESPONSE_CACHE_ENABLED_ENV,
  isExactResponseCacheEnabled,
  lookupExactResponseCache,
  storeExactResponseCache,
  type ExactResponseCacheEntry,
  type ExactResponseCacheKeyFields,
} from './exact-response-cache-service';

const ENTRY: ExactResponseCacheEntry = {
  content: 'Refactor the auth module',
  usage: { promptTokens: 40, completionTokens: 6, totalTokens: 46 },
};

function fields(overrides: Partial<ExactResponseCacheKeyFields> = {}): ExactResponseCacheKeyFields {
  return {
    callType: 'conversation-title-generation',
    tenantId: 'user_1',
    privacyClass: 'user_private',
    modelId: 'fixture-model-primary',
    route: 'anthropic',
    systemPrompt: 'Write a short title',
    input: 'help me refactor the auth module',
    temperature: 0,
    responseFormat: 'text',
    ...overrides,
  };
}

const originalEnv = process.env[EXACT_RESPONSE_CACHE_ENABLED_ENV];

beforeEach(() => {
  vi.clearAllMocks();
  redisClient = new FakeRedis();
  delete process.env[EXACT_RESPONSE_CACHE_ENABLED_ENV];
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[EXACT_RESPONSE_CACHE_ENABLED_ENV];
  else process.env[EXACT_RESPONSE_CACHE_ENABLED_ENV] = originalEnv;
});

describe('key stability', () => {
  it('hits on a second identical lookup after a store', async () => {
    await storeExactResponseCache(fields(), ENTRY, { bypass: false });
    const result = await lookupExactResponseCache(fields(), { bypass: false });
    expect(result).toEqual({ outcome: 'hit', entry: ENTRY });
  });

  const sensitiveFields: Array<[string, Partial<ExactResponseCacheKeyFields>]> = [
    ['tenantId', { tenantId: 'user_2' }],
    ['privacyClass', { privacyClass: 'shared_deterministic' }],
    ['modelId', { modelId: 'fixture-model-alternate' }],
    ['route', { route: 'openai' }],
    ['systemPrompt', { systemPrompt: 'Write a long title' }],
    ['input', { input: 'help me refactor the billing module' }],
    ['temperature', { temperature: 0.2 }],
    ['responseFormat', { responseFormat: 'json' }],
    ['tools', { tools: [{ name: 'search' }] }],
  ];

  it.each(sensitiveFields)('misses when %s differs', async (_label, override) => {
    await storeExactResponseCache(fields(), ENTRY, { bypass: false });
    const result = await lookupExactResponseCache(fields(override), { bypass: false });
    expect(result).toEqual({ outcome: 'miss' });
  });

  it('is sensitive to the deployed application version', async () => {
    process.env['AGI_RELEASE_SHA'] = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await storeExactResponseCache(fields(), ENTRY, { bypass: false });
    process.env['AGI_RELEASE_SHA'] = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const result = await lookupExactResponseCache(fields(), { bypass: false });
    delete process.env['AGI_RELEASE_SHA'];
    expect(result).toEqual({ outcome: 'miss' });
  });
});

describe('tenant isolation', () => {
  it('never serves one tenant a value stored under another tenant, even with an identical key', async () => {
    await storeExactResponseCache(fields({ tenantId: 'user_1' }), ENTRY, { bypass: false });
    const result = await lookupExactResponseCache(fields({ tenantId: 'user_2' }), {
      bypass: false,
    });
    expect(result).toEqual({ outcome: 'miss' });
  });
});

describe('private-mode bypass', () => {
  it('never touches redis when bypass is requested', async () => {
    const getSpy = vi.spyOn(redisClient!, 'get');
    const setSpy = vi.spyOn(redisClient!, 'set');
    expect(await lookupExactResponseCache(fields(), { bypass: true })).toEqual({
      outcome: 'bypassed',
    });
    await storeExactResponseCache(fields(), ENTRY, { bypass: true });
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe('kill switch', () => {
  it('defaults to enabled', () => {
    expect(isExactResponseCacheEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', 'disabled', 'FALSE'])(
    'treats %s as disabled and bypasses without touching redis',
    async (value) => {
      process.env[EXACT_RESPONSE_CACHE_ENABLED_ENV] = value;
      const getSpy = vi.spyOn(redisClient!, 'get');
      expect(isExactResponseCacheEnabled()).toBe(false);
      expect(await lookupExactResponseCache(fields(), { bypass: false })).toEqual({
        outcome: 'bypassed',
      });
      expect(getSpy).not.toHaveBeenCalled();
    },
  );
});

describe('fail-open', () => {
  it('misses instead of throwing when redis is not configured', async () => {
    redisClient = null;
    expect(await lookupExactResponseCache(fields(), { bypass: false })).toEqual({
      outcome: 'miss',
    });
    await expect(
      storeExactResponseCache(fields(), ENTRY, { bypass: false }),
    ).resolves.toBeUndefined();
  });

  it('misses instead of throwing when the lookup call rejects', async () => {
    redisClient!.failOnGet = true;
    expect(await lookupExactResponseCache(fields(), { bypass: false })).toEqual({
      outcome: 'miss',
    });
  });

  it('does not throw when the store call rejects', async () => {
    redisClient!.failOnSet = true;
    await expect(
      storeExactResponseCache(fields(), ENTRY, { bypass: false }),
    ).resolves.toBeUndefined();
  });
});
