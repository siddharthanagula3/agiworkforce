import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { OpenRouterProvider } from '../openrouter';

const MOCK_KEY = 'sk-or-test-key';

type AnyObj = Record<string, unknown>;

function okOpenRouterJson(usage?: AnyObj) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        { message: { content: 'Routed response', tool_calls: null }, finish_reason: 'stop' },
      ],
      model: 'anthropic/claude-opus-4-6',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 60,
        ...(usage ?? {}),
      },
    }),
    headers: { get: () => null },
  };
}

function findMsg(msgs: AnyObj[], role: string): AnyObj {
  return msgs.find((m) => m['role'] === role) as AnyObj;
}

describe('OpenRouterProvider cache_control for Anthropic-routed models', () => {
  let provider: OpenRouterProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new OpenRouterProvider(MOCK_KEY);
  });

  describe('sendRequest — Anthropic-routed model', () => {
    it('injects cache_control on system message for anthropic/* model', async () => {
      mockFetch.mockResolvedValueOnce(okOpenRouterJson());

      await provider.sendRequest({
        model: 'anthropic/claude-opus-4-6',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
        usePromptCache: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const systemMsg = findMsg(body.messages, 'system');
      const content = systemMsg['content'] as unknown[];
      expect(Array.isArray(content)).toBe(true);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'You are a helpful assistant.',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('does NOT inject cache_control on non-system messages', async () => {
      mockFetch.mockResolvedValueOnce(okOpenRouterJson());

      await provider.sendRequest({
        model: 'anthropic/claude-opus-4-6',
        messages: [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'User message' },
        ],
        usePromptCache: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const userMsg = findMsg(body.messages, 'user');
      // user message should remain as plain string (no cache_control injection)
      expect(userMsg['cache_control']).toBeUndefined();
      expect(typeof userMsg['content']).toBe('string');
    });
  });

  describe('sendRequest — Non-Anthropic routed model', () => {
    it('does NOT inject cache_control for google/* models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'google/gemini-3-pro',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        headers: { get: () => null },
      });

      await provider.sendRequest({
        model: 'google/gemini-3-pro',
        messages: [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'Hello' },
        ],
        usePromptCache: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const systemMsg = findMsg(body.messages, 'system');
      // System message should be plain string — no cache_control array wrapping.
      expect(typeof systemMsg['content']).toBe('string');
    });

    it('does NOT inject cache_control for meta-llama/* models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
        headers: { get: () => null },
      });

      await provider.sendRequest({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const systemMsg = findMsg(body.messages, 'system');
      expect(typeof systemMsg['content']).toBe('string');
    });
  });

  describe('sendRequest — cache tokens from response', () => {
    it('surfaces cache_read_input_tokens as cachedInputTokens', async () => {
      mockFetch.mockResolvedValueOnce(okOpenRouterJson());

      const result = await provider.sendRequest({
        model: 'anthropic/claude-opus-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.cachedInputTokens).toBe(40);
    });

    it('surfaces cache_creation_input_tokens', async () => {
      mockFetch.mockResolvedValueOnce(okOpenRouterJson());

      const result = await provider.sendRequest({
        model: 'anthropic/claude-opus-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.cacheCreationInputTokens).toBe(60);
    });

    it('returns undefined cache tokens when response has no cache fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        headers: { get: () => null },
      });

      const result = await provider.sendRequest({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.cachedInputTokens).toBeUndefined();
      expect(result.cacheCreationInputTokens).toBeUndefined();
    });
  });

  describe('streamRequest — system cache_control for anthropic/* models', () => {
    it('injects cache_control in system message during streaming', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

      await provider.streamRequest({
        model: 'anthropic/claude-opus-4-6',
        messages: [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'Hello' },
        ],
        usePromptCache: true,
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const systemMsg = findMsg(body.messages, 'system');
      const content = systemMsg['content'] as unknown[];
      expect(Array.isArray(content)).toBe(true);
      expect((content[0] as AnyObj)['cache_control']).toMatchObject({ type: 'ephemeral' });
    });

    it('does NOT inject cache_control for non-anthropic models in streaming', async () => {
      const mockBody = {} as ReadableStream;
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockBody });

      await provider.streamRequest({
        model: 'google/gemini-3-pro',
        messages: [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body);
      const systemMsg = findMsg(body.messages, 'system');
      expect(typeof systemMsg['content']).toBe('string');
    });
  });
});
