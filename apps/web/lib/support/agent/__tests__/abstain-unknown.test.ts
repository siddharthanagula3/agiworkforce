import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { ...actual, resolveAutoRoute: modelMocks.resolveAutoRoute };
});
vi.mock('@/lib/services/provider-adapter-service', async () => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    buildServerProviderAdapter: modelMocks.buildServerProviderAdapter,
    toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async () => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { drainToLlmResponse: modelMocks.drainToLlmResponse };
});

import { armModelMocks, modelMocks } from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import type { SupportAnswerInput } from '../types';

function ask(question: string): SupportAnswerInput {
  return {
    question,
    surface: 'marketing',
    viewer: { isSignedIn: false, userId: null, planTier: null },
  };
}

describe('unknown questions abstain instead of inventing', () => {
  beforeEach(() => {
    armModelMocks();
  });

  const unknown = [
    "what is your Kubernetes operator's CRD version",
    'which port does the sidecar proxy bind to in your helm chart',
    'how do I configure the Cassandra replication factor',
  ];

  it.each(unknown)('abstains on %j and never constructs a provider adapter', async (question) => {
    const retrieval = retrieveSupportChunks(question);
    expect(retrieval.passedFloor).toBe(false);

    const result = await answerSupportQuestion(ask(question));

    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('no_relevant_source');
    expect(result.handoffOffered).toBe(true);
    expect(result.route).toBeNull();

    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('abstains on an empty-after-trim question without calling a provider', async () => {
    const result = await answerSupportQuestion(ask('   '));
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('invalid_question');
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('abstains, never answers, when the kill switch is off', async () => {
    delete process.env['SUPPORT_AGENT_ENABLED'];
    const result = await answerSupportQuestion(ask('how do I add my anthropic api key'));
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('agent_disabled');
    expect(result.handoffOffered).toBe(true);
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
  });

  it('abstains when routing reports no managed route, rather than throwing', async () => {
    modelMocks.resolveAutoRoute.mockReturnValue({
      status: 'unavailable',
      code: 'no_eligible_route',
      requestedSelection: 'auto',
      requestedProfile: null,
      effectiveProfile: null,
      taskType: 'simple_chat',
      reasons: ['none'],
    });
    const result = await answerSupportQuestion(ask('how do I add my anthropic api key'));
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('model_unavailable');
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
  });
});
