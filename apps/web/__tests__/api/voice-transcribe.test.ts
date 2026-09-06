// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/voice/transcribe/route';
import { getRoutingSlotModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
  withRateLimitHandler: vi.fn(
    (handler: (...args: unknown[]) => Promise<unknown>) =>
      (...args: unknown[]) =>
        handler(...args),
  ),
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
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));

vi.mock('@shared/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    const envMap: Record<string, string> = {
      OPENAI_API_KEY: 'sk-test-openai-key',
    };
    return envMap[key] ?? `test-${key}`;
  }),
  getOptionalEnv: vi.fn(() => undefined),
}));

const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
}));

const mockGetUserScopedDb = vi.fn();
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));

// The route reserves on the tenant-scoped handle above. This mock only keeps the pooled
// client that other modules in the import graph construct from reaching for a real
// connection, whose driver would answer the stubbed global fetch.
const mockGetNeonDb = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: (...args: unknown[]) => mockGetNeonDb(...args),
}));

const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
}));

const mockReserveManagedUsage = vi.fn();
const mockFinalizeManagedUsage = vi.fn();
const mockMarkProviderStarted = vi.fn();
const mockMarkClientDelivered = vi.fn();
vi.mock('@/lib/services/tier-unit-quota-service', () => ({
  assertTierUnitAllowance: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) => mockReserveManagedUsage(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) => mockFinalizeManagedUsage(...args),
    markManagedUsageProviderStarted: (...args: unknown[]) => mockMarkProviderStarted(...args),
    markManagedUsageClientDelivered: (...args: unknown[]) => mockMarkClientDelivered(...args),
  };
});

