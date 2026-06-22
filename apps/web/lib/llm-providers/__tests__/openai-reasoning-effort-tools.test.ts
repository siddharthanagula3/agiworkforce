import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
// Mock @agiworkforce/types so getModelMetadataById returns minimal metadata
// for gpt-5.4-mini. thinking=false means max_tokens (not max_completion_tokens).
// @agiworkforce/llm-normalize is intentionally NOT mocked here — normalizeReasoningEffort
// and supportsOpenAIReasoningEffort must execute with real logic.
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: vi.fn((id: string) => {
    if (id === 'gpt-5.4-mini') {
      return { provider: 'openai', capabilities: { thinking: false } };
    }
    return null;
  }),
  normalizeModelId: vi.fn((id: string) => id),
}));

import { OpenAIProvider } from '../openai';

const MOCK_KEY = 'sk-test-key';

/** Minimal SSE stream that immediately emits [DONE] so streamRequest resolves. */
function okStreamBody(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function makeToolsRequest(overrides: Record<string, unknown> = {}) {
  return {
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user' as const, content: 'count to 10' }],
    effort: 'low',
    tools: [
      {
        function: {
          name: 'run_code',
          description: 'Execute code',
          parameters: { type: 'object', properties: {} },
        },
      },
    ],
    ...overrides,
  };
}

describe('OpenAI reasoning_effort suppression when tools are present', () => {
  let provider: OpenAIProvider;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    provider = new OpenAIProvider(MOCK_KEY);
  });

  describe('streamRequest (demo-critical path — E2B tools hit streaming)', () => {
    it('omits reasoning_effort when tools are present (gpt-5.4-mini + effort=low + tools)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: okStreamBody(),
        headers: { get: () => null },
      });

      // Start streaming (resolves once [DONE] is received)
      const stream = await provider.streamRequest(makeToolsRequest());
      // Drain the stream so the promise fully resolves
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* drain */
      }

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body['reasoning_effort']).toBeUndefined();
      // tools should still be present
      expect(Array.isArray(body['tools'])).toBe(true);
    });

    it('emits reasoning_effort when no tools are present (gpt-5.4-mini + effort=low, no tools)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: okStreamBody(),
        headers: { get: () => null },
      });

      const stream = await provider.streamRequest(makeToolsRequest({ tools: undefined }));
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* drain */
      }

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body['reasoning_effort']).toBe('low');
      expect(body['tools']).toBeUndefined();
    });
  });

  describe('sendRequest (non-streaming fallback path)', () => {
    it('omits reasoning_effort when tools are present (gpt-5.4-mini + effort=low + tools)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok', tool_calls: null }, finish_reason: 'stop' }],
          model: 'gpt-5.4-mini',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        headers: { get: () => null },
      });

      await provider.sendRequest(makeToolsRequest());

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body['reasoning_effort']).toBeUndefined();
      expect(Array.isArray(body['tools'])).toBe(true);
    });

    it('emits reasoning_effort when no tools are present (gpt-5.4-mini + effort=low, no tools)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok', tool_calls: null }, finish_reason: 'stop' }],
          model: 'gpt-5.4-mini',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        headers: { get: () => null },
      });

      await provider.sendRequest(makeToolsRequest({ tools: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body['reasoning_effort']).toBe('low');
      expect(body['tools']).toBeUndefined();
    });
  });
});
