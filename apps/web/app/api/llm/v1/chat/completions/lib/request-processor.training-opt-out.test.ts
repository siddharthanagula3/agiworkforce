import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { modelRegistry, providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getManualOverrideModelIds,
  getModelMetadataById,
} from '@agiworkforce/types';
type RlsDbModule = typeof import('@/lib/server/rls-db');
type ContentSafetyModule = typeof import('@/lib/services/managed-content-safety-service');
type AttachmentHydrationModule = typeof import('./chat-attachment-hydration');
type MemoryContextModule = typeof import('@/lib/services/managed-memory-context-service');
type UserIdentityModule = typeof import('@/lib/server/user-identity');
type ManagedUsageModule = typeof import('@/lib/services/managed-usage-request-service');
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  managedProviderIds: vi.fn<() => Set<string> | null>(() => null),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
    organizationId: null,
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ContentSafetyModule>()),
  enforceManagedContentSafetyPreference: mocks.enforceSafety,
}));

vi.mock('./chat-attachment-hydration', async (importOriginal) => ({
  ...(await importOriginal<AttachmentHydrationModule>()),
  hydrateChatAttachments: mocks.hydrate,
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<MemoryContextModule>()),
  loadManagedMemoryPolicy: mocks.loadPolicy,
}));

vi.mock('@/lib/server/user-identity', async (importOriginal) => ({
  ...(await importOriginal<UserIdentityModule>()),
  buildCustomInstructionsPreamble: mocks.customInstructions,
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ManagedUsageModule>()),
  reserveManagedUsageRequest: mocks.reserveManagedUsage,
}));

function catalogProviders(): string[] {
  return getManualOverrideModelIds().flatMap((modelId) => {
    const provider = getModelMetadataById(modelId)?.provider;
    return provider ? [provider] : [];
  });
}

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => {
  const actual = await importOriginal<ProviderAdapterServiceModule>();
  return {
    ...actual,
    listAvailableManagedProviderIds: () =>
      mocks.managedProviderIds() ??
      new Set([...actual.listAvailableManagedProviderIds(), ...catalogProviders()]),
  };
});

import { CreditService } from '@/lib/services/credit-service';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { buildCompactionRoutingRequest, processRequest } from './request-processor';

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-09-01T00:00:00Z'),
  current_period_end: new Date('2026-10-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const proModels = getManualOverrideModelIds().filter((modelId) =>
  canAccessModelForSubscriptionTier(modelId, 'pro'),
);

const routeProviders = new Set(Object.values(modelRegistry.routes).map((route) => route.provider));

const mayTrainTransports = [...routeProviders].filter(
  (provider) => !providerKeepsInputsOutOfTraining(provider),
);

const credentialServingNoRoute = Object.keys(modelRegistry.governance).find(
  (provider) => providerKeepsInputsOutOfTraining(provider) && !routeProviders.has(provider),
);

function serveAccount(optedOut: boolean): void {
  mocks.scopedQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.user_settings')) return [{ opted_out: optedOut }];
    return [];
  });
}

function run(key: string, model: string) {
  return processRequest(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Summarize the notes I pasted below.' }],
        stream: false,
      }),
    }),
    { ok: true, userId: 'user-pro', token: 'session-token', subscription: proSubscription },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.managedProviderIds.mockReturnValue(null);
  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: { query: mocks.scopedQuery },
      userId: 'user-pro',
      idempotencyKey: 'lease-key',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );
  serveAccount(true);

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 1_000_000,
    credits_remaining_cents: 990_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

describe('the main chat route treats the training opt-out as admission, not ranking', () => {
  it('needs a transport that may train and a no-training credential that serves no route', () => {
    expect(mayTrainTransports.length).toBeGreaterThan(0);
    expect(credentialServingNoRoute).toBeDefined();
  });

  it('serves Auto for an opted-out account only through providers that keep inputs out of training', async () => {
    const result = await run('opt-out-auto', 'auto');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noTrainingOnly).toBe(true);
    expect(modelKeepsInputsOutOfTraining(result.chatRequest.model)).toBe(true);
    expect(providerKeepsInputsOutOfTraining(result.provider)).toBe(true);
  });

  it('serves an opted-out account only through providers that keep inputs out of training, whichever transport holds the credential', async () => {
    const refusals = new Set<string>();
    for (const transport of mayTrainTransports) {
      for (const model of ['auto', ...proModels]) {
        mocks.managedProviderIds.mockReturnValue(new Set([transport, credentialServingNoRoute!]));

        const result = await run(`opt-out-${transport}-${model}`, model);

        if (!result.ok) {
          refusals.add(`${result.response.status} ${(await result.response.json()).error.code}`);
          continue;
        }
        expect(providerKeepsInputsOutOfTraining(result.provider), `${model} via ${transport}`).toBe(
          true,
        );
        expect(modelKeepsInputsOutOfTraining(result.chatRequest.model)).toBe(true);
        for (const route of result.fallbackRoutes ?? []) {
          expect(providerKeepsInputsOutOfTraining(route.provider)).toBe(true);
        }
      }
    }
    expect(refusals).toContain('403 model_may_train');
    expect(
      [...refusals].filter(
        (refusal) =>
          ![
            '403 model_may_train',
            '403 no_training_model_available',
            '422 model_route_unavailable',
          ].includes(refusal),
      ),
    ).toEqual([]);
  }, 60_000);

  it('moves an opted-out account short on credit only to a cheaper model that keeps inputs out of training', async () => {
    vi.spyOn(CreditService, 'checkAvailableMicrousd')
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const expensive = getManualOverrideModelIds().find(
      (modelId) =>
        canAccessModelForSubscriptionTier(modelId, 'pro') &&
        modelKeepsInputsOutOfTraining(modelId) &&
        !getAllowedModelsForTier('economy').includes(modelId),
    )!;

    const result = await run('opt-out-credit', expensive);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallbackReason).toBe('insufficient_credits');
    expect(modelKeepsInputsOutOfTraining(result.chatRequest.model)).toBe(true);
    expect(providerKeepsInputsOutOfTraining(result.provider)).toBe(true);
  });
});

describe('context compaction carries the training opt-out', () => {
  it('asks the router to refuse routes that may train when the account opted out', () => {
    expect(buildCompactionRoutingRequest({ noTrainingOnly: true })).toMatchObject({
      noTrainingOnly: true,
    });
    expect(buildCompactionRoutingRequest({})).not.toHaveProperty('noTrainingOnly');
  });
});
