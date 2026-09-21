import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (callback: () => unknown) => {
      afterCallbacks.push(callback);
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors')>('@/lib/errors');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/error-handler')>('@/lib/error-handler');
  return { withErrorHandler: actual.withErrorHandler, handleError: actual.handleError };
});

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  scoped: vi.fn(),
  storeReady: vi.fn(),
  getJob: vi.fn(),
  assetIds: vi.fn(),
  runAttempt: vi.fn(),
  delivered: vi.fn(),
  finalize: vi.fn(),
  closeCancelled: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.authUser(...args),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.scoped(...args),
}));

vi.mock('@/lib/server/media-storage', () => ({
  authenticatedMediaUrl: (assetId: string) => `/api/files/${assetId}`,
  isImageStorageConfigured: () => true,
  bytesFromBase64: vi.fn(),
  bytesFromUrl: vi.fn(),
  deleteStoredMedia: vi.fn(),
  storeMedia: vi.fn(),
  readStoredMedia: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: (...args: unknown[]) => mocks.delivered(...args),
  markManagedUsageProviderStarted: vi.fn(),
  finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
}));

vi.mock('@/lib/server/image-generation-jobs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/image-generation-jobs')>(
    '@/lib/server/image-generation-jobs',
  );
  return {
    ...actual,
    isImageJobStoreReady: (...args: unknown[]) => mocks.storeReady(...args),
    getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
    listImageGenerationJobAssetIds: (...args: unknown[]) => mocks.assetIds(...args),
    closeCancelledImageGenerationJob: (...args: unknown[]) => mocks.closeCancelled(...args),
  };
});

vi.mock('../../app/api/media/image/lib/image-job-executor', async () => {
  const actual = await vi.importActual<
    typeof import('../../app/api/media/image/lib/image-job-executor')
  >('../../app/api/media/image/lib/image-job-executor');
  return {
    ...actual,
    runImageGenerationJobAttempt: (...args: unknown[]) => mocks.runAttempt(...args),
  };
});

import { GET } from '../../app/api/media/image/status/route';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const ASSET_ID = '44444444-4444-4444-8444-444444444444';

function job(overrides: Partial<ImageGenerationJob> = {}): ImageGenerationJob {
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    conversationId: null,
    idempotencyKey: 'agi.media.web.image.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-image',
    provider: 'openai',
    model: 'catalog-image-model',
    operation: 'generate',
    prompt: 'a sunset',
    plan: {
      aspectRatio: '1:1',
      quality: 'standard',
      legacySize: '1024x1024',
      transparentBackground: false,
    },
    sourceImageSha256: null,
    maskImageSha256: null,
    imageCount: 1,
    sourceSurface: 'web',
    estimatedCostMicrousd: 8000,
    actualCostMicrousd: null,
    status: 'queued',
    attempts: 1,
    maxAttempts: 3,
    attemptStartedAt: null,
    retryable: false,
    publicError: null,
    cancelRequestedAt: null,
    billingOutcome: null,
    billingSettlementStatus: null,
    nextAttemptAt: new Date(Date.now() - 60_000).toISOString(),
    claimToken: null,
    claimExpiresAt: null,
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    terminalAt: null,
    ...overrides,
  };
}

function statusRequest(jobId: string): NextRequest {
  return new NextRequest(`https://app.test/api/media/image/status?job_id=${jobId}`, {
    method: 'GET',
  });
}

