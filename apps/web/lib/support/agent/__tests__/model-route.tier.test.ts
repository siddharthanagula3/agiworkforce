import { beforeEach, describe, expect, it, vi } from 'vitest';
type RoutingModule = typeof import('@agiworkforce/routing');

type ScanModule0 = typeof import('@/lib/server/side-call-training-policy');
type ScanModule1 = typeof import('@/lib/services/provider-adapter-service');
type ScanModule2 = typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response');

vi.mock('@/lib/server/side-call-training-policy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  sideCallRoutingRequest: async (_db: unknown, _userId: string, request: unknown) => request,
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<RoutingModule>();
  const { modelMocks } = await import('./fixtures/model-mocks');
  return { ...actual, resolveAutoRoute: modelMocks.resolveAutoRoute };
});
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<ScanModule1>()),
    buildServerProviderAdapter: modelMocks.buildServerProviderAdapter,
    toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  };
});
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => {
  const { modelMocks } = await import('./fixtures/model-mocks');
  return {
    ...(await importOriginal<ScanModule2>()),
    drainToLlmResponse: modelMocks.drainToLlmResponse,
  };
});

import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  SELF_SERVE_PAID_PLAN_TIERS,
  getRoutingSlotModel,
} from '@agiworkforce/types';
import {
  admitEveryModelCall,
  armModelMocks,
  BYOK_GROUNDED_ANSWER,
  BYOK_QUESTION,
  modelMocks,
  queueModelJson,
  SELECTED_ROUTE,
} from './fixtures/model-mocks';
import { answerSupportQuestion } from '../answer/synthesize';
import { retrieveSupportChunks } from '../retrieval/retrieve';
import type { SupportAnswerInput, SupportViewer } from '../types';

const LOWEST_PAID_TIER = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER[0];

const ASKERS: readonly (readonly [label: string, viewer: SupportViewer])[] = [
  ['a signed-out visitor', { isSignedIn: false, userId: null, planTier: null }],
  ['a Free user', { isSignedIn: true, userId: 'user_free', planTier: 'free' }],
  ['a user with no resolved plan', { isSignedIn: true, userId: 'user_unknown', planTier: null }],
  ['a Pro user', { isSignedIn: true, userId: 'user_pro', planTier: 'pro' }],
  ['a Max user', { isSignedIn: true, userId: 'user_max', planTier: 'max' }],
];

function ask(viewer: SupportViewer): SupportAnswerInput {
  return {
    question: BYOK_QUESTION,
    surface: viewer.isSignedIn ? 'app' : 'marketing',
    viewer,
    admitModelCall: admitEveryModelCall,
  };
}

function queueGroundedAnswer(): void {
  queueModelJson({
    answer: BYOK_GROUNDED_ANSWER,
    citedChunkIds: [retrieveSupportChunks(BYOK_QUESTION).chunks[0]?.chunk.id],
    abstain: false,
    abstainReason: '',
    proposedActionId: null,
  });
}

describe('the support assistant routes as a company function, not a plan entitlement', () => {
  beforeEach(() => {
    armModelMocks();
    modelMocks.resolveAutoRoute.mockClear();
  });

  it('takes its tier from the paid plan ladder rather than naming one', () => {
    expect(SELF_SERVE_PAID_PLAN_TIERS).toContain(LOWEST_PAID_TIER);
  });

  it.each(ASKERS)(
    'routes %s on the lowest paid tier, never the free one',
    async (_label, viewer) => {
      queueGroundedAnswer();

      const result = await answerSupportQuestion(ask(viewer));

      expect(result.kind).toBe('answer');
      expect(modelMocks.resolveAutoRoute).toHaveBeenCalledTimes(1);
      const [request] = modelMocks.resolveAutoRoute.mock.calls[0]!;
      expect(request.subscriptionTier).toBe(LOWEST_PAID_TIER);
      expect(request.subscriptionTier).not.toBe(viewer.planTier === 'free' ? 'free' : null);
      expect(request.taskType).toBe('simple_chat');
      expect(request.trustMode).toBe('managed_cloud');
    },
  );

  it('abstains instead of answering on the zero-cost router when that is all routing offers', async () => {
    modelMocks.resolveAutoRoute.mockReturnValue({
      ...SELECTED_ROUTE,
      modelKey: getRoutingSlotModel('router_zero_cost'),
      reason: 'fallback_slot',
    });
    queueGroundedAnswer();

    const result = await answerSupportQuestion(
      ask({ isSignedIn: false, userId: null, planTier: null }),
    );

    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('model_unavailable');
    expect(result.handoffOffered).toBe(true);
    expect(modelMocks.buildServerProviderAdapter).not.toHaveBeenCalled();
    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
  });
});

