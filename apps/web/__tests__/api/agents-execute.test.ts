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

// Mock fs/promises — the route uses access(), readFile(), and stat() from fs/promises
const mockFsAccess = vi.fn();
const mockFsReadFile = vi.fn();
const mockFsStat = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    access: (...args: unknown[]) => mockFsAccess(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    stat: (...args: unknown[]) => mockFsStat(...args),
  },
  access: (...args: unknown[]) => mockFsAccess(...args),
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
  stat: (...args: unknown[]) => mockFsStat(...args),
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
  requireEnv: vi.fn((key: string) => `test-${key}`),
  getOptionalEnv: vi.fn(() => undefined),
}));

// Mock Clerk auth — getClerkAuthUser returns { userId, email? } or throws
const mockGetClerkAuthUser = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...args),
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

// Mock the server-key adapter construction service (task #34: agents/execute
// normalized off LLMProviderFactory onto packages/providers/* adapters, wire
// normalized onto the v1 chat-completions shape). `buildServerProviderAdapter`
// returns a fake ProviderAdapter whose `.stream()` yields canonical
// StreamChunks -- `chunksToOpenAiSse` (real, not mocked) turns those into the
// OpenAI-shaped SSE bytes the route actually streams to the client, so these
// tests exercise the real wire-normalization path, not a shortcut around it.
const mockAdapterStream = vi.fn();
const mockBuildServerProviderAdapter = vi.fn();
const mockResolveProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: (...args: unknown[]) => mockBuildServerProviderAdapter(...args),
  resolveProviderFromModel: (...args: unknown[]) => mockResolveProviderFromModel(...args),
  toApiModelId: (modelId: string) => modelId,
  toGenericUpstreamError: (providerId: string, chunk: { message: string }) =>
    new Error(`${providerId} API error: ${chunk.message}`),
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
      notFound: (msg: string) => new AppError(msg, 'NOT_FOUND', 404),
      serviceUnavailable: (msg: string) => new AppError(msg, 'SERVICE_UNAVAILABLE', 503),
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

/** Turn an array of canonical StreamChunks into an async generator, matching
 *  `ProviderAdapter.stream()`'s signature (req, signal) => AsyncIterable. */
function fakeAdapterStream(chunks: unknown[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk;
  };
}

/** Default happy-path fixture: a single text delta then a normal stop. */
function makeFakeChunks() {
  return fakeAdapterStream([
    { type: 'text-delta', delta: 'hello' },
    { type: 'stop', reason: 'end_turn' },
  ]);
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
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: fs/promises mocks for employee system prompt loading.
    // stat() backs isAgentExecutionProvisioned() — default to "provisioned" so the
    // existing happy-path tests still reach the per-employee load.
    mockFsAccess.mockResolvedValue(undefined);
    mockFsReadFile.mockResolvedValue('You are a helpful AI assistant.');
    mockFsStat.mockResolvedValue({ isDirectory: () => true });

    // Default: authenticated user via Clerk
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-123', email: 'test@example.com' });

    // Default: sufficient credits
    mockCheckAvailable.mockResolvedValue(true);
    mockGetBalance.mockResolvedValue({
      account_id: 'acct-1',
      credits_remaining_cents: 1000,
      credits_allocated_cents: 2000,
      credits_used_cents: 1000,
    });
    mockDeductCredits.mockResolvedValue({ success: true, remaining_cents: 950 });

    // Default: adapter returns a happy-path StreamChunk sequence.
    mockResolveProviderFromModel.mockReturnValue('anthropic');
    mockBuildServerProviderAdapter.mockReturnValue({
      stream: (...args: unknown[]) => {
        mockAdapterStream(...args);
        return makeFakeChunks()();
      },
    });
  });

  it('should return 401 when no authorization header is provided and no session', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(
      Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    );

    const request = makeRequest({ message: 'Hello' }); // no auth header
    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when Bearer token is invalid', async () => {
    mockGetClerkAuthUser.mockRejectedValueOnce(
      Object.assign(new Error('Invalid token'), { code: 'UNAUTHORIZED', statusCode: 401 }),
    );

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
    // buildServerProviderAdapter throws synchronously when the provider's
    // *_API_KEY env var is unset -- same failure mode the pre-migration
    // LLMProviderFactory.createProvider null-return branch covered.
    mockBuildServerProviderAdapter.mockImplementationOnce(() => {
      throw new Error(
        'Provider "unknown-provider" is not configured. Please ensure the env var is set.',
      );
    });

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
    expect(mockAdapterStream).toHaveBeenCalledOnce();

    // Verify the ChatRequest was built correctly. openAIWireRequestToChatRequest
    // extracts role:'system' messages into the separate `system` field (not
    // left in `.messages` -- see provider-adapter.ts's ChatRequest shape).
    const chatRequest = mockAdapterStream.mock.calls[0]?.[0] as {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    };
    // The canonical employee prompt (mocked fs/promises fixture), not the
    // caller-supplied systemPrompt field -- that travels as a separate,
    // fenced <caller_context> user-role message (H16), never as system role.
    expect(chatRequest.system).toBe('You are a helpful AI assistant.');
    const roles = chatRequest.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
  });

  it('should use default model when model is not specified', async () => {
    const request = makeRequest({ message: 'Hello', employeeId: 'test-employee' }, FAKE_BEARER);
    const response = await POST(request);

    expect(response.status).toBe(200);
    const chatRequest = mockAdapterStream.mock.calls[0]?.[0] as { model: string };
    // Default model is the catalog's anthropic chat default (mapped through toApiModelId)
    expect(typeof chatRequest.model).toBe('string');
    expect(chatRequest.model.length).toBeGreaterThan(0);
  });

  it('should return 500 when LLM provider throws an error', async () => {
    // ProviderAdapter.stream() never throws directly -- upstream failures
    // become a {type:'error'} chunk (same contract startProviderStream's
    // eager-peek-and-throw relies on elsewhere in this migration).
    mockBuildServerProviderAdapter.mockReturnValueOnce({
      stream: (...args: unknown[]) => {
        mockAdapterStream(...args);
        return fakeAdapterStream([
          { type: 'error', message: 'Provider upstream error', code: '500' },
        ])();
      },
    });

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
    // deductCredits(userId, amountCents, description, metadata, idempotencyKey)
    expect(mockDeductCredits).toHaveBeenCalledWith(
      'user-123',
      expect.any(Number),
      expect.stringContaining('agent execution'),
      expect.objectContaining({ employeeId: 'legal-advisor' }),
      expect.any(String),
    );
  });
});
