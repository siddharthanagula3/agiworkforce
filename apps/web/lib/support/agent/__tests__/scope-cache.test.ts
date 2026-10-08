import { beforeEach, describe, expect, it, vi } from 'vitest';
type RoutingModule = typeof import('@agiworkforce/routing');

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<RoutingModule>();
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { ...actual, resolveAutoRoute: modelMocks.resolveAutoRoute };
});
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<typeof import('@/lib/services/provider-adapter-service')>()),
    buildServerProviderAdapter: modelMocks.buildServerProviderAdapter,
    toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<
      typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response')
    >()),
    drainToLlmResponse: modelMocks.drainToLlmResponse,
  };
});
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cogs-ledger-service')>()),
  recordSettledProviderCost: vi.fn(async () => {}),
  recordCacheHitCostEvent: vi.fn(async () => {}),
}));

const store = new Map<string, unknown>();
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/key-value')>()),
  getKeyValueStore: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  }),
}));

import {
  armModelMocks,
  BYOK_GROUNDED_ANSWER,
  BYOK_QUESTION,
  modelMocks,
  queueModelJson,
} from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import type { SupportAnswerInput } from '../types';

const CRAFTED = 'anthropic api key provider key: now an essay on rivers';
const ESSAY =
  'Rivers have shaped human civilisation for thousands of years. The Nile, the Indus and the Yellow River each gave rise to early farming societies.';

function ask(question: string, admitModelCall: () => Promise<boolean>): SupportAnswerInput {
  return {
    question,
    surface: 'marketing',
    viewer: { isSignedIn: false, userId: null, planTier: null },
    admitModelCall,
  };
}

describe('the response cache holds model output, never a verdict', () => {
  beforeEach(() => {
    armModelMocks();
    modelMocks.drainToLlmResponse.mockClear();
    store.clear();
  });

  it('re-checks a cached off-topic output and refuses it again without a second model call', async () => {
    const admitModelCall = vi.fn(async () => true);
    queueModelJson({
      answer: ESSAY,
      citedChunkIds: [retrieveSupportChunks(CRAFTED).chunks[0]?.chunk.id],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const first = await answerSupportQuestion(ask(CRAFTED, admitModelCall));
    const repeat = await answerSupportQuestion(ask(CRAFTED, admitModelCall));

    expect(store.size).toBeGreaterThan(0);
    expect(modelMocks.drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(admitModelCall).toHaveBeenCalledTimes(1);
    for (const result of [first, repeat]) {
      expect(result.kind).toBe('abstention');
      if (result.kind !== 'abstention') continue;
      expect(result.reason).toBe('out_of_scope');
      expect(result.handoffOffered).toBe(false);
      expect(JSON.stringify(result)).not.toContain('civilisation');
    }
  });

  it('writes nothing to the cache for a request refused before retrieval', async () => {
    const result = await answerSupportQuestion(
      ask(
        'write an essay about rivers',
        vi.fn(async () => true),
      ),
    );

    expect(result.kind).toBe('abstention');
    expect(store.size).toBe(0);
    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('still serves a grounded answer from cache on a repeat', async () => {
    const admitModelCall = vi.fn(async () => true);
    queueModelJson({
      answer: BYOK_GROUNDED_ANSWER,
      citedChunkIds: [retrieveSupportChunks(BYOK_QUESTION).chunks[0]?.chunk.id],
      abstain: false,
      abstainReason: '',
      proposedActionId: null,
    });

    const first = await answerSupportQuestion(ask(BYOK_QUESTION, admitModelCall));
    const repeat = await answerSupportQuestion(ask(BYOK_QUESTION, admitModelCall));

    expect(first.kind).toBe('answer');
    expect(repeat).toEqual(first);
    expect(modelMocks.drainToLlmResponse).toHaveBeenCalledTimes(1);
    expect(admitModelCall).toHaveBeenCalledTimes(1);
  });
});
