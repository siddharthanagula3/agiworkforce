import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock: server-only
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Mock: rate-limit — allow by default
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Mock: logger
// ---------------------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: CORS helpers
// ---------------------------------------------------------------------------
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn().mockReturnValue(null),
  getCorsHeaders: vi.fn().mockReturnValue({}),
  getSecurityHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock: errors — use real implementations so createError.* works correctly
// ---------------------------------------------------------------------------
vi.mock('@/lib/errors', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/utils')>('@agiworkforce/utils');
  return {
    createError: actual.createError,
    AppError: actual.AppError,
    isAppError: actual.isAppError,
  };
});

// ---------------------------------------------------------------------------
// Mock: error-handler — real withErrorHandler so thrown AppErrors produce
//        proper JSON responses (matching the live route behaviour)
// ---------------------------------------------------------------------------
vi.mock('@/lib/error-handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/error-handler')>('@/lib/error-handler');
  return { withErrorHandler: actual.withErrorHandler, handleError: actual.handleError };
});

// ---------------------------------------------------------------------------
// Mock: Supabase client
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// ---------------------------------------------------------------------------
// Mock: global fetch (used for Runway / Google Veo status calls)
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import route after all mocks are in place
// ---------------------------------------------------------------------------
import { GET, OPTIONS } from '@/app/api/media/video/status/route';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/media/video/status';

const TEST_USER = { id: 'user-test-id', email: 'test@example.com' };

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/media/video/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Happy-path defaults
    mockGetUser.mockResolvedValue({ data: { user: TEST_USER }, error: null });

    // Set env vars
    process.env['NEXT_PUBLIC_SUPABASE_URL'] = 'https://test.supabase.co';
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key';
    process.env['RUNWAY_API_KEY'] = 'test-runway-key';
    process.env['GOOGLE_API_KEY'] = 'test-google-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['RUNWAY_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  // =========================================================================
  // OPTIONS / CORS preflight
  // =========================================================================
  describe('OPTIONS', () => {
    it('should return 204 for preflight when no CORS handler intercepts', async () => {
      const { handleCorsPreflightRequest } = await import('@/lib/cors');
      vi.mocked(handleCorsPreflightRequest).mockReturnValueOnce(null);

      const request = new NextRequest(BASE_URL, { method: 'OPTIONS' });
      const response = await OPTIONS(request);

      expect(response.status).toBe(204);
    });
  });

  // =========================================================================
  // Authentication
  // =========================================================================
  describe('Authentication', () => {
    it('should return 401 when authorization header is missing', async () => {
      const response = await GET(makeUnauthRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when authorization does not start with Bearer', async () => {
      const request = new NextRequest(`${BASE_URL}?task_id=runway_abc`, {
        method: 'GET',
        headers: { Authorization: 'Token abc123' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Supabase token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const response = await GET(makeRequest('runway_task-abc'));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Supabase returns null user without error', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const response = await GET(makeRequest('runway_task-abc'));
      await response.json();

      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // Rate limiting
  // =========================================================================
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

  // =========================================================================
  // Request validation — task_id parameter
  // =========================================================================
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

  // =========================================================================
  // Happy path — Runway provider
  // =========================================================================
  describe('Success — Runway PENDING status', () => {
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

    it('should return 200 with completed status and video_url when Runway task SUCCEEDED', async () => {
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
      expect(data.status).toBe('completed');
      expect(data.video_url).toBe('https://cdn.example.com/video.mp4');
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

  // =========================================================================
  // Happy path — Google Veo provider
  // =========================================================================
  describe('Success — Google Veo status', () => {
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

    it('should return 200 with completed and video_url from generatedSamples when done', async () => {
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
      expect(data.status).toBe('completed');
      expect(data.video_url).toBe('https://storage.googleapis.com/bucket/video.mp4');
    });

    it('should embed base64 video as data URI when Google returns bytesBase64Encoded', async () => {
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
      expect(data.status).toBe('completed');
      expect(data.video_url).toBe('data:video/mp4;base64,abc123base64==');
    });

    it('should fall back to videos[] response shape when generatedSamples is absent', async () => {
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
      expect(data.status).toBe('completed');
      expect(data.video_url).toBe('https://storage.googleapis.com/bucket/alt-video.mp4');
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

  // =========================================================================
  // Provider error handling
  // =========================================================================
  describe('Provider errors — Runway', () => {
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
      expect(data.error.message).toContain('authentication');
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
      expect(data.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 503 when RUNWAY_API_KEY is not set', async () => {
      delete process.env['RUNWAY_API_KEY'];

      const response = await GET(makeRequest('runway_task-abc'));
      await response.json();

      expect(response.status).toBe(503);
    });
  });

  describe('Provider errors — Google Veo', () => {
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
      expect(data.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should return 500 when fetch throws a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

      const response = await GET(makeRequest('runway_task-abc'));
      await response.json();

      expect(response.status).toBe(500);
    });
  });

  // =========================================================================
  // Status without metadata state (fallback to processing)
  // =========================================================================
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
      expect(data.status).toBe('completed');
      expect(data.video_url).toBeUndefined();
    });
  });
});
