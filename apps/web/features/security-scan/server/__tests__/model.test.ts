import { beforeEach, describe, expect, it, vi } from 'vitest';

type AdmissionModule = typeof import('@/lib/server/managed-cloud-routing/admission');
type ManagedUsageModule = typeof import('@/lib/services/managed-usage-request-service');
type ProviderAdapterModule = typeof import('@/lib/services/provider-adapter-service');

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  reserve: vi.fn(),
  drain: vi.fn(),
  stream: vi.fn((_request: unknown, _signal: unknown) => ({})),
  lease: {
    providerStarted: vi.fn(),
    completed: vi.fn(),
    failed: vi.fn(),
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/managed-cloud-routing/admission', async (importOriginal) => ({
  ...(await importOriginal<AdmissionModule>()),
  admitManagedCloudRoute: mocks.admit,
}));
vi.mock('@/lib/services/background-usage-lease', () => ({
  reserveBackgroundUsage: mocks.reserve,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ManagedUsageModule>()),
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterModule>()),
  buildServerProviderAdapter: () => ({ stream: mocks.stream }),
  toGenericUpstreamError: vi.fn(),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', async (importOriginal) => ({
  ...(await importOriginal<AdapterProvidersModule>()),
  resolveWireMode: () => 'chat',
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: mocks.drain,
}));

import { getModelEffortOptions, getSelectableModels } from '@agiworkforce/types';
import {
  SecurityScanBudgetError,
  SecurityScanNoRouteError,
  resolveSecurityScanModel,
} from '../model';

type AdapterProvidersModule =
  typeof import('@/app/api/llm/v1/chat/completions/lib/adapter-providers');

type LoggerModule = typeof import('@/lib/logger');

const INPUT = {
  db: {} as never,
  userId: 'user-1',
  organizationId: null,
  planTier: 'pro',
  scanId: '22222222-2222-4222-8222-222222222222',
};

const ROUTE = {
  status: 'selected',
  provider: 'provider-a',
  routeId: 'route-a',
  modelKey: 'model-a',
  providerModelId: 'model-a',
};

function admitted(route: typeof ROUTE) {
  return { status: 'admitted', route, dispatchProvider: route.provider };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admit.mockResolvedValue(admitted(ROUTE));
  mocks.reserve.mockResolvedValue(mocks.lease);
  mocks.lease.providerStarted.mockResolvedValue(undefined);
  mocks.lease.completed.mockResolvedValue(undefined);
  mocks.lease.failed.mockResolvedValue(undefined);
  mocks.drain.mockResolvedValue({
    content: '{"findings":[]}',
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
  });
});

const CALL = {
  ref: 'scan:0',
  system: 'SCAN-INSTRUCTIONS',
  prompt: 'REPOSITORY-SOURCE',
  maxOutputTokens: 100,
};

describe('resolveSecurityScanModel choice', () => {
  it('routes on the model the account chose and sends the effort that model offers', async () => {
    const option = getSelectableModels().find(
      (model) => getModelEffortOptions(model.id).length > 0,
    );
    expect(option).toBeDefined();
    const effort = getModelEffortOptions(option!.id)[0]!;
    mocks.admit.mockResolvedValue(
      admitted({ ...ROUTE, modelKey: option!.id, providerModelId: option!.id }),
    );

    const model = await resolveSecurityScanModel({ ...INPUT, selection: option!.id, effort });
    await model.call(CALL);

    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({ need: { selection: option!.id, taskType: 'coding' } }),
    );
    expect(mocks.stream).toHaveBeenCalledWith(
      expect.objectContaining({ effort: expect.any(String) }),
      expect.anything(),
    );
  });

  it('leaves the effort off a model that does not offer it', async () => {
    const model = await resolveSecurityScanModel({ ...INPUT, effort: 'high' });
    await model.call(CALL);

    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({ need: { taskType: 'coding' } }),
    );
    expect(mocks.stream.mock.calls[0]?.[0]).not.toHaveProperty('effort');
  });
});

describe('resolveSecurityScanModel', () => {
  it('asks for a background coding route for the account and workspace on its plan, and settles each call as security scan usage', async () => {
    const model = await resolveSecurityScanModel({ ...INPUT, organizationId: 'org-1' });
    await expect(model.call(CALL)).resolves.toEqual({ text: '{"findings":[]}' });

    expect(mocks.admit).toHaveBeenCalledWith({
      kind: 'background',
      account: { db: INPUT.db, userId: 'user-1', organizationId: 'org-1' },
      planTier: 'pro',
      need: { taskType: 'coding' },
    });
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `security-scan:${INPUT.scanId}:scan:0`,
        quotaFeature: 'security_scan',
        provider: 'provider-a',
      }),
    );
    expect(mocks.lease.completed).toHaveBeenCalled();
    const request = JSON.stringify(mocks.stream.mock.calls[0]?.[0]);
    expect(request).toContain('"SCAN-INSTRUCTIONS"');
    expect(request).toContain('"REPOSITORY-SOURCE"');
  });

  it.each([['no_training_route'], ['no_route'], ['policy_unreadable']])(
    'has no route and never reserves when admission refuses with %s',
    async (reason) => {
      mocks.admit.mockResolvedValueOnce({ status: 'refused', reason, code: null });

      await expect(resolveSecurityScanModel(INPUT)).rejects.toBeInstanceOf(
        SecurityScanNoRouteError,
      );
      expect(mocks.reserve).not.toHaveBeenCalled();
    },
  );

  it('reports a refused reservation as a budget error and releases a failed call', async () => {
    const model = await resolveSecurityScanModel(INPUT);
    mocks.reserve.mockRejectedValueOnce(new Error('quota'));
    await expect(model.call(CALL)).rejects.toBeInstanceOf(SecurityScanBudgetError);

    mocks.drain.mockRejectedValueOnce(new Error('upstream'));
    await expect(model.call(CALL)).rejects.toThrow('upstream');
    expect(mocks.lease.failed).toHaveBeenCalled();
    expect(mocks.lease.completed).not.toHaveBeenCalled();
  });
});
