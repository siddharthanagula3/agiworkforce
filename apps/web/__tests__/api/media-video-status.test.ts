import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
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

const mockGetClerkAuthUser = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const durableMocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  get: vi.fn(),
  reconcile: vi.fn(),
  delivered: vi.fn(),
  incidentAlert: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => durableMocks.scoped(...args),
}));
vi.mock('@/lib/server/video-generation-jobs', () => ({
  getVideoGenerationJob: (...args: unknown[]) => durableMocks.get(...args),
  beginVideoProviderCancellationAttempt: vi.fn(),
  claimVideoGenerationJob: vi.fn(),
  claimVideoIncidentAlert: vi.fn(),
  claimVideoSettlementIncidentById: vi.fn(),
  claimVideoSettlementIncidentByReservation: vi.fn(),
  completeVideoIncidentAlert: vi.fn(),
  completeVideoSettlementIncident: vi.fn(),
  countExhaustedVideoIncidentAlerts: vi.fn(),
  countExhaustedVideoSettlementIncidentAlerts: vi.fn(),
  deferVideoGenerationJob: vi.fn(),
  deferVideoGenerationJobFailure: vi.fn(),
  finalizeVideoGenerationJob: vi.fn(),
  getVideoGenerationJobForSystem: vi.fn(),
  getVideoSettlementIncident: vi.fn(),
  listDueVideoGenerationJobIds: vi.fn(),
  listPendingVideoIncidentAlertIds: vi.fn(),
  listPendingVideoSettlementIncidentIds: vi.fn(),
  markVideoGenerationOutcomeUnknown: vi.fn(),
  recordVideoProviderCancellationAttempt: vi.fn(),
}));
vi.mock('@/lib/services/video-job-reconciliation-service', () => ({
  reconcileVideoGenerationJob: (...args: unknown[]) => durableMocks.reconcile(...args),
  publicVideoJobStatus: (job: Record<string, unknown>) => ({
    success: true,
    task_id: job['id'],
    status: job['status'],
    ...(job['assetId'] ? { video_url: `/api/files/${String(job['assetId'])}` } : {}),
  }),
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number; estimatedCostCents: number }) =>
    source.estimatedCostMicrousd ?? Math.round(source.estimatedCostCents) * 10_000,

  markManagedUsageClientDelivered: (...args: unknown[]) => durableMocks.delivered(...args),
}));
vi.mock('@/lib/services/video-incident-alert-service', () => ({
  deliverPendingVideoIncidentAlert: (...args: unknown[]) => durableMocks.incidentAlert(...args),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { GET, OPTIONS } from '@/app/api/media/video/status/route';

const BASE_URL = 'http://localhost/api/media/video/status';

const TEST_USER = { userId: 'user-test-id', email: 'test@example.com' };
const DURABLE_JOB_ID = '11111111-1111-4111-8111-111111111111';

function durableJob(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: DURABLE_JOB_ID,
    userId: TEST_USER.userId,
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-video',
    provider: 'google',
    model: 'synthetic-google-video-model',
    workflowRunId: 'wrun-video-1',
    providerTaskId: 'operations/provider-task',
    prompt: 'a sunset',
    durationSecs: 6,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 240,
    estimatedDurationSecs: 180,
    status: 'processing',
    progress: 50,
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

function makeRequest(
  taskId: string | null,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const url = taskId ? `${BASE_URL}?task_id=${encodeURIComponent(taskId)}` : BASE_URL;
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer valid-test-token',
      ...extraHeaders,
    },
  });
}

function makeUnauthRequest(taskId: string): NextRequest {
  return new NextRequest(`${BASE_URL}?task_id=${encodeURIComponent(taskId)}`, {
    method: 'GET',
  });
}

describe('GET /api/media/video/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue(TEST_USER);
    durableMocks.scoped.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: null,
    });
    durableMocks.get.mockResolvedValue(durableJob());
    durableMocks.reconcile.mockImplementation(async (_db, job) => job);
    durableMocks.delivered.mockResolvedValue(undefined);
    durableMocks.incidentAlert.mockResolvedValue(true);
  });

  describe('durable tenant-owned jobs', () => {
    it('returns only the authenticated same-origin asset URL after reconciliation', async () => {
      const completed = durableJob({
        status: 'completed',
        progress: 100,
        assetId: DURABLE_JOB_ID,
        billingOutcome: 'completed',
        terminalAt: new Date().toISOString(),
      });
      durableMocks.get.mockResolvedValue(completed);
      durableMocks.reconcile.mockResolvedValue(completed);

      const response = await GET(makeRequest(DURABLE_JOB_ID));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.video_url).toBe(`/api/files/${DURABLE_JOB_ID}`);
      expect(data.video_url).not.toMatch(/^https?:|^data:/);
      expect(durableMocks.delivered).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('denies a cross-tenant opaque job without provider polling', async () => {
      durableMocks.get.mockResolvedValue(null);

      const response = await GET(makeRequest(DURABLE_JOB_ID));

      expect(response.status).toBe(403);
      expect(durableMocks.reconcile).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('retries an owed terminal billing alert without exposing provider data', async () => {
      const failed = durableJob({
        status: 'outcome_unknown',
        publicError: 'The incident was recorded.',
        billingSettlementStatus: 'terminal',
        incidentAlertStatus: 'pending',
        terminalAt: new Date().toISOString(),
      });
      durableMocks.get.mockResolvedValue(failed);
      durableMocks.reconcile.mockResolvedValue(failed);

      const response = await GET(makeRequest(DURABLE_JOB_ID));

      expect(response.status).toBe(200);
      expect(durableMocks.incidentAlert).toHaveBeenCalledWith(expect.anything(), failed);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OPTIONS', () => {
    it('should return 204 for preflight when no CORS handler intercepts', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');
      vi.mocked(handleCorsPreflightRequest).mockReturnValueOnce(null);

      const request = new NextRequest(BASE_URL, { method: 'OPTIONS' });
      const response = await OPTIONS(request);

      expect(response.status).toBe(204);
    });
  });

  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const response = await GET(makeUnauthRequest(DURABLE_JOB_ID));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when authorization does not start with Bearer', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest(`${BASE_URL}?task_id=${DURABLE_JOB_ID}`, {
        method: 'GET',
        headers: { Authorization: 'Token abc123' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Clerk token is invalid', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

      const response = await GET(makeRequest(DURABLE_JOB_ID));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Clerk returns no userId', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const response = await GET(makeRequest(DURABLE_JOB_ID));
      await response.json();

      expect(response.status).toBe(401);
    });
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');

      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
          { status: 429 },
        ),
      );

      const response = await GET(makeRequest(DURABLE_JOB_ID));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "video-status" to withRateLimit', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      await GET(makeRequest(DURABLE_JOB_ID));

      expect(withRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'video-status');
    });
  });

  describe('task_id validation', () => {
    it('should return 400 when task_id is missing', async () => {
      const response = await GET(makeRequest(null));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('task_id');
    });

    it('should return 400 for a task_id that is not a video job id', async () => {
      const response = await GET(makeRequest('invalidtaskid'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('task_id');
      expect(durableMocks.scoped).not.toHaveBeenCalled();
    });

    it('should return 400 for a provider-prefixed task_id without polling the provider', async () => {
      for (const legacy of ['runway_task-abc123', 'google_12345678']) {
        const response = await GET(makeRequest(legacy));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error.code).toBe('VALIDATION_ERROR');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
