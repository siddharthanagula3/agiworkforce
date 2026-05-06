import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/agents/execute/route';

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock fs so loadEmployeeSystemPrompt returns a fake prompt for any employeeId
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => 'You are a helpful AI assistant.'),
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'You are a helpful AI assistant.'),
}));

// Mock fs/promises — the route uses access() and readFile() from fs/promises
const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    access: (...args: unknown[]) => mockFsAccess(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
  },
  access: (...args: unknown[]) => mockFsAccess(...args),
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
}));

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

// Mock CORS helper
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
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-test',
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

// Mock @supabase/ssr for cookie-based auth path
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: null },
        error: new Error('No session'),
      })),
    },
  })),
}));

// Mock CreditService
const mockCheckAvailable = vi.fn();
const mockGetBalance = vi.fn();
const mockDeductCredits = vi.fn();
const mockGenerateIdempotencyKey = vi.fn(
  (_userId: string, _op: string, requestId: string) => `key:${requestId}`,
);
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    // Pass through all args — route signatures take an RLS-bound user client
    // as the first argument (followed by userId, amount, …).
    checkAvailable: (...args: unknown[]) => mockCheckAvailable(...args),
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    deductCredits: (...args: unknown[]) => mockDeductCredits(...args),
    generateIdempotencyKey: (userId: string, op: string, requestId: string) =>
      mockGenerateIdempotencyKey(userId, op, requestId),
  },
}));

// Mock LLMProviderFactory
const mockStreamRequest = vi.fn();
const mockCreateProvider = vi.fn();
vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    getProviderFromModel: vi.fn(() => 'anthropic'),
    createProvider: (...args: unknown[]) => mockCreateProvider(...args),
    mapModelIdToApiId: vi.fn((id: string) => id),
  },
}));

// Mock error utilities
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

vi.mock('@/lib/error-handler', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextResponse } = require('next/server');
  return {
    handleError: (error: unknown) => {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const e = error as { code: string; message: string; statusCode: number };
        return NextResponse.json(
          { error: { code: e.code, message: e.message } },
          { status: e.statusCode },
        );
      }
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: String(error) } },
        { status: 500 },
      );
    },
    withErrorHandler: (handler: (...args: unknown[]) => Promise<unknown>) => {
      return async (...args: unknown[]) => {
        try {
          return await handler(...args);
        } catch (error) {
          if (error && typeof error === 'object' && 'statusCode' in error) {
            const e = error as { code: string; message: string; statusCode: number };
            return NextResponse.json(
              { error: { code: e.code, message: e.message } },
              { status: e.statusCode },
            );
          }
          return NextResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: String(error) } },
            { status: 500 },
          );
        }
      };
    },
  };
});

// Build a minimal SSE readable stream for the LLM provider mock
function makeFakeStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"content":"hello"}\n\n'));
      controller.close();
    },
  });
}

function makeRequest(body: Record<string, unknown>, authHeader?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

// A minimal fake JWT-like Bearer token (not cryptographically valid but parseable by substring)
const FAKE_BEARER = 'Bearer fake-token-value';

describe('POST /api/agents/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: fs/promises mocks for employee system prompt loading
    mockFsAccess.mockResolvedValue(undefined);
    mockFsReadFile.mockResolvedValue('You are a helpful AI assistant.');

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    // Default: sufficient credits
    mockCheckAvailable.mockResolvedValue(true);
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-1',
      credits_remaining_cents: 1000,
      credits_allocated_cents: 2000,
      credits_used_cents: 1000,
    });
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 950 });

    // Default: provider returns a stream
    mockStreamRequest.mockResolvedValue(makeFakeStream());
    mockCreateProvider.mockReturnValue({
      streamRequest: mockStreamRequest,
    });
  });

  it('should return 401 when no authorization header is provided and no session cookie', async () => {
    const request = makeRequest({ message: 'Hello' }); // no auth header
    // Cookie-based auth fallback is mocked to return no user (see @supabase/ssr mock)
    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when Bearer token is invalid', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const request = makeRequest({ message: 'Hello' }, FAKE_BEARER);
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when message is missing from request body', async () => {
    const request = makeRequest({ employeeId: 'eng-001' }, FAKE_BEARER);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  it('should return 403 when user has insufficient credits', async () => {
    mockCheckAvailable.mockResolvedValueOnce(false);
    mockGetBalance.mockResolvedValueOnce({
      account_id: 'acct-1',
      credits_remaining_cents: 0,
      credits_allocated_cents: 100,
      credits_used_cents: 100,
    });

    const request = makeRequest(
      { message: 'Write me a long essay', employeeId: 'test-employee' },
      FAKE_BEARER,
    );
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.code).toBe('FORBIDDEN');
    expect(data.error.message).toMatch(/credits/i);
  });

  it('should return 400 when provider is not configured', async () => {
    mockCreateProvider.mockReturnValueOnce(null); // provider not configured

    const request = makeRequest(
      { message: 'Hello', provider: 'unknown-provider', employeeId: 'test-employee' },
      FAKE_BEARER,
    );
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toMatch(/not configured/i);
  });

  it('should stream SSE response on success with default model', async () => {
    const request = makeRequest(
      {
        message: 'Say hello',
        employeeId: 'general-assistant',
      },
      FAKE_BEARER,
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('should pass system prompt and conversation history to LLM', async () => {
    const conversationHistory = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const request = makeRequest(
      {
        message: 'How are you?',
        employeeId: 'test-employee',
        systemPrompt: 'You are a helpful assistant.',
        conversationHistory,
        model: 'claude-haiku-4.5',
        provider: 'anthropic',
      },
      FAKE_BEARER,
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockStreamRequest).toHaveBeenCalledOnce();

    // Verify the messages array was built correctly
    const streamCallArgs = mockStreamRequest.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const roles = streamCallArgs.messages.map((m) => m.role);
    expect(roles).toContain('system');
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  it('should use default model when model is not specified', async () => {
    const request = makeRequest({ message: 'Hello', employeeId: 'test-employee' }, FAKE_BEARER);
    const response = await POST(request);

    expect(response.status).toBe(200);
    const streamCallArgs = mockStreamRequest.mock.calls[0]![0] as { model: string };
    // Default model is claude-haiku-4.5 (mapped through mapModelIdToApiId)
    expect(typeof streamCallArgs.model).toBe('string');
  });

  it('should return 500 when LLM provider throws an error', async () => {
    mockStreamRequest.mockRejectedValueOnce(new Error('Provider upstream error'));

    const request = makeRequest({ message: 'Hello', employeeId: 'test-employee' }, FAKE_BEARER);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });

  it('should include employeeId in credit deduction metadata', async () => {
    const request = makeRequest({ message: 'Hello', employeeId: 'legal-advisor' }, FAKE_BEARER);

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Consume the stream so the flush callback fires
    const reader = response.body?.getReader();
    if (reader) {
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
      }
    }

    // Credit deduction should have been called after stream flush. Signature:
    // deductCredits(client, userId, amountCents, description, metadata, idempotencyKey)
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.anything(), // userClient
      'user-123',
      expect.any(Number),
      expect.stringContaining('agent execution'),
      expect.objectContaining({ employeeId: 'legal-advisor' }),
      expect.any(String),
    );
  });
});
