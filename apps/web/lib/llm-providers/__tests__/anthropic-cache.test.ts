import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/egress-policy', () => ({
  validateUserImageUrl: vi.fn(),
  EgressPolicyError: class EgressPolicyError extends Error {},
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { AnthropicProvider } from '../anthropic';

const MOCK_KEY = 'sk-ant-test-key';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-4-6',
    messages: [
      { role: 'system' as const, content: 'You are a test assistant.' },
      { role: 'user' as const, content: 'Hello' },
    ],
    usePromptCache: true,
    ...overrides,
  };
}

function okAnthropicJson(usage?: Record<string, unknown>) {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      content: [{ type: 'text', text: 'Response' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 80,
        cache_read_input_tokens: 20,
        ...(usage ?? {}),
      },
    }),
  };
}

describe('AnthropicProvider cache_control', () => {
  let provider: AnthropicProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new AnthropicProvider(MOCK_KEY);
  });

  describe('sendRequest — system message cache_control', () => {
    it('applies ephemeral cache_control to system message when usePromptCache=true', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.system).toEqual([
        { type: 'text', text: 'You are a test assistant.', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('uses { type: ephemeral } (no ttl) for short retention (default)', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest({ cacheRetention: 'short' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const cc = body.system[0].cache_control;
      expect(cc).toEqual({ type: 'ephemeral' });
      expect(cc.ttl).toBeUndefined();
    });

    it('uses { type: ephemeral, ttl: "1h" } for long retention', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest({ cacheRetention: 'long' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });

    it('omits cache_control when cacheRetention is none', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest({ cacheRetention: 'none' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      // system should be plain string (no caching)
      expect(typeof body.system).toBe('string');
    });

    it('omits cache_control when usePromptCache=false', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest({ usePromptCache: false }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(typeof body.system).toBe('string');
    });
  });

  describe('sendRequest — last user message cache_control', () => {
    it('applies cache_control to last user message content block', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      await provider.sendRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const lastMsg = body.messages[body.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(Array.isArray(lastMsg.content)).toBe(true);
      const lastBlock = lastMsg.content[lastMsg.content.length - 1];
      expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('sendRequest — response usage parsing', () => {
    it('surfaces cache_creation_input_tokens from response', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      const result = await provider.sendRequest(makeRequest());

      expect(result.cacheCreationInputTokens).toBe(80);
    });

    it('surfaces cache_read_input_tokens as cachedInputTokens', async () => {
      mockFetch.mockResolvedValueOnce(okAnthropicJson());

      const result = await provider.sendRequest(makeRequest());

      expect(result.cachedInputTokens).toBe(20);
    });

    it('handles zero cache tokens gracefully', async () => {
      mockFetch.mockResolvedValueOnce(
        okAnthropicJson({ cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }),
      );

      const result = await provider.sendRequest(makeRequest());

      expect(result.cacheCreationInputTokens).toBe(0);
      expect(result.cachedInputTokens).toBe(0);
    });

    it('handles missing cache fields gracefully', async () => {
      mockFetch.mockResolvedValueOnce(
        okAnthropicJson({
          cache_creation_input_tokens: undefined,
          cache_read_input_tokens: undefined,
        }),
      );

      const result = await provider.sendRequest(makeRequest());

      expect(result.cacheCreationInputTokens).toBeUndefined();
      expect(result.cachedInputTokens).toBeUndefined();
    });
  });

  describe('streamRequest — system message cache_control', () => {
    it('applies cache_control in streaming mode', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody, headers: { get: () => null } });

      await provider.streamRequest(makeRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.system).toEqual([
        { type: 'text', text: 'You are a test assistant.', cache_control: { type: 'ephemeral' } },
      ]);
    });

    it('applies long TTL in streaming mode when cacheRetention=long', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody, headers: { get: () => null } });

      await provider.streamRequest(makeRequest({ cacheRetention: 'long' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      expect(body.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });
  });
});
