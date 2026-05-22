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

import { MistralProvider } from '../mistral';

const MOCK_API_KEY = 'test-mistral-key';

const BASIC_REQUEST = {
  model: 'mistral-large-2512',
  messages: [{ role: 'user' as const, content: 'Hello, Mistral' }],
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

describe('MistralProvider', () => {
  let provider: MistralProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new MistralProvider(MOCK_API_KEY);
  });

  describe('constructor and config', () => {
    it('reads API key from constructor', () => {
      const p = new MistralProvider('my-key');
      expect((p as any).apiKey).toBe('my-key');
    });

    it('defaults to Mistral API base URL', () => {
      expect(provider.getDefaultBaseUrl()).toBe('https://api.mistral.ai/v1');
    });

    it('respects custom base URL', () => {
      const p = new MistralProvider(MOCK_API_KEY, 'https://api.mistral.ai/v1');
      expect((p as any).baseUrl).toBe('https://api.mistral.ai/v1');
    });
  });

  describe('sendRequest - API URL construction', () => {
    it('POSTs to /chat/completions', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
          model: 'mistral-large-2512',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );

      await provider.sendRequest(BASIC_REQUEST);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('sendRequest - header construction', () => {
    it('sends Authorization Bearer token and Content-Type', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'mistral-large-2512',
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
    it('parses successful response fields correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
          model: 'mistral-large-2512',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );

      const result = await provider.sendRequest(BASIC_REQUEST);

      expect(result.content).toBe('Hi there!');
      expect(result.model).toBe('mistral-large-2512');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(5);
      expect(result.totalTokens).toBe(15);
      expect(result.finishReason).toBe('stop');
    });
  });

  describe('sendRequest - tool call pass-through', () => {
    it('includes tool_calls in response when present', async () => {
      const fakeCalls = [
        { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{}' } },
      ];
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [
            { message: { content: '', tool_calls: fakeCalls }, finish_reason: 'tool_calls' },
          ],
          model: 'mistral-large-2512',
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
      );

      const result = await provider.sendRequest({
        ...BASIC_REQUEST,
        tools: [
          {
            type: 'function',
            function: { name: 'get_weather', description: 'Get weather', parameters: {} },
          },
        ],
      });

      expect(result.tool_calls).toEqual(fakeCalls);
    });

    it('transforms Anthropic-format tools to OpenAI format', async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          choices: [{ message: { content: 'ok', tool_calls: [] }, finish_reason: 'stop' }],
          model: 'mistral-large-2512',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );

      await provider.sendRequest({
        ...BASIC_REQUEST,
        tools: [
          {
            name: 'search',
            description: 'Search the web',
            input_schema: { type: 'object', properties: { q: { type: 'string' } } },
          },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.tools[0]).toMatchObject({
        type: 'function',
        function: { name: 'search', description: 'Search the web' },
      });
    });
  });

  describe('sendRequest - env-key / missing-key error path', () => {
    it('throws a descriptive error on 401', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Invalid API key'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Mistral authentication error (401)');
    });

    it('throws on 429 with retry-after hint', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'Rate limited', '30'));
      let err: Error | null = null;
      try {
        await provider.sendRequest(BASIC_REQUEST);
      } catch (e) {
        err = e as Error;
      }
      expect(err).not.toBeNull();
      expect(err!.message).toContain('Mistral rate limit exceeded (429)');
    });
  });

  describe('streamRequest', () => {
    it('POSTs to /chat/completions with stream: true', async () => {
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
      expect(err!.message).toContain('No response body for Mistral streaming request');
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
      expect(err!.message).toContain('Mistral authentication error (401)');
    });
  });
});
