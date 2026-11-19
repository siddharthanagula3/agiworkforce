import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { getManualOverrideModelIds, getModelMetadataById } from '@agiworkforce/types';
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');
type AdapterResponseModule =
  typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response');
type LoggerModule = typeof import('@/lib/logger');
type PolicySourceModule = typeof import('@/lib/server/managed-cloud-routing/policy-source');

const owner = vi.hoisted(() => ({ trainingOptOut: false }));

const mocks = vi.hoisted(() => ({
  buildAdapter: vi.fn(),
  drain: vi.fn(),
  reserve: vi.fn(),
  lease: {
    providerStarted: vi.fn(async () => {}),
    completed: vi.fn(async (_input: unknown) => {}),
    failed: vi.fn(async (_record: unknown) => {}),
  },
}));

vi.mock('@/lib/services/background-usage-lease', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveBackgroundUsage: (input: unknown) => mocks.reserve(input),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function catalogProvider(model: string): string {
  const provider = getModelMetadataById(model)?.provider;
  if (!provider) throw new Error('Model is not registered in the canonical model catalog');
  return provider;
}

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterServiceModule>()),
  buildServerProviderAdapter: mocks.buildAdapter,
  resolveProviderFromModel: (model: string) => catalogProvider(model),
  listAvailableManagedProviderIds: () =>
    new Set(getManualOverrideModelIds().map((model) => catalogProvider(model))),
}));

vi.mock('@/lib/server/managed-cloud-routing/policy-source', async (importOriginal) => {
  const actual = await importOriginal<PolicySourceModule>();
  const { inMemoryPolicySource } =
    await import('@/lib/server/managed-cloud-routing/__tests__/in-memory-policy-source');
  return {
    ...actual,
    get productionPolicySource() {
      return inMemoryPolicySource({
        trainingOptOut: owner.trainingOptOut,
        deploymentRegion: actual.productionPolicySource.deploymentRegion(),
        availableProviderIds: new Set(
          getManualOverrideModelIds().map((model) => catalogProvider(model)),
        ),
      });
    },
  };
});

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => ({
  ...(await importOriginal<AdapterResponseModule>()),
  drainToLlmResponse: mocks.drain,
}));

import { reviewPullRequestDiff, reviewSummaryBody } from '@/lib/code-review/pipeline';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { admitManagedCloudRoute } from '@/lib/server/managed-cloud-routing/admission';

const DIFF = [
  'diff --git a/src/auth.ts b/src/auth.ts',
  '--- a/src/auth.ts',
  '+++ b/src/auth.ts',
  '@@ -10,3 +10,4 @@',
  '   const role = user.role;',
  '+  if (user.impersonating) return true;',
  ' }',
].join('\n');

const TRAINING_MODEL = getManualOverrideModelIds().find(
  (model) => !modelKeepsInputsOutOfTraining(model),
);

function review(trainingOptOut: boolean, preferredModel: string | null = null, planTier = 'pro') {
  owner.trainingOptOut = trainingOptOut;
  return reviewPullRequestDiff({
    diff: DIFF,
    prNumber: 7,
    planTier,
    postedCommentBodies: [],
    preferredModel,
    ownerUserId: 'user-1',
    billingDb: {} as never,
    reviewRef: 'attempt-1',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserve.mockResolvedValue(mocks.lease);
  mocks.buildAdapter.mockReturnValue({ stream: vi.fn(() => (async function* () {})()) });
  mocks.drain.mockResolvedValue({ content: '{"findings":[]}', completionTokens: 1 });
});

describe('automated code review is charged to the installing account', () => {
  it('reserves each model call against the owner’s budget and settles it', async () => {
    const outcome = await review(false);

    expect(outcome.status).toBe('no-findings');
    expect(mocks.reserve).toHaveBeenCalledTimes(mocks.drain.mock.calls.length);
    expect(mocks.reserve.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      planTier: 'pro',
      idempotencyKey: 'code-review:attempt-1:0:correctness',
      quotaFeature: 'code_review',
    });
    expect(mocks.lease.providerStarted).toHaveBeenCalledTimes(mocks.drain.mock.calls.length);
    expect(mocks.lease.completed).toHaveBeenCalledTimes(mocks.drain.mock.calls.length);
  });

  it('stops before any provider call when the budget refuses one', async () => {
    mocks.reserve.mockRejectedValueOnce(new Error('budget reached'));

    const outcome = await review(false);

    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'usage-budget' });
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it('releases the hold when the provider call fails', async () => {
    mocks.drain.mockRejectedValueOnce(new Error('upstream'));

    const outcome = await review(false);

    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'provider-error' });
    expect(mocks.lease.failed).toHaveBeenCalledTimes(1);
    expect(mocks.lease.completed).not.toHaveBeenCalled();
  });
});

