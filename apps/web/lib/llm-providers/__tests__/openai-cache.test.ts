import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: vi.fn((id: string) => {
    if (id === 'gpt-5.5') {
      return { provider: 'openai', capabilities: { thinking: false } };
    }
    return null;
  }),
  normalizeModelId: vi.fn((id: string) => id),
}));

import { OpenAIProvider } from '../openai';

const MOCK_KEY = 'sk-test-openai-key';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    model: 'gpt-5.5',
    messages: [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'Hello' },
    ],
    usePromptCache: true,
    ...overrides,
  };
}

function okOpenAiJson(promptTokensDetails?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'Response', tool_calls: null }, finish_reason: 'stop' }],
      model: 'gpt-5.5',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        ...(promptTokensDetails ? { prompt_tokens_details: promptTokensDetails } : {}),
      },
    }),
    headers: { get: () => null },
  };
}

describe('OpenAIProvider cache behavior', () => {
  let provider: OpenAIProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new OpenAIProvider(MOCK_KEY);
  });

  describe('sendRequest — NO cache_control header (OpenAI-specific)', () => {
    it('does NOT add cache_control to any message even with usePromptCache=true', async () => {
      mockFetch.mockResolvedValueOnce(okOpenAiJson());

      await provider.sendRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      for (const msg of body.messages) {
        expect(msg.cache_control).toBeUndefined();
      }
    });

    it('does NOT add cache_control to last user message', async () => {
      mockFetch.mockResolvedValueOnce(okOpenAiJson());

      await provider.sendRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const lastMsg = body.messages[body.messages.length - 1];
      expect(lastMsg.cache_control).toBeUndefined();
    });
  });

  describe('sendRequest — cached_tokens from usage response', () => {
    it('reads cached_tokens from prompt_tokens_details when present', async () => {
      mockFetch.mockResolvedValueOnce(okOpenAiJson({ cached_tokens: 512 }));

      const result = await provider.sendRequest(makeRequest());

      expect(result.cachedInputTokens).toBe(512);
    });

    it('returns undefined cachedInputTokens when prompt_tokens_details is absent', async () => {
      mockFetch.mockResolvedValueOnce(okOpenAiJson());

      const result = await provider.sendRequest(makeRequest());

      expect(result.cachedInputTokens).toBeUndefined();
    });

    it('returns undefined cachedInputTokens when cached_tokens is 0', async () => {
      // 0 should be surfaced (not suppressed), as it is a valid observation.
      mockFetch.mockResolvedValueOnce(okOpenAiJson({ cached_tokens: 0 }));

      const result = await provider.sendRequest(makeRequest());

      // 0 is falsy but defined — ensure it's passed through.
      expect(result.cachedInputTokens).toBe(0);
    });

    it('does NOT surface cacheCreationInputTokens for OpenAI (not exposed by API)', async () => {
      mockFetch.mockResolvedValueOnce(okOpenAiJson({ cached_tokens: 256 }));

      const result = await provider.sendRequest(makeRequest());

      // OpenAI does not expose a separate cache-write counter.
      expect(result.cacheCreationInputTokens).toBeUndefined();
    });
  });

  describe('streamRequest — no cache_control', () => {
    it('does NOT add cache_control in streaming path', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

      await provider.streamRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      for (const msg of body.messages) {
        expect(msg.cache_control).toBeUndefined();
      }
    });
  });
});