describe('the support tier against the real router', () => {
  it('resolves a paid route that is not the zero-cost router, while the free tier resolves to exactly that router', async () => {
    const { resolveAutoRoute } = await vi.importActual<RoutingModule>('@agiworkforce/routing');
    const request = {
      selection: 'auto',
      taskType: 'simple_chat',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    } as const;

    const support = resolveAutoRoute({ ...request, subscriptionTier: LOWEST_PAID_TIER });
    const unpaid = resolveAutoRoute({ ...request, subscriptionTier: null });

    expect(support.status).toBe('selected');
    expect(unpaid.status).toBe('selected');
    if (support.status !== 'selected' || unpaid.status !== 'selected') return;
    expect(unpaid.modelKey).toBe(getRoutingSlotModel('router_zero_cost'));
    expect(support.modelKey).not.toBe(getRoutingSlotModel('router_zero_cost'));
    expect(support.modelKey).not.toBe(unpaid.modelKey);
  });
});

describe('the model-call gate', () => {
  beforeEach(() => {
    armModelMocks();
  });

  const viewer: SupportViewer = { isSignedIn: false, userId: null, planTier: null };

  it('is consumed exactly once, and only when a model call is about to be made', async () => {
    const admitModelCall = vi.fn(async () => true);
    queueGroundedAnswer();

    const result = await answerSupportQuestion({ ...ask(viewer), admitModelCall });

    expect(result.kind).toBe('answer');
    expect(admitModelCall).toHaveBeenCalledTimes(1);
    expect(modelMocks.drainToLlmResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a hard-abstain question', 'why was I charged twice this month'],
    ['an out-of-scope request', 'write an essay about climate change'],
    ['a question under the relevance floor', 'how do I configure the Cassandra replication factor'],
    ['an unreadable question', '   '],
  ])('is not consumed by %s, which costs nothing', async (_label, question) => {
    const admitModelCall = vi.fn(async () => true);

    const result = await answerSupportQuestion({ ...ask(viewer), question, admitModelCall });

    expect(result.kind).toBe('abstention');
    expect(admitModelCall).not.toHaveBeenCalled();
    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
  });

  it('turns a refusal into the unavailable abstention that names the limit and the help centre', async () => {
    queueGroundedAnswer();

    const result = await answerSupportQuestion({
      ...ask(viewer),
      admitModelCall: async () => false,
    });

    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('model_unavailable');
    expect(result.text).toContain('reached its limit for now');
    expect(result.text).toContain('help centre');
    expect(result.handoffOffered).toBe(true);
    expect(result.authoritativeLinks.map((link) => new URL(link.url).pathname)).toEqual(['/help']);
  });

  it('refuses the call when the gate itself fails', async () => {
    queueGroundedAnswer();

    const result = await answerSupportQuestion({
      ...ask(viewer),
      admitModelCall: async () => {
        throw new Error('limiter down');
      },
    });

    expect(modelMocks.drainToLlmResponse).not.toHaveBeenCalled();
    expect(result.kind).toBe('abstention');
    if (result.kind !== 'abstention') return;
    expect(result.reason).toBe('model_unavailable');
  });
});