describe('automated code review honours the provider-training opt-out', () => {
  it('needs a catalog model whose provider may train', () => {
    expect(TRAINING_MODEL).toBeDefined();
  });

  it('uses a configured model that may train when the account has not opted out', async () => {
    const outcome = await review(false, TRAINING_MODEL!);

    expect(outcome.status).toBe('no-findings');
    expect(mocks.drain).toHaveBeenCalled();
    for (const [, model] of mocks.drain.mock.calls) {
      expect(model).toBe(TRAINING_MODEL);
    }
  });

  it('reviews with Auto instead of a configured model that may train, and says so in the review', async () => {
    const outcome = await review(true, TRAINING_MODEL!);

    expect(outcome).toMatchObject({ status: 'no-findings', configuredModelSetAside: true });
    expect(mocks.buildAdapter).toHaveBeenCalled();
    for (const [provider] of mocks.buildAdapter.mock.calls) {
      expect(providerKeepsInputsOutOfTraining(provider as string)).toBe(true);
    }
    for (const [, model] of mocks.drain.mock.calls) {
      expect(model).not.toBe(TRAINING_MODEL);
      expect(modelKeepsInputsOutOfTraining(model as string)).toBe(true);
    }
    expect(reviewSummaryBody(outcome)).toContain(
      'The review model set for this installation was not used',
    );
  });

  it('keeps a configured model that may train out of the note when the account has not opted out', async () => {
    const outcome = await review(false, TRAINING_MODEL!);

    expect(outcome.configuredModelSetAside).toBeUndefined();
    expect(reviewSummaryBody(outcome)).not.toContain('was not used');
  });

  it.each(['free', 'pro', 'max'])(
    'routes Auto on %s only to a model and provider that keep inputs out of training',
    async (planTier) => {
      await review(true, null, planTier);

      for (const [provider] of mocks.buildAdapter.mock.calls) {
        expect(providerKeepsInputsOutOfTraining(provider as string)).toBe(true);
      }
      for (const [, model] of mocks.drain.mock.calls) {
        expect(modelKeepsInputsOutOfTraining(model as string)).toBe(true);
      }
    },
  );

  it('still reviews on Pro for an account that opted out', async () => {
    const outcome = await review(true);

    expect(outcome.status).toBe('no-findings');
    expect(mocks.buildAdapter).toHaveBeenCalled();
  });
});

describe('a configured review model passes the same admission as any other call', () => {
  it('reviews with Auto, without the training note, when the catalogue does not know the model', async () => {
    const outcome = await review(false, 'not-a-catalogue-model');

    expect(outcome.status).toBe('no-findings');
    expect(outcome.configuredModelSetAside).toBeUndefined();
    for (const [, model] of mocks.drain.mock.calls) {
      expect(model).not.toBe('not-a-catalogue-model');
    }
  });

  it('never sends the review to a configured model the owner’s plan does not admit', async () => {
    owner.trainingOptOut = false;
    let locked: string | undefined;
    for (const model of getManualOverrideModelIds()) {
      const admission = await admitManagedCloudRoute({
        kind: 'background',
        account: { db: null, userId: 'user-1', organizationId: null },
        planTier: 'free',
        need: { taskType: 'coding', selection: model, exactSelection: true },
      });
      if (admission.status === 'refused' && admission.reason === 'no_route') {
        locked = model;
        break;
      }
    }
    expect(locked).toBeDefined();

    const outcome = await review(false, locked!, 'free');

    expect(outcome.configuredModelSetAside).toBeUndefined();
    for (const [, model] of mocks.drain.mock.calls) {
      expect(model).not.toBe(locked);
    }
  });

  it('resolves the route once for the whole review', async () => {
    await review(false);

    expect(mocks.drain.mock.calls.length).toBeGreaterThan(1);
    const models = new Set(mocks.drain.mock.calls.map(([, model]) => model));
    expect(models.size).toBe(1);
  });
});
