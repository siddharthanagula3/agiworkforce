import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoutingSlotModel,
  listManagedRoutesForModel,
  getRegistryRoute,
} from '@agiworkforce/types';
import { RETRIEVAL_EMBEDDING_DIMENSIONS } from '@agiworkforce/data-layer/search';

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  finalize: vi.fn(),
  started: vi.fn(),
  access: vi.fn(),
  gatewayEmbed: vi.fn(),
  available: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
  finalizeManagedUsageRequest: mocks.finalize,
  markManagedUsageProviderStarted: mocks.started,
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evaluateManagedComputeAccess: mocks.access,
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAvailableManagedProviderIds: mocks.available,
  resolveServerProviderCredentials: vi.fn(() => ({ apiKey: 'gateway-key' })),
}));
vi.mock('@agiworkforce/providers-factory', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createVercelGatewayEmbeddings: vi.fn(() => ({ embed: mocks.gatewayEmbed })),
}));

const { embedTextsMetered, resolveRetrievalEmbeddingRoute, RetrievalEmbeddingError } =
  await import('../retrieval-embedding-service');

const EMBEDDING_MODEL = getRoutingSlotModel('embedding_default');
const GATEWAY_ROUTE = listManagedRoutesForModel(EMBEDDING_MODEL).find(
  (route) => getRegistryRoute(route.routeId)?.harnessId === 'vercel_gateway/embeddings',
);

const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available.mockReturnValue(new Set(['vercel_gateway']));
  mocks.access.mockResolvedValue({
    allowed: true,
    code: 'allowed',
    reason: '',
    organizationId: null,
  });
  mocks.reserve.mockResolvedValue({ idempotencyKey: 'key', leaseToken: 'lease' });
  mocks.finalize.mockResolvedValue({});
  mocks.started.mockResolvedValue(undefined);
});

describe('resolveRetrievalEmbeddingRoute', () => {
  it('routes the embedding slot through the AI Gateway route the registry declares', () => {
    expect(GATEWAY_ROUTE).toBeDefined();
    const route = resolveRetrievalEmbeddingRoute(new Set(['vercel_gateway']));
    expect(route).toMatchObject({
      provider: 'vercel_gateway',
      harnessId: 'vercel_gateway/embeddings',
      providerModelId: GATEWAY_ROUTE?.providerModelId,
    });
    expect(route?.model.id).toBe(EMBEDDING_MODEL);
  });

  it('finds no route when no embedding provider is credentialed', () => {
    expect(resolveRetrievalEmbeddingRoute(new Set())).toBeNull();
  });
});

describe('embedTextsMetered', () => {
  it('reserves, calls the gateway at the index width and settles the billed tokens', async () => {
    mocks.gatewayEmbed.mockResolvedValue({
      vectors: [[0.1], [0.2]],
      promptTokens: 42,
    });

    const result = await embedTextsMetered({
      db,
      userId: 'user-1',
      organizationId: null,
      texts: ['first', 'second'],
      purpose: 'document',
      operationKey: 'doc-1:1:0',
    });

    expect(result.model).toBe(EMBEDDING_MODEL);
    expect(mocks.gatewayEmbed).toHaveBeenCalledWith({
      model: GATEWAY_ROUTE?.providerModelId,
      input: ['first', 'second'],
      dimensions: RETRIEVAL_EMBEDDING_DIMENSIONS,
    });
    const reservation = mocks.reserve.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(reservation).toMatchObject({
      userId: 'user-1',
      provider: 'vercel_gateway',
      model: EMBEDDING_MODEL,
      isFlagship: false,
    });
    expect(String(reservation['idempotencyKey']).length).toBeLessThanOrEqual(128);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed',
        usage: expect.objectContaining({
          type: 'retrieval_embedding',
          promptTokens: 42,
          providerCallObservations: [
            expect.objectContaining({ provider: 'vercel_gateway', model: EMBEDDING_MODEL }),
          ],
        }),
      }),
    );
  });

  it('fingerprints what was sent, so one key cannot cover two different texts', async () => {
    mocks.gatewayEmbed.mockResolvedValue({ vectors: [[0.1]], promptTokens: 1 });
    const call = (text: string) =>
      embedTextsMetered({
        db,
        userId: 'user-1',
        organizationId: null,
        texts: [text],
        purpose: 'query',
        operationKey: 'user-1:message',
      });

    await call('alpha');
    await call('gamma');
    await call('alpha');

    const hashes = mocks.reserve.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>)['requestHash'],
    );
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(hashes[0]).toBe(hashes[2]);
  });

  it('releases the reservation and reports a provider failure', async () => {
    mocks.gatewayEmbed.mockRejectedValue(new Error('upstream down'));

    await expect(
      embedTextsMetered({
        db,
        userId: 'user-1',
        organizationId: null,
        texts: ['first'],
        purpose: 'query',
        operationKey: 'user-1:search',
      }),
    ).rejects.toMatchObject({ code: 'provider_failed' });
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
  });

  it('never reserves for a caller without managed compute', async () => {
    mocks.access.mockResolvedValue({
      allowed: false,
      code: 'policy_denied',
      reason: 'Workspace policy blocks managed compute.',
      organizationId: 'org-1',
    });

    const failure = embedTextsMetered({
      db,
      userId: 'user-1',
      organizationId: 'org-1',
      texts: ['first'],
      purpose: 'query',
      operationKey: 'user-1:search',
    });
    await expect(failure).rejects.toBeInstanceOf(RetrievalEmbeddingError);
    await expect(failure).rejects.toMatchObject({ code: 'not_entitled' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
