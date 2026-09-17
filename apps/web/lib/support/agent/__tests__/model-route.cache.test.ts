import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/hosting', () => ({ releaseSha: () => 'release-sha' }));

const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: 'balanced',
  taskType: 'simple_chat',
  modelKey: 'test.model',
  provider: 'anthropic',
  providerModelId: 'test-provider-model-id',
  routeId: 'test-route',
  harnessId: 'test/chat',
  fallbacks: [],
  reason: 'preferred_slot',
};

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return { ...actual, resolveAutoRoute: () => SELECTED_ROUTE };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: () => ({ stream: () => (async function* () {})() }),
  buildProtocolRouteAdapter: vi.fn(),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
}));

const recordSettledProviderCostMock = vi.fn(async (..._args: unknown[]) => {});
const recordCacheHitCostEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCostMock(...args),
  recordCacheHitCostEvent: (...args: unknown[]) => recordCacheHitCostEventMock(...args),
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

import { callSupportModel } from '../answer/model-route';

const originalEnabled = process.env['SUPPORT_AGENT_ENABLED'];

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  process.env['SUPPORT_AGENT_ENABLED'] = 'true';
  drainToLlmResponseMock.mockResolvedValue({
    model: 'test.model',
    content: 'Here is how to reset your password.',
    promptTokens: 120,
    completionTokens: 40,
    totalTokens: 160,
  });
});

afterEach(() => {
  delete process.env['AGI_SEMANTIC_RESPONSE_CACHE_ENABLED'];
  if (originalEnabled === undefined) delete process.env['SUPPORT_AGENT_ENABLED'];
  else process.env['SUPPORT_AGENT_ENABLED'] = originalEnabled;
});

const ASK = {
  userMessage: 'how do I reset my password',
  planTier: 'pro',
  userId: 'user_42',
  surface: 'app',
} as const;

describe('support answers and the semantic cache', () => {
  it('stamps the prompt manifest version on the cost row for the answer', async () => {
    await callSupportModel({ ...ASK });
    expect(recordSettledProviderCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ promptIds: ['support.system@1'] }),
    );
  });

  it('serves an identical repeat from cache and never calls the provider again', async () => {
    const first = await callSupportModel({ ...ASK });
    expect(first.status).toBe('ok');
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);

    const repeat = await callSupportModel({ ...ASK, userMessage: '  how do I reset my password ' });
    expect(repeat).toEqual(first);
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCostMock).toHaveBeenCalledTimes(1);
  });

  it('accounts for the hit rather than leaving the saving as an absent row', async () => {
    await callSupportModel({ ...ASK });
    await callSupportModel({ ...ASK });
    expect(recordCacheHitCostEventMock).toHaveBeenCalledTimes(1);
    expect(recordCacheHitCostEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mechanism: 'agi_semantic_response_cache',
        promptIds: ['support.system@1'],
        sourceRef: expect.stringContaining('support-cache:'),
      }),
    );
  });

  it('never serves one account an answer produced for another', async () => {
    await callSupportModel({ ...ASK });
    await callSupportModel({ ...ASK, userId: 'user_43' });
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });

  it('goes back to the provider when the deployment disables the cache', async () => {
    process.env['AGI_SEMANTIC_RESPONSE_CACHE_ENABLED'] = 'off';
    await callSupportModel({ ...ASK });
    await callSupportModel({ ...ASK });
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
    expect(recordCacheHitCostEventMock).not.toHaveBeenCalled();
  });
});
