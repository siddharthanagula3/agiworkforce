import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/hosting', () => ({ releaseSha: () => 'release-sha' }));

const store = new Map<string, unknown>();
const recordCacheHit = vi.fn(async (_input: unknown) => undefined);

vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  }),
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordCacheHitCostEvent: (input: unknown) => recordCacheHit(input),
}));

import { listCanonicalModels } from '@agiworkforce/types';

import {
  avoidedCostMicrousd,
  lookupSemanticResponseCache,
  normalizeCacheInput,
  recordSemanticCacheHit,
  semanticCacheIneligibility,
  storeSemanticResponseCache,
  type SemanticCacheKeyFields,
  type SemanticCacheSafety,
} from '@/lib/services/semantic-response-cache-service';

const SAFE: SemanticCacheSafety = {
  toolsOffered: false,
  attachmentsPresent: false,
  freshDataRequired: false,
  temperature: 0,
};

const FIELDS: SemanticCacheKeyFields = {
  callType: 'support-answer',
  tenantId: 'user_1',
  provider: 'openai',
  modelId: 'some-model',
  routeId: 'route-1',
  promptStamps: ['support.system@1'],
  systemPrompt: 'system',
  input: 'How do I export my data?',
};

const ENTRY = {
  content: 'Open Settings, then Data controls.',
  usage: { promptTokens: 900, completionTokens: 60, totalTokens: 960 },
};

beforeEach(() => {
  store.clear();
  recordCacheHit.mockClear();
});

afterEach(() => {
  delete process.env['AGI_SEMANTIC_RESPONSE_CACHE_ENABLED'];
});

describe('semantic response cache safety', () => {
  it('refuses a turn that could have produced a different answer', () => {
    expect(semanticCacheIneligibility({ ...SAFE, toolsOffered: true }, 'q')).toBe('tools_offered');
    expect(semanticCacheIneligibility({ ...SAFE, attachmentsPresent: true }, 'q')).toBe(
      'attachments_present',
    );
    expect(semanticCacheIneligibility({ ...SAFE, freshDataRequired: true }, 'q')).toBe(
      'fresh_data_required',
    );
    expect(semanticCacheIneligibility({ ...SAFE, temperature: 0.7 }, 'q')).toBe(
      'non_deterministic_sampling',
    );
    expect(semanticCacheIneligibility(SAFE, '   ')).toBe('empty_input');
    expect(semanticCacheIneligibility(SAFE, 'q')).toBeNull();
  });

  it('recognises the same question written with different spacing', () => {
    expect(normalizeCacheInput('  How   do I\nexport? ')).toBe('How do I export?');
  });

  it('never serves, and never stores, an ineligible turn', async () => {
    const unsafe = { ...SAFE, toolsOffered: true };
    await storeSemanticResponseCache(FIELDS, ENTRY, unsafe);
    expect(store.size).toBe(0);
    expect(await lookupSemanticResponseCache(FIELDS, unsafe)).toEqual({
      outcome: 'ineligible',
      reason: 'tools_offered',
    });
  });
});

describe('semantic response cache lookup', () => {
  it('misses, then serves the repeat', async () => {
    expect((await lookupSemanticResponseCache(FIELDS, SAFE)).outcome).toBe('miss');
    await storeSemanticResponseCache(FIELDS, ENTRY, SAFE);
    const hit = await lookupSemanticResponseCache(
      { ...FIELDS, input: '  How do I   export my data? ' },
      SAFE,
    );
    expect(hit.outcome).toBe('hit');
    expect(hit.entry?.content).toBe(ENTRY.content);
  });

  it('misses a different tenant, a different model and a different prompt version', async () => {
    await storeSemanticResponseCache(FIELDS, ENTRY, SAFE);
    for (const variant of [
      { ...FIELDS, tenantId: 'user_2' },
      { ...FIELDS, modelId: 'other-model' },
      { ...FIELDS, promptStamps: ['support.system@2'] },
    ]) {
      expect((await lookupSemanticResponseCache(variant, SAFE)).outcome).toBe('miss');
    }
  });

  it('serves live when the deployment disables it', async () => {
    process.env['AGI_SEMANTIC_RESPONSE_CACHE_ENABLED'] = 'off';
    await storeSemanticResponseCache(FIELDS, ENTRY, SAFE);
    expect(store.size).toBe(0);
    expect((await lookupSemanticResponseCache(FIELDS, SAFE)).outcome).toBe('disabled');
  });
});

describe('cache hit accounting', () => {
  it('prices the avoided call from the model registry', () => {
    const avoided = avoidedCostMicrousd({
      provider: 'openai',
      modelId: listCanonicalModels()[0]?.id ?? '',
      usage: ENTRY.usage,
    });
    expect(avoided).toBeGreaterThanOrEqual(0);
  });

  it('writes one accounting line per hit, stamped with the prompt it used', async () => {
    await recordSemanticCacheHit({
      userId: 'user_1',
      provider: 'openai',
      modelId: 'some-model',
      sourceRef: 'support-cache:1',
      promptStamps: ['support.system@1'],
      usage: ENTRY.usage,
    });
    expect(recordCacheHit).toHaveBeenCalledTimes(1);
    const [call] = recordCacheHit.mock.calls as unknown as [
      [{ mechanism: string; promptIds: readonly string[]; capability: string }],
    ];
    expect(call[0].mechanism).toBe('agi_semantic_response_cache');
    expect(call[0].capability).toBe('chat');
    expect(call[0].promptIds).toEqual(['support.system@1']);
  });
});
