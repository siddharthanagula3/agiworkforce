import { beforeEach, describe, expect, it, vi } from 'vitest';

type RoutingModule = typeof import('@agiworkforce/routing');
type ManagedUsageModule = typeof import('@/lib/services/managed-usage-request-service');
type AggregatorRoutingModule = typeof import('@/lib/services/aggregator-routing');
type ProviderAdapterModule = typeof import('@/lib/services/provider-adapter-service');

const mocks = vi.hoisted(() => ({
  routingRequest: vi.fn(),
  providerAllowed: vi.fn(),
  resolveAutoRoute: vi.fn(),
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
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/routing', async (importOriginal) => ({
  ...(await importOriginal<RoutingModule>()),
  resolveAutoRoute: mocks.resolveAutoRoute,
}));
vi.mock('@/lib/server/side-call-training-policy', () => ({
  sideCallRoutingRequest: mocks.routingRequest,
  sideCallProviderAllowed: mocks.providerAllowed,
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<AggregatorRoutingModule>()),
  dispatchProviderForSelectedRoute: (route: { provider: string }) => route.provider,
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
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', () => ({
  resolveWireMode: () => 'chat',
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: mocks.drain,
}));

import {
  SecurityScanBudgetError,
  SecurityScanNoRouteError,
  resolveSecurityScanModel,
} from '../model';

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.routingRequest.mockImplementation(async (_db, _user, request) => request);
  mocks.providerAllowed.mockResolvedValue(true);
  mocks.resolveAutoRoute.mockReturnValue(ROUTE);
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

describe('resolveSecurityScanModel', () => {
  it('routes on the managed coding route and settles each call as security scan usage', async () => {
    const model = await resolveSecurityScanModel(INPUT);
    await expect(model.call(CALL)).resolves.toEqual({ text: '{"findings":[]}' });

    expect(mocks.routingRequest).toHaveBeenCalledWith(
      INPUT.db,
      'user-1',
      expect.objectContaining({ taskType: 'coding', trustMode: 'managed_cloud' }),
    );
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

  it('has no route when the account allows no provider that keeps code out of training', async () => {
    mocks.routingRequest.mockResolvedValueOnce(null);
    await expect(resolveSecurityScanModel(INPUT)).rejects.toBeInstanceOf(SecurityScanNoRouteError);

    mocks.providerAllowed.mockResolvedValueOnce(false);
    await expect(resolveSecurityScanModel(INPUT)).rejects.toBeInstanceOf(SecurityScanNoRouteError);

    mocks.resolveAutoRoute.mockReturnValueOnce({ status: 'unavailable', code: 'none' });
    await expect(resolveSecurityScanModel(INPUT)).rejects.toBeInstanceOf(SecurityScanNoRouteError);
  });

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
