import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock server-only so it doesn't crash in test environment
vi.mock('server-only', () => ({}));

// Mock logger to suppress output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GroqProvider } from '../groq';

const MOCK_API_KEY = 'gsk_test-groq-key';

const BASIC_REQUEST = {
  model: 'llama-3.3-70b-versatile',
  messages: [{ role: 'user' as const, content: 'Hello from Groq' }],
};

/** Helper: make a successful JSON mock response */
function okJson(data: unknown) {
  return { ok: true, json: async () => data, headers: { get: () => null } };
}

/** Helper: make a failing HTTP mock response */
function errorResponse(status: number, body = 'error', retryAfter: string | null = null) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: (h: string) => (h === 'retry-after' ? retryAfter : null) },
    text: async () => body,
  };
}

describe('GroqProvider', () => {
  let provider: GroqProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new GroqProvider(MOCK_API_KEY);
  });

  describe('constructor and config', () => {
    it('reads API key from constructor', () => {
      const p = new GroqProvider('my-groq-key');
      expect((p as any).apiKey).toBe('my-groq-key');
    });

    it('defaults to Groq OpenAI-compatible base URL', () => {
      expect(provider.getDefaultBaseUrl()).toBe('https://api.groq.com/openai/v1');
    });

    it('respects custom base URL', () => {
      const p = new GroqProvider(MOCK_API_KEY, 'https://api.groq.com/openai/v1');
      expect((p as any).baseUrl).toBe('https://api.groq.com/openai/v1');
    });
  });

  describe('sendRequest - API URL construction', () => {
    it('POSTs to /chat/completions', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'Fast!' }, finish_reason: 'stop' }],
          model: 'llama-3.3-70b-versatile',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );

      await provider.sendRequest(BASIC_REQUEST);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('sendRequest - header construction', () => {
    it('sends Authorization Bearer token and Content-Type', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'llama-3.3-70b-versatile',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );

      await provider.sendRequest(BASIC_REQUEST);

      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${MOCK_API_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('sendRequest - response parsing', () => {
    it('parses successful response fields', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'LPU speed!' }, finish_reason: 'stop' }],
          model: 'llama-3.3-70b-versatile',
          usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
        }),
      );

      const result = await provider.sendRequest(BASIC_REQUEST);

      expect(result.content).toBe('LPU speed!');
      expect(result.model).toBe('llama-3.3-70b-versatile');
      expect(result.promptTokens).toBe(8);
      expect(result.completionTokens).toBe(3);
      expect(result.totalTokens).toBe(11);
      expect(result.finishReason).toBe('stop');
    });
  });

  describe('sendRequest - tool call pass-through', () => {
    it('includes tool_calls in response when present', async () => {
      const fakeCalls = [
        {
          id: 'call_abc',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":"test"}' },
        },
      ];
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [
            { message: { content: '', tool_calls: fakeCalls }, finish_reason: 'tool_calls' },
          ],
          model: 'llama-3.3-70b-versatile',
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
      );

      const result = await provider.sendRequest({
        ...BASIC_REQUEST,
        tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
      });

      expect(result.tool_calls).toEqual(fakeCalls);
    });
  });

  describe('sendRequest - error paths', () => {
    it('throws descriptive error on 401 (GROQ_API_KEY invalid)', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'invalid_api_key'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Groq authentication error (401)');
    });

    it('throws on 429 rate limit with retry hint', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'rate_limit_exceeded', '10'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Groq rate limit exceeded (429)');
    });

    it('throws on missing-key scenario - 401 from empty key', async () => {
      const badProvider = new GroqProvider('');
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'unauthorized'));
      let err: Error | null = null;
      try {
        await badProvider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Groq authentication error (401)');
    });

    it('throws on retryable 503', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(503, 'temporarily down'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Groq API service error (503)');
    });
  });

  describe('streamRequest', () => {
    it('POSTs with stream: true and returns body', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

      const result = await provider.streamRequest(BASIC_REQUEST);

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.stream).toBe(true);
      expect(result).toBe(mockBody);
    });

    it('throws when response.body is null', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, body: null });
      let err: Error | null = null;
      try {
        await provider.streamRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('No response body for Groq streaming request');
    });

    it('throws descriptive error on stream 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too many requests',
      });
      let err: Error | null = null;
      try {
        await provider.streamRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Groq rate limit exceeded (429)');
    });
  });
});
