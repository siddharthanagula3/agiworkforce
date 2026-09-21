import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/hosting', () => ({
  deployEnvironment: vi.fn(() => undefined),
  deployRegion: vi.fn(() => undefined),
  releaseSha: () => 'release-sha',
}));

const store = new Map<string, unknown>();

vi.mock('@/lib/server/key-value', () => ({
  getKeyValueStore: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  }),
}));
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordCacheHitCostEvent: vi.fn(async () => undefined),
}));

import {
  lookupExactResponseCache,
  storeExactResponseCache,
  type ExactResponseCacheKeyFields,
} from '@/lib/services/exact-response-cache-service';
import {
  lookupSemanticResponseCache,
  storeSemanticResponseCache,
  type SemanticCacheKeyFields,
} from '@/lib/services/semantic-response-cache-service';

const TENANT_A = 'org_a';
const TENANT_B = 'org_b';

const exactFields = (tenantId: string): ExactResponseCacheKeyFields => ({
  callType: 'conversation-title-generation',
  privacyClass: 'user_private',
  tenantId,
  modelId: 'model-under-test',
  route: 'title',
  systemPrompt: 'Name this conversation.',
  input: 'the quarterly numbers we discussed',
  temperature: 0,
});

const semanticFields = (tenantId: string): SemanticCacheKeyFields => ({
  callType: 'support-answer',
  tenantId,
  provider: 'provider-under-test',
  modelId: 'model-under-test',
  promptStamps: ['support-v1'],
  systemPrompt: 'Answer from the corpus.',
  input: 'how do I rotate a key',
});

const ENTRY = {
  content: 'the answer one tenant paid for',
  usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
};

const LIVE = { bypass: false };

const SAFE = {
  toolsOffered: false,
  attachmentsPresent: false,
  freshDataRequired: false,
  temperature: 0,
};

const SEMANTIC_ENTRY = {
  ...ENTRY,
  provider: 'provider-under-test',
  modelId: 'model-under-test',
};

describe('a cached answer belongs to the tenant that produced it', () => {
  beforeEach(() => {
    store.clear();
  });

  it('does not serve one workspace the exact answer another workspace generated', async () => {
    await storeExactResponseCache(exactFields(TENANT_A), ENTRY, LIVE);

    expect((await lookupExactResponseCache(exactFields(TENANT_A), LIVE)).outcome).toBe('hit');
    expect((await lookupExactResponseCache(exactFields(TENANT_B), LIVE)).outcome).toBe('miss');
  });

  it('does not serve one workspace the semantic answer another workspace generated', async () => {
    await storeSemanticResponseCache(semanticFields(TENANT_A), SEMANTIC_ENTRY, SAFE);

    expect((await lookupSemanticResponseCache(semanticFields(TENANT_A), SAFE)).outcome).toBe('hit');
    expect((await lookupSemanticResponseCache(semanticFields(TENANT_B), SAFE)).outcome).toBe(
      'miss',
    );
  });

  it('puts the tenant in the key itself, not only in the value', async () => {
    await storeExactResponseCache(exactFields(TENANT_A), ENTRY, LIVE);
    await storeSemanticResponseCache(semanticFields(TENANT_A), SEMANTIC_ENTRY, SAFE);

    const keys = [...store.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key, `${key} is not scoped to a tenant`).toContain(TENANT_A);
    }
  });
});
