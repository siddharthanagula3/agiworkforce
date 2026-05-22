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

import { OpenRouterProvider } from '../openrouter';

const MOCK_API_KEY = 'sk-or-test-openrouter-key';

const BASIC_REQUEST = {
  model: 'meta-llama/llama-3.3-70b-instruct:free',
  messages: [{ role: 'user' as const, content: 'Hello via OpenRouter' }],
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

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new OpenRouterProvider(MOCK_API_KEY);
  });

  describe('constructor and config', () => {
    it('reads API key from constructor', () => {
      const p = new OpenRouterProvider('my-or-key');
      expect((p as any).apiKey).toBe('my-or-key');
    });

    it('defaults to OpenRouter API base URL', () => {
      expect(provider.getDefaultBaseUrl()).toBe('https://openrouter.ai/api/v1');
    });

    it('respects custom base URL', () => {
      const p = new OpenRouterProvider(MOCK_API_KEY, 'https://openrouter.ai/api/v1');
      expect((p as any).baseUrl).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('sendRequest - API URL construction', () => {
    it('POSTs to /chat/completions', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'Routed!' }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );

      await provider.sendRequest(BASIC_REQUEST);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('sendRequest - header construction (OpenRouter-specific)', () => {
    it('sends Authorization Bearer, Content-Type, HTTP-Referer, and X-Title headers', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );

      await provider.sendRequest(BASIC_REQUEST);

      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${MOCK_API_KEY}`);
      expect(headers['Content-Type']).toBe('application/json');
      // OpenRouter attribution headers (required by OpenRouter ToS)
      expect(headers['HTTP-Referer']).toBeTruthy();
      expect(headers['X-Title']).toBe('AGI Workforce');
    });
  });

  describe('sendRequest - response parsing', () => {
    it('parses successful response fields correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'Routed response' }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
        }),
      );

      const result = await provider.sendRequest(BASIC_REQUEST);

      expect(result.content).toBe('Routed response');
      expect(result.model).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(result.promptTokens).toBe(12);
      expect(result.completionTokens).toBe(7);
      expect(result.totalTokens).toBe(19);
      expect(result.finishReason).toBe('stop');
    });
  });

  describe('sendRequest - tool call pass-through', () => {
    it('includes tool_calls when present in response', async () => {
      const fakeCalls = [
        {
          id: 'call_or_1',
          type: 'function',
          function: { name: 'search', arguments: '{"q":"test"}' },
        },
      ];
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [
            { message: { content: '', tool_calls: fakeCalls }, finish_reason: 'tool_calls' },
          ],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
      );

      const result = await provider.sendRequest({
        ...BASIC_REQUEST,
        tools: [{ type: 'function', function: { name: 'search', parameters: {} } }],
      });

      expect(result.tool_calls).toEqual(fakeCalls);
    });

    it('transforms Anthropic input_schema tools to OpenAI function format', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'ok', tool_calls: [] }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );

      await provider.sendRequest({
        ...BASIC_REQUEST,
        tools: [
          {
            name: 'lookup',
            description: 'Look something up',
            input_schema: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.tools[0]).toMatchObject({
        type: 'function',
        function: { name: 'lookup', description: 'Look something up' },
      });
    });
  });

  describe('sendRequest - env-key / error paths', () => {
    it('throws descriptive error on 401 (OPENROUTER_API_KEY invalid)', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Invalid API key'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('OpenRouter authentication error (401)');
    });

    it('throws on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'rate_limited', '60'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('OpenRouter rate limit exceeded (429)');
    });

    it('throws on 402 insufficient credits', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(402, 'No credits'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('OpenRouter insufficient credits (402)');
    });

    it('throws when empty choices returned', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [],
          model: 'some-model',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
      );
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('OpenRouter returned empty choices');
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

    it('includes attribution headers during streaming', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

      await provider.streamRequest(BASIC_REQUEST);

      const headers = mockFetch.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['HTTP-Referer']).toBeTruthy();
      expect(headers['X-Title']).toBe('AGI Workforce');
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
      expect(err!.message).toContain('No response body for OpenRouter streaming request');
    });

    it('throws descriptive error on stream 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
      let err: Error | null = null;
      try {
        await provider.streamRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('OpenRouter authentication error (401)');
    });
  });
});
