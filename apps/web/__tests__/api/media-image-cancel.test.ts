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
  requestCancel: vi.fn(),
  close: vi.fn(),
  finalize: vi.fn(),
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
  finalizeManagedUsageRequest: (...args: unknown[]) => mocks.finalize(...args),
  markManagedUsageClientDelivered: vi.fn(),
  markManagedUsageProviderStarted: vi.fn(),
}));

vi.mock('@/lib/server/image-generation-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/image-generation-jobs')>();
  return {
    ...actual,
    isImageJobStoreReady: (...args: unknown[]) => mocks.storeReady(...args),
    getImageGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
    requestImageGenerationCancellation: (...args: unknown[]) => mocks.requestCancel(...args),
    closeCancelledImageGenerationJob: (...args: unknown[]) => mocks.close(...args),
    listImageGenerationJobAssetIds: (...args: unknown[]) => mocks.assetIds(...args),
  };
});

import { POST } from '../../app/api/media/image/cancel/route';
import type { ImageGenerationJob } from '@/lib/server/image-generation-jobs';

const JOB_ID = '12121212-1212-4121-8121-121212121212';

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
    attempts: 0,
    maxAttempts: 3,
    attemptStartedAt: null,
    retryable: false,
    publicError: null,
    cancelRequestedAt: null,
    billingOutcome: null,
    billingSettlementStatus: null,
    nextAttemptAt: new Date().toISOString(),
    claimToken: null,
    claimExpiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    terminalAt: null,
    ...overrides,
  };
}

function cancelRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/media/image/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/media/image/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.scoped.mockResolvedValue({ userId: 'user-1', organizationId: null, db: {} });
    mocks.storeReady.mockResolvedValue(true);
    mocks.assetIds.mockResolvedValue([]);
    mocks.finalize.mockResolvedValue({
      requestStatus: 'released',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 0,
    });
  });

  it('releases the reservation and closes a job nothing is working on', async () => {
    const cancelRequested = job({ cancelRequestedAt: new Date().toISOString() });
    mocks.getJob.mockResolvedValue(job());
    mocks.requestCancel.mockResolvedValue(cancelRequested);
    mocks.close.mockResolvedValue(
      job({
        status: 'canceled',
        cancelRequestedAt: cancelRequested.cancelRequestedAt,
        terminalAt: new Date().toISOString(),
        billingOutcome: 'released',
      }),
    );

    const response = await POST(cancelRequest({ job_id: JOB_ID }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['status']).toBe('canceled');
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(mocks.finalize.mock.calls[0]![0]).toMatchObject({
      outcome: 'failed',
      actualCostMicrousd: 0,
    });
  });

  it('records the intent only while an attempt still holds the claim', async () => {
    mocks.getJob.mockResolvedValue(job({ status: 'processing' }));
    mocks.requestCancel.mockResolvedValue(
      job({
        status: 'processing',
        cancelRequestedAt: new Date().toISOString(),
        claimToken: 'claim-token-1234',
        claimExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    );

    const response = await POST(cancelRequest({ job_id: JOB_ID }));

    expect(response.status).toBe(202);
    // The provider call is already paid for, so the reservation stays with the
    // attempt rather than being released underneath it.
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('refunds nothing for a job that already delivered', async () => {
    mocks.getJob.mockResolvedValue(
      job({ status: 'completed', terminalAt: new Date().toISOString() }),
    );
    mocks.requestCancel.mockResolvedValue(null);

    const response = await POST(cancelRequest({ job_id: JOB_ID }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['status']).toBe('completed');
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('refuses a job that belongs to someone else', async () => {
    mocks.getJob.mockResolvedValue(null);

    const response = await POST(cancelRequest({ job_id: JOB_ID }));

    expect(response.status).toBe(403);
    expect(mocks.requestCancel).not.toHaveBeenCalled();
  });
});
