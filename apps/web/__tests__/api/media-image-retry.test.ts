import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));

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
  requeue: vi.fn(),
  runAttempt: vi.fn(),
  reserve: vi.fn(),
  delivered: vi.fn(),
  assetIds: vi.fn(),
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
  finalizeManagedUsageRequest: vi.fn(),
  reserveManagedUsageRequest: (...args: unknown[]) => mocks.reserve(...args),
}));

vi.mock('@/lib/server/image-generation-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/image-generation-jobs')>();
  return {
    ...actual,
    isImageJobStoreReady: (...args: unknown[]) => mocks.storeReady(...args),
    getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
    requeueImageGenerationJob: (...args: unknown[]) => mocks.requeue(...args),
    listImageGenerationJobAssetIds: (...args: unknown[]) => mocks.assetIds(...args),
  };
});

vi.mock('../../app/api/media/image/lib/image-job-executor', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../app/api/media/image/lib/image-job-executor')>();
  return {
    ...actual,
    runImageGenerationJobAttempt: (...args: unknown[]) => mocks.runAttempt(...args),
  };
});

import { POST } from '../../app/api/media/image/retry/route';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

const JOB_ID = '88888888-8888-4888-8888-888888888888';
const ASSET_ID = '99999999-9999-4999-8999-999999999999';

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
    status: 'failed',
    attempts: 1,
    maxAttempts: 3,
    attemptStartedAt: null,
    retryable: true,
    publicError: 'the provider was busy',
    cancelRequestedAt: null,
    billingOutcome: null,
    billingSettlementStatus: null,
    nextAttemptAt: new Date(Date.now() - 1_000).toISOString(),
    claimToken: null,
    claimExpiresAt: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30_000).toISOString(),
    terminalAt: null,
    ...overrides,
  };
}

function retryRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/media/image/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/media/image/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.scoped.mockResolvedValue({ userId: 'user-1', organizationId: null, db: {} });
    mocks.storeReady.mockResolvedValue(true);
    mocks.assetIds.mockResolvedValue([ASSET_ID]);
  });

  it('runs another attempt on the reservation the job already holds', async () => {
    mocks.getJob.mockResolvedValue(job());
    mocks.requeue.mockResolvedValue(job({ status: 'queued' }));
    mocks.runAttempt.mockResolvedValue({
      job: job({ status: 'completed', attempts: 2, terminalAt: new Date().toISOString() }),
      images: [],
      providerModel: 'image-model',
      provenance: [],
    });

    const response = await POST(retryRequest({ job_id: JOB_ID }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['status']).toBe('completed');
    expect(body['attempts']).toBe(2);
    expect(body['images']).toEqual([{ url: `/api/files/${ASSET_ID}` }]);
    // The whole point: no second reservation, so the retry is not charged.
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.runAttempt).toHaveBeenCalledTimes(1);
  });

  it('refuses a job that has used every attempt instead of charging for a new one', async () => {
    mocks.getJob.mockResolvedValue(job({ attempts: 3, maxAttempts: 3 }));

    const response = await POST(retryRequest({ job_id: JOB_ID }));
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('image_job_not_retryable');
    expect(body.error.message).toContain('Start a new generation');
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('refuses a terminal failure, which was settled and cannot be retried for free', async () => {
    mocks.getJob.mockResolvedValue(job({ retryable: false, terminalAt: new Date().toISOString() }));

    const response = await POST(retryRequest({ job_id: JOB_ID }));

    expect(response.status).toBe(409);
    expect(mocks.runAttempt).not.toHaveBeenCalled();
  });

  it('refuses a job that belongs to someone else', async () => {
    mocks.getJob.mockResolvedValue(null);

    const response = await POST(retryRequest({ job_id: JOB_ID }));

    expect(response.status).toBe(403);
    expect(mocks.requeue).not.toHaveBeenCalled();
  });

  it('reports the failure again when the retry attempt fails too', async () => {
    mocks.getJob.mockResolvedValue(job());
    mocks.requeue.mockResolvedValue(job({ status: 'queued' }));
    mocks.runAttempt.mockResolvedValue({
      job: job({ attempts: 2, publicError: 'the provider was busy again' }),
      images: [],
      providerModel: null,
      provenance: [],
      failureKind: 'provider',
    });
    mocks.assetIds.mockResolvedValue([]);

    const response = await POST(retryRequest({ job_id: JOB_ID }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body['retryable']).toBe(true);
    expect(body['error']).toBe('the provider was busy again');
  });
});
