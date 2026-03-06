import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/voice/transcribe/route';

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock rate limiting — pass through by default
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(() => null),
  withRateLimitHandler: vi.fn(
    (handler: (...args: unknown[]) => Promise<unknown>) =>
      (...args: unknown[]) =>
        handler(...args),
  ),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock CORS helpers
vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));

// Mock env utility
vi.mock('@/utils/env', () => ({
  requireEnv: vi.fn((key: string) => {
    const envMap: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-test',
      OPENAI_API_KEY: 'sk-test-openai-key',
    };
    return envMap[key] ?? `test-${key}`;
  }),
  getOptionalEnv: vi.fn(() => undefined),
}));

// Mock Supabase client
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Mock error utilities (withErrorHandler uses AppError internally)
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

// The voice/transcribe route re-exports from @/app/api/llm/v1/audio/transcriptions/route
// which uses global fetch to call OpenAI. We mock fetch globally.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper: create a multipart FormData request with an audio file
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
    const audioBlob = new Blob(['fake-audio-bytes'], { type: 'audio/webm' });
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

// Helper: create a mock OpenAI success response
function makeOpenAISuccessResponse(text = 'Hello world') {
  return {
    ok: true,
    status: 200,
    text: vi.fn().mockResolvedValue(JSON.stringify({ text })),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

// Helper: create a mock OpenAI error response
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

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    // Default: OpenAI responds with a successful transcription
    mockFetch.mockResolvedValue(makeOpenAISuccessResponse('Hello world'));
  });

  it('should return 401 when no authorization header is provided', async () => {
    const request = makeFormDataRequest({ authHeader: '' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('invalid_api_key');
    expect(data.error.message).toMatch(/missing or invalid authorization/i);
  });

  it('should return 401 when the authorization header does not start with Bearer', async () => {
    const request = makeFormDataRequest({ authHeader: 'Basic some-base64' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('invalid_api_key');
  });

  it('should return 401 when the Bearer token is invalid (Supabase rejects it)', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('invalid JWT'),
    });

    const request = makeFormDataRequest({ authHeader: 'Bearer bad-token' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('invalid_api_key');
    expect(data.error.message).toMatch(/authentication failed/i);
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
    const data = await response.json();
    expect(data.text).toBe('Hello world');
  });

  it('should forward the audio file to the OpenAI transcription endpoint', async () => {
    const request = makeFormDataRequest();
    await POST(request);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((options.headers as Record<string, string>)['Authorization']).toContain(
      'Bearer sk-test',
    );
    expect(options.method).toBe('POST');
  });

  it('should use whisper-1 as the default model when model is not specified', async () => {
    const request = makeFormDataRequest(); // no model specified
    await POST(request);

    expect(mockFetch).toHaveBeenCalledOnce();
    // The FormData body sent to OpenAI should include model=whisper-1
    // We can verify this by checking the body is a FormData instance
    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    expect(options.body).toBeInstanceOf(FormData);
    const forwardedModel = (options.body as FormData).get('model');
    expect(forwardedModel).toBe('whisper-1');
  });

  it('should forward a custom model when specified', async () => {
    const request = makeFormDataRequest({ model: 'whisper-large-v3' });
    await POST(request);

    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    const forwardedModel = (options.body as FormData).get('model');
    expect(forwardedModel).toBe('whisper-large-v3');
  });

  it('should forward language parameter when provided', async () => {
    const request = makeFormDataRequest({ language: 'es' });
    await POST(request);

    const [, options] = mockFetch.mock.calls[0] as [string, { body: FormData }];
    const forwardedLanguage = (options.body as FormData).get('language');
    expect(forwardedLanguage).toBe('es');
  });

  it('should not include language in forwarded form data when not provided', async () => {
    const request = makeFormDataRequest(); // no language
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
    // OpenAI occasionally returns plain text on certain success paths
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('plain text transcription result'),
      headers: new Headers({ 'content-type': 'text/plain' }),
    });

    const request = makeFormDataRequest();
    const response = await POST(request);

    // Non-JSON responses should still return 200 with the raw text body
    expect(response.status).toBe(200);
  });

  it('should return 400 when form data cannot be parsed', async () => {
    // Sending a plain JSON body (not multipart) should fail form data parsing
    const request = new NextRequest('http://localhost/api/voice/transcribe', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'not form data' }),
    });

    const response = await POST(request);

    // The route returns 400 when formData() parsing fails
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toMatch(/invalid multipart form data/i);
  });
});