vi.mock('@/lib/errors', () => {
  class AppError extends Error {
    code: string;
    statusCode: number;
    details?: unknown;
    constructor(message: string, code: string, statusCode: number, details?: unknown) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return {
    createError: {
      unauthorized: (msg: string) => new AppError(msg, 'UNAUTHORIZED', 401),
      badRequest: (msg: string) => new AppError(msg, 'BAD_REQUEST', 400),
      forbidden: (msg: string) => new AppError(msg, 'FORBIDDEN', 403),
      internal: (msg: string) => new AppError(msg, 'INTERNAL_ERROR', 500),
      validation: (msg: string, details?: unknown) =>
        new AppError(msg, 'VALIDATION_ERROR', 400, details),
    },
    AppError,
    isAppError: (e: unknown) => e instanceof AppError,
  };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeFormDataRequest(
  options: {
    includeFile?: boolean;
    model?: string;
    language?: string;
    authHeader?: string;
  } = {},
): NextRequest {
  const { includeFile = true, model, language, authHeader = 'Bearer valid-token' } = options;

  const formData = new FormData();

  if (includeFile) {
    const ebmlMagic = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const padding = new Uint8Array(32).fill(0);
    const audioBlob = new Blob([ebmlMagic, padding], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'audio.webm');
  }

  if (model) {
    formData.append('model', model);
  }

  if (language) {
    formData.append('language', language);
  }

  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['authorization'] = authHeader;
  }

  return new NextRequest('http://localhost/api/voice/transcribe', {
    method: 'POST',
    body: formData,
    headers,
  });
}

function makeOpenAISuccessResponse(text = 'Hello world') {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify({ text })),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

function makeOpenAIErrorResponse(status: number, body = 'Transcription failed') {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

describe('POST /api/voice/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-123', email: 'test@example.com' });

    mockGetUserScopedDb.mockResolvedValue({
      userId: 'user-123',
      organizationId: null,
      db: { query: vi.fn() },
    });
    mockGetNeonDb.mockReturnValue({ query: vi.fn() });
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockReserveManagedUsage.mockImplementation(
      async (input: { estimatedCostCents: number; idempotencyKey: string }) => ({
        db: { query: vi.fn() },
        userId: 'user-123',
        idempotencyKey: input.idempotencyKey,
        requestHash: 'hash-1',
        leaseToken: 'lease-1',
        estimatedCostCents: input.estimatedCostCents,
      }),
    );
    mockFinalizeManagedUsage.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
    });
    mockMarkProviderStarted.mockResolvedValue(undefined);
    mockMarkClientDelivered.mockResolvedValue(undefined);

    mockFetch.mockResolvedValue(makeOpenAISuccessResponse('Hello world'));
  });

  it('should return 401 when no authorization header is provided', async () => {
    const { createError } = await import('@/lib/errors');
    mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

    const request = makeFormDataRequest({ authHeader: '' });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 401 when the authorization header does not start with Bearer', async () => {
    const { createError } = await import('@/lib/errors');
    mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized());

    const request = makeFormDataRequest({ authHeader: 'Basic some-base64' });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 401 when the Bearer token is invalid (Clerk rejects it)', async () => {
    const { createError } = await import('@/lib/errors');
    mockGetClerkAuthUser.mockRejectedValueOnce(createError.unauthorized('Invalid token'));

    const request = makeFormDataRequest({ authHeader: 'Bearer bad-token' });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('should return 400 when no audio file is included in the form data', async () => {
    const request = makeFormDataRequest({ includeFile: false });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toMatch(/missing audio file/i);
  });

  it('should return 200 with transcription text on success', async () => {
    const request = makeFormDataRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockGetClerkAuthUser).toHaveBeenCalledWith(request, {
      apiKeyScope: 'inference:write',
    });
    const data = await response.json();
    expect(data.text).toBe('Hello world');
  });

  it('should forward the audio file to the OpenAI transcription endpoint', async () => {
    const request = makeFormDataRequest();
    await POST(request);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockReserveManagedUsage.mock.invocationCallOrder[0]!).toBeLessThan(
      mockFetch.mock.invocationCallOrder[0]!,
    );
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((options.headers as Record<string, string>)['Authorization']).toContain(
      'Bearer sk-test',
    );
    expect(options.method).toBe('POST');
  });

  it('uses the canonical voice-routing model when model is not specified', async () => {
    const request = makeFormDataRequest();
    await POST(request);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    expect(options.body).toBeInstanceOf(FormData);
    const forwardedModel = (options.body as FormData).get('model');
    expect(forwardedModel).toBe(getRoutingSlotModel('voice_transcription'));
  });

  it('rejects an app-owned phantom transcription model in favor of the canonical voice model', async () => {
    const request = makeFormDataRequest({ model: 'whisper-large-v3' });
    await POST(request);

    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    const forwardedModel = (options.body as FormData).get('model');
    expect(forwardedModel).toBe(getRoutingSlotModel('voice_transcription'));
  });

  it('should forward language parameter when provided', async () => {
    const request = makeFormDataRequest({ language: 'es' });
    await POST(request);

    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    const forwardedLanguage = (options.body as FormData).get('language');
    expect(forwardedLanguage).toBe('es');
  });

  it('should not include language in forwarded form data when not provided', async () => {
    const request = makeFormDataRequest();
    await POST(request);

    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    const forwardedLanguage = (options.body as FormData).get('language');
    expect(forwardedLanguage).toBeNull();
  });

  it('should return upstream error status when OpenAI returns an error', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenAIErrorResponse(400, 'Invalid audio format'));

    const request = makeFormDataRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe('api_error');
  });

  it('should return 500-level error when OpenAI service is unavailable', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenAIErrorResponse(503, 'Service unavailable'));

    const request = makeFormDataRequest();
    const response = await POST(request);

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error.type).toBe('api_error');
  });

  it('should handle non-JSON response from OpenAI gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('plain text transcription result'),
      headers: new Headers({ 'content-type': 'text/plain' }),
    });

    const request = makeFormDataRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should return 400 when form data cannot be parsed', async () => {
    const request = new NextRequest('http://localhost/api/voice/transcribe', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'not form data' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toMatch(/invalid multipart form data/i);
  });
});
