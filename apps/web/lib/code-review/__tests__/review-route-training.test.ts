import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { getManualOverrideModelIds, getModelMetadataById } from '@agiworkforce/types';
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');
type AdapterResponseModule =
  typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-response');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  buildAdapter: vi.fn(),
  drain: vi.fn(),
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

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', async (importOriginal) => ({
  ...(await importOriginal<AdapterResponseModule>()),
  drainToLlmResponse: mocks.drain,
}));

import { reviewPullRequestDiff } from '@/lib/code-review/pipeline';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';

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

function review(noTrainingOnly: boolean, preferredModel: string | null = null, planTier = 'pro') {
  return reviewPullRequestDiff({
    diff: DIFF,
    prNumber: 7,
    planTier,
    postedCommentBodies: [],
    preferredModel,
    ownerUserId: 'user-1',
    noTrainingOnly,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildAdapter.mockReturnValue({ stream: vi.fn(() => (async function* () {})()) });
  mocks.drain.mockResolvedValue({ content: '{"findings":[]}', completionTokens: 1 });
});

describe('automated code review honours the provider-training opt-out', () => {
  it('needs a catalog model whose provider may train', () => {
    expect(TRAINING_MODEL).toBeDefined();
  });

  it('uses a configured model that may train when the account has not opted out', async () => {
    const outcome = await review(false, TRAINING_MODEL!);

    expect(outcome.status).toBe('no-findings');
    expect(mocks.buildAdapter).toHaveBeenCalledWith(catalogProvider(TRAINING_MODEL!));
  });

  it('refuses a configured model that may train for an account that opted out', async () => {
    const outcome = await review(true, TRAINING_MODEL!);

    expect(outcome).toMatchObject({ status: 'unavailable', reason: 'no-route' });
    expect(mocks.buildAdapter).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
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
