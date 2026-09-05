import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  scoped: vi.fn(),
  getJob: vi.fn(),
  requestCancel: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args) }));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
}));
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: () => null,
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.scoped(...args),
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  getVideoGenerationJob: (...args: unknown[]) => mocks.getJob(...args),
  requestVideoGenerationCancellation: (...args: unknown[]) => mocks.requestCancel(...args),
  beginVideoProviderCancellationAttempt: vi.fn(),
  claimVideoGenerationJob: vi.fn(),
  deferVideoGenerationJob: vi.fn(),
  deferVideoGenerationJobFailure: vi.fn(),
  finalizeVideoGenerationJob: vi.fn(),
  getVideoGenerationJobForSystem: vi.fn(),
  listDueVideoGenerationJobIds: vi.fn(),
  markVideoGenerationOutcomeUnknown: vi.fn(),
  recordVideoProviderCancellationAttempt: vi.fn(),
}));
vi.mock('@/lib/services/video-job-reconciliation-service', () => ({
  publicVideoJobStatus: (job: VideoGenerationJob) => ({
    success: true,
    task_id: job.id,
    status: job.status === 'submitting' ? 'queued' : job.status,
  }),
  reconcileVideoGenerationJob: (...args: unknown[]) => mocks.reconcile(...args),
}));

import { POST } from '@/app/api/media/video/cancel/route';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const db = {} as never;

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: JOB_ID,
    userId: 'user-1',
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease',
    provider: 'google',
    model: 'synthetic-google-video-model',
    workflowRunId: 'wrun-video-1',
    providerTaskId: 'operations/task',
    prompt: 'a sunset',
    durationSecs: 4,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 20,
    estimatedDurationSecs: 150,
    status: 'processing',
    providerStartedAt: now,
    cancelRequestedAt: null,
    providerCancelAttemptedAt: null,
    providerCancelAcknowledgedAt: null,
    cancelAttempts: 0,
    cancelLastError: null,
    progress: 20,
    assetId: null,
    publicError: null,
    billingOutcome: null,
    reconcileFailures: 0,
    nextAttemptAt: now,
    reconcileClaimToken: null,
    reconcileClaimExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: null,
    ...overrides,
  };
}

function request(taskId = JOB_ID): NextRequest {
  return new NextRequest('http://localhost/api/media/video/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify({ task_id: taskId }),
  });
}

describe('POST /api/media/video/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.scoped.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  it('records Google cancellation without inventing an upstream cancellation call', async () => {
    const active = job();
    const requested = job({ cancelRequestedAt: new Date().toISOString() });
    mocks.getJob.mockResolvedValue(active);
    mocks.requestCancel.mockResolvedValue(requested);

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data).toMatchObject({
      task_id: JOB_ID,
      cancel_requested: true,
      provider_cancellation: 'unsupported',
    });
    expect(mocks.requestCancel).toHaveBeenCalledWith({ db, jobId: JOB_ID, userId: 'user-1' });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('reports OpenRouter cancellation as unsupported without inventing provider egress', async () => {
    const active = job({
      provider: 'openrouter',
      model: 'catalog-video-model',
      providerTaskId: 'synthetic-provider-task',
    });
    const requested = job({
      ...active,
      cancelRequestedAt: new Date().toISOString(),
    });
    mocks.getJob.mockResolvedValue(active);
    mocks.requestCancel.mockResolvedValue(requested);

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      task_id: JOB_ID,
      cancel_requested: true,
      provider_cancellation: 'unsupported',
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('routes a Runway request through the claimed shared reconciler', async () => {
    const active = job({ provider: 'runway', providerTaskId: 'runway-task' });
    const requested = job({
      provider: 'runway',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
    });
    const acknowledged = job({
      ...requested,
      providerCancelAttemptedAt: new Date().toISOString(),
      providerCancelAcknowledgedAt: new Date().toISOString(),
      cancelAttempts: 1,
    });
    mocks.getJob.mockResolvedValue(active);
    mocks.requestCancel.mockResolvedValue(requested);
    mocks.reconcile.mockResolvedValue(acknowledged);

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.provider_cancellation).toBe('provider_request_acknowledged');
    expect(mocks.reconcile).toHaveBeenCalledWith(db, requested);
  });

  it('denies a task not visible to the authenticated tenant', async () => {
    mocks.getJob.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.requestCancel).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
