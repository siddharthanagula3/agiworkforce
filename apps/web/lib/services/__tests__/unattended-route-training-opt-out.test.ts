import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  optOut: 'off' as 'on' | 'off' | 'unreadable',
  reserve: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/routing')>()),
  classifyTaskLocally: vi.fn(() => ({ type: 'general', confidence: 0.8 })),
  resolveAutoRoute: vi.fn(),
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/provider-adapter-service')>()),
  listAvailableManagedProviderIds: vi.fn(),
}));
vi.mock('@/lib/auth/account-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account-lifecycle')>()),
  readAccountStatus: vi.fn(async () => 'active'),
}));
vi.mock('@/lib/server/terms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/terms')>()),
  mustAcceptTerms: vi.fn(async () => false),
}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/capability-gate')>()),
  assertCapabilityAvailable: vi.fn(async () => undefined),
}));
vi.mock('@/lib/feature-flags/flag-evaluation-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/flag-evaluation-service')>()),
  buildFlagSubject: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitlementBundle: vi.fn(async () => ({ plan: 'pro', subscription: null })),
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-compute-access')>()),
  evaluateManagedComputeAccess: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  reserveManagedUsageRequest: state.reserve,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/claimed-user-scope-db')>()),
  createClaimedUserScopedDb: () => optOutDb(),
}));

import { resolveAutoRoute } from '@agiworkforce/routing';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';
import { noTrainingChatModelFor } from '@/lib/server/provider-training-opt-out';
import { answerMobileIntentAsk, MobileIntentRefusal } from '@/lib/server/mobile-intent';
import { NoTrainingRouteError, selectUnattendedRoute } from '../scheduled-agent-executor';

const PROVIDERS = ['anthropic', 'openai', 'google', 'xai', 'deepseek', 'mistral'];
const NO_TRAINING = new Set(PROVIDERS.filter(providerKeepsInputsOutOfTraining));
const MAY_TRAIN = new Set(
  PROVIDERS.filter((provider) => !providerKeepsInputsOutOfTraining(provider)),
);
const NO_TRAINING_MODEL = noTrainingChatModelFor('pro');

function optOutDb() {
  return {
    query: vi.fn(async (sql: string) => {
      if (!/user_settings/.test(sql)) return [];
      if (state.optOut === 'unreadable') throw new Error('settings unavailable');
      return [{ opted_out: state.optOut === 'on' }];
    }),
    execute: vi.fn(),
  };
}

function selected(modelKey: string) {
  return {
    status: 'selected',
    requestedSelection: 'auto',
    requestedProfile: 'balanced',
    effectiveProfile: 'balanced',
    taskType: 'general',
    modelKey,
    provider: 'anthropic',
    providerModelId: modelKey,
    routeId: 'route-1',
    harnessId: 'managed/chat',
    fallbacks: [],
    reason: 'preferred_slot',
  } as never;
}

const scope = () => ({ db: optOutDb(), userId: 'user-1' });
const lastRouting = () =>
  vi.mocked(resolveAutoRoute).mock.calls.at(-1)?.[0] as { availableProviderIds?: Set<string> };

beforeEach(() => {
  vi.clearAllMocks();
  state.optOut = 'off';
  vi.mocked(listAvailableManagedProviderIds).mockReturnValue(new Set(PROVIDERS));
  vi.mocked(resolveAutoRoute).mockReturnValue(selected(NO_TRAINING_MODEL ?? 'model-key'));
});

describe('scheduled routines honour the provider-training opt-out', () => {
  it('prerequisites: both kinds of provider and a no-training model exist', () => {
    expect(NO_TRAINING.size).toBeGreaterThan(0);
    expect(MAY_TRAIN.size).toBeGreaterThan(0);
    expect(NO_TRAINING_MODEL).not.toBeNull();
  });

  it('leaves routing open when the setting is off', async () => {
    await selectUnattendedRoute(scope(), 'auto', 'general', 'pro', false);
    expect(lastRouting().availableProviderIds).toBeUndefined();
  });

  it.each(['on', 'unreadable'] as const)(
    'keeps the run on no-training providers when the setting is %s',
    async (setting) => {
      state.optOut = setting;
      await selectUnattendedRoute(scope(), 'auto', 'general', 'pro', false);
      expect(lastRouting().availableProviderIds).toEqual(NO_TRAINING);
    },
  );

  it('refuses when the setting is on and no provider keeps inputs out of training', async () => {
    state.optOut = 'on';
    vi.mocked(listAvailableManagedProviderIds).mockReturnValue(MAY_TRAIN);
    await expect(selectUnattendedRoute(scope(), 'auto', 'general', 'pro', false)).rejects.toThrow(
      NoTrainingRouteError,
    );
    expect(resolveAutoRoute).not.toHaveBeenCalled();
  });
});

describe('Ask from Siri honours the provider-training opt-out', () => {
  const ask = () =>
    answerMobileIntentAsk({
      request: new Request('https://example.test/api/mobile/intent/ask'),
      owner: {
        tokenId: 'token-1',
        userId: 'user-1',
        organizationId: null,
        installId: 'install-1',
        defaultModelId: null,
      },
      prompt: 'What is the capital of France?',
      signal: new AbortController().signal,
    });

  beforeEach(() => {
    state.reserve.mockRejectedValue(new Error('stop after routing'));
  });

  it('routes freely when the setting is off', async () => {
    await expect(ask()).rejects.toThrow('stop after routing');
    expect(lastRouting().availableProviderIds).toBeUndefined();
  });

  it.each(['on', 'unreadable'] as const)(
    'routes only to no-training providers when the setting is %s',
    async (setting) => {
      state.optOut = setting;
      await expect(ask()).rejects.toThrow('stop after routing');
      expect(lastRouting().availableProviderIds).toEqual(NO_TRAINING);
    },
  );

  it('answers with the curated refusal when no no-training model qualifies', async () => {
    state.optOut = 'on';
    vi.mocked(listAvailableManagedProviderIds).mockReturnValue(MAY_TRAIN);
    const refusal = await ask().catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(MobileIntentRefusal);
    expect(refusal).toMatchObject({
      status: 503,
      code: 'no_training_model_available',
      message: expect.stringContaining('keeps your chats out of training'),
    });
    expect(state.reserve).not.toHaveBeenCalled();
  });
});
