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

const mockGetVideoTaskOwner = vi.fn();

vi.mock('@/lib/video-task-store', () => ({
  getVideoTask: async (...args: unknown[]) => {
    const userId = await mockGetVideoTaskOwner(...args);
    return userId ? { userId, model: 'synthetic-google-video-model' } : undefined;
  },
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
    mockGetVideoTaskOwner.mockReturnValue(TEST_USER.userId);
    durableMocks.scoped.mockResolvedValue({
      db: {},
      userId: TEST_USER.userId,
      organizationId: null,
    });
    durableMocks.get.mockResolvedValue(durableJob());
    durableMocks.reconcile.mockImplementation(async (_db, job) => job);
    durableMocks.delivered.mockResolvedValue(undefined);
    durableMocks.incidentAlert.mockResolvedValue(true);

    process.env['RUNWAY_API_KEY'] = 'test-runway-key';
    process.env['GOOGLE_API_KEY'] = 'test-google-key';
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
    delete process.env['RUNWAY_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
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

      const response = await GET(makeUnauthRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when authorization does not start with Bearer', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const request = new NextRequest(`${BASE_URL}?task_id=runway_abc`, {
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

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Clerk returns no userId', async () => {
      const { createError } = await import('@/lib/errors');
      mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

      const response = await GET(makeRequest('runway_task-abc'));
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

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should pass rate limit key "video-status" to withRateLimit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-abc', status: 'PENDING' }),
      });

      const { withRateLimit } = await import('@/lib/rate-limit');
      await GET(makeRequest('runway_task-abc'));

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

    it('should return 400 for task_id with invalid format (no provider prefix)', async () => {
      const response = await GET(makeRequest('invalidtaskid'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('task_id format');
    });

    it('should return 400 when runway task_id contains disallowed characters', async () => {
      const response = await GET(makeRequest('runway_task/../etc/passwd'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when google task_id contains disallowed characters', async () => {
      const response = await GET(makeRequest('google_op/<script>'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Task ownership', () => {
    it('should fail closed when task ownership is missing', async () => {
      mockGetVideoTaskOwner.mockReturnValueOnce(undefined);

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject status checks for tasks created by another user', async () => {
      mockGetVideoTaskOwner.mockReturnValueOnce('user-other-id');

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Success, Runway PENDING status', () => {
    it('should return 200 with queued status when Runway task is PENDING', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc123',
          status: 'PENDING',
          progress: 0,
        }),
      });

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('runway_task-abc123');
      expect(data.status).toBe('queued');
      expect(data.progress).toBe(0);
    });

    it('should return 200 with processing status when Runway task is RUNNING', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc123',
          status: 'RUNNING',
          progress: 50,
        }),
      });

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processing');
      expect(data.progress).toBe(50);
    });

    it('does not expose an expiring Runway URL for a pre-durable legacy task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc123',
          status: 'SUCCEEDED',
          progress: 100,
          output: ['https://cdn.example.com/video.mp4'],
        }),
      });

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.video_url).toBeUndefined();
      expect(data.error).toContain('legacy video task');
    });

    it('should return 200 with failed status when Runway task FAILED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc123',
          status: 'FAILED',
          failure: 'Content policy violation',
        }),
      });

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.error).toBe('Content policy violation');
    });

    it('should return 200 with failed status when Runway task is CANCELLED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc123',
          status: 'CANCELLED',
        }),
      });

      const response = await GET(makeRequest('runway_task-abc123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
    });
  });

  describe('Success, Google Veo status', () => {
    it('should return 200 with queued status when Google operation is PENDING', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          metadata: {
            '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
            state: 'PENDING',
          },
          done: false,
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.task_id).toBe('google_12345678');
      expect(data.status).toBe('queued');
    });

    it('should return 200 with processing status when Google operation is RUNNING', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          metadata: {
            '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
            state: 'RUNNING',
            progress: 60,
          },
          done: false,
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processing');
      expect(data.progress).toBe(60);
    });

    it('does not expose a Google provider URI for a pre-durable legacy task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          done: true,
          response: {
            '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
            generatedSamples: [
              { video: { uri: 'https://storage.googleapis.com/bucket/video.mp4' } },
            ],
          },
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.video_url).toBeUndefined();
    });

    it('does not expose inline provider bytes as a data URI for a legacy task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          done: true,
          response: {
            '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
            generatedSamples: [{ video: { bytesBase64Encoded: 'abc123base64==' } }],
          },
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.video_url).toBeUndefined();
    });

    it('does not expose an alternate-shape provider URI for a legacy task', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          done: true,
          response: {
            '@type': 'type.googleapis.com/google.cloud.aiplatform.v1.GenerateVideoResponse',
            videos: [{ video: { uri: 'https://storage.googleapis.com/bucket/alt-video.mp4' } }],
          },
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.video_url).toBeUndefined();
    });

    it('should return 200 with failed status when Google operation has an error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/12345678',
          done: true,
          error: { code: 500, message: 'Internal Veo error' },
        }),
      });

      const response = await GET(makeRequest('google_12345678'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.error).toBe('Internal Veo error');
    });
  });

  describe('Provider errors, Runway', () => {
    it('should return 404 when Runway returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not Found',
      });

      const response = await GET(makeRequest('runway_task-missing'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should return 503 when Runway returns 401 (auth failure)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error.message).toContain('Service temporarily unavailable');
    });

    it('should return 500 for a generic Runway API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'Bad Gateway',
      });

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('should return 503 when RUNWAY_API_KEY is not set', async () => {
      delete process.env['RUNWAY_API_KEY'];

      const response = await GET(makeRequest('runway_task-abc'));
      await response.json();

      expect(response.status).toBe(503);
    });
  });

  describe('Provider errors, Google Veo', () => {
    it('should return 404 when Google Veo returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not Found',
      });

      const response = await GET(makeRequest('google_op-missing'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should return 503 when Google returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const response = await GET(makeRequest('google_op-abc'));
      await response.json();

      expect(response.status).toBe(503);
    });

    it('should return 503 when Google returns 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Forbidden',
      });

      const response = await GET(makeRequest('google_op-abc'));
      await response.json();

      expect(response.status).toBe(503);
    });

    it('should return 503 when GOOGLE_API_KEY is not set', async () => {
      delete process.env['GOOGLE_API_KEY'];

      const response = await GET(makeRequest('google_op-abc'));
      await response.json();

      expect(response.status).toBe(503);
    });

    it('should return 500 for a generic Google Veo API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      const response = await GET(makeRequest('google_op-abc'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('should return 500 when fetch throws a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

      const response = await GET(makeRequest('runway_task-abc'));
      await response.json();

      expect(response.status).toBe(500);
    });
  });

  describe('Edge cases', () => {
    it('should default to processing status for unknown Runway status strings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc',
          status: 'UNKNOWN_STATUS',
        }),
      });

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processing');
    });

    it('should default to processing when Google operation has no done flag or metadata state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'operations/99999',
          // no done, no metadata
        }),
      });

      const response = await GET(makeRequest('google_99999'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('processing');
    });

    it('should not include video_url when completed runway task has empty output array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-abc',
          status: 'SUCCEEDED',
          output: [],
        }),
      });

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('failed');
      expect(data.video_url).toBeUndefined();
    });
  });
});