describe('GET /api/media/image/status', () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.scoped.mockResolvedValue({ userId: 'user-1', organizationId: null, db: {} });
    mocks.storeReady.mockResolvedValue(true);
    mocks.assetIds.mockResolvedValue([]);
    mocks.finalize.mockResolvedValue({ settlementStatus: 'succeeded', requestStatus: 'released' });
    mocks.closeCancelled.mockResolvedValue(null);
    mocks.runAttempt.mockResolvedValue({
      job: job(),
      images: [],
      providerModel: null,
      provenance: [],
    });
  });

  it('finishes a cancellation whose attempt never came back, and reports it canceled', async () => {
    const cancelling = job({
      status: 'processing',
      cancelRequestedAt: new Date(Date.now() - 300_000).toISOString(),
      claimExpiresAt: new Date(Date.now() - 120_000).toISOString(),
    });
    mocks.getJob.mockResolvedValue(cancelling);
    mocks.closeCancelled.mockResolvedValue({
      ...cancelling,
      status: 'canceled',
      retryable: false,
      terminalAt: new Date().toISOString(),
    });

    const response = await GET(statusRequest(JOB_ID));
    const body = (await response.json()) as Record<string, unknown>;

    expect(body['status']).toBe('canceled');
    expect(body['retryable']).toBe(false);
    // The reservation is released before the row closes, so a row that still
    // says it is running is a job that was never settled.
    const settled = mocks.finalize.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(settled['outcome']).toBe('failed');
    expect(settled['actualCostMicrousd']).toBe(0);
    expect((settled['usage'] as Record<string, unknown>)['reason']).toBe('canceled_by_user');
    expect(mocks.closeCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: JOB_ID, userId: 'user-1', billingOutcome: 'released' }),
    );
    expect(mocks.runAttempt).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('leaves a cancellation alone while its attempt still holds the claim', async () => {
    mocks.getJob.mockResolvedValue(
      job({
        status: 'processing',
        cancelRequestedAt: new Date().toISOString(),
        claimExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    );

    const response = await GET(statusRequest(JOB_ID));

    expect(response.status).toBe(200);
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.closeCancelled).not.toHaveBeenCalled();
  });

  it('refuses a job that does not belong to the caller', async () => {
    mocks.getJob.mockResolvedValue(null);
    const response = await GET(statusRequest(JOB_ID));
    expect(response.status).toBe(403);
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('reports a queued job with its attempt count and re-drives the abandoned attempt', async () => {
    mocks.getJob.mockResolvedValue(job());
    const response = await GET(statusRequest(JOB_ID));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['job_id']).toBe(JOB_ID);
    expect(body['status']).toBe('queued');
    expect(body['attempts']).toBe(1);
    expect(body['max_attempts']).toBe(3);

    // The response is sent first; the provider call runs after it, so polling
    // never waits on a provider.
    expect(mocks.runAttempt).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]!();
    expect(mocks.runAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not re-drive a job whose attempt is still claimed', async () => {
    mocks.getJob.mockResolvedValue(
      job({
        status: 'processing',
        claimToken: 'claim-token-1234',
        claimExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    const response = await GET(statusRequest(JOB_ID));
    expect(response.status).toBe(200);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('returns the delivered candidates and marks them delivered once completed', async () => {
    mocks.getJob.mockResolvedValue(
      job({ status: 'completed', terminalAt: new Date().toISOString(), actualCostMicrousd: 8000 }),
    );
    mocks.assetIds.mockResolvedValue([ASSET_ID]);

    const response = await GET(statusRequest(JOB_ID));
    const body = (await response.json()) as { images: Array<{ url?: string }>; status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('completed');
    expect(body.images).toEqual([{ url: `/api/files/${ASSET_ID}` }]);
    expect(mocks.delivered).toHaveBeenCalledTimes(1);
    expect(afterCallbacks).toHaveLength(0);
  });

  it('tells the client a failed job can still be retried for free', async () => {
    mocks.getJob.mockResolvedValue(
      job({
        status: 'failed',
        retryable: true,
        publicError: 'the provider was busy',
        nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const response = await GET(statusRequest(JOB_ID));
    const body = (await response.json()) as Record<string, unknown>;

    expect(body['status']).toBe('failed');
    expect(body['retryable']).toBe(true);
    expect(body['error']).toBe('the provider was busy');
    // Backoff has not elapsed, so nothing is re-driven yet.
    expect(afterCallbacks).toHaveLength(0);
  });

  it('rejects a job id that is not a job id', async () => {
    const response = await GET(statusRequest('not-a-job'));
    expect(response.status).toBe(400);
  });
});
