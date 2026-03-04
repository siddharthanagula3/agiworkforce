/**
 * AnthropicProvider Tests
 *
 * Tests for AnthropicProvider covering HTTP error handling, sendRequest,
 * streamRequest, message mapping, and prompt caching.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// server-only must be mocked before any other imports
vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AnthropicProvider } from '@/lib/llm-providers/anthropic';
import type { LLMProviderRequest } from '@/lib/llm-providers/base';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeErrorResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeAnthropicSuccessBody(
  overrides: Partial<{
    content: unknown[];
    stop_reason: string;
    usage: unknown;
    model: string;
  }> = {},
) {
  return {
    id: 'msg_001',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6-20251101',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Hello!' }],
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

function baseRequest(overrides: Partial<LLMProviderRequest> = {}): LLMProviderRequest {
  return {
    model: 'claude-opus-4-6-20251101',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new AnthropicProvider('sk-ant-test');
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // =========================================================================
  // HTTP Error Handling (via sendRequest)
  // =========================================================================

  describe('HTTP error handling', () => {
    it('throws on HTTP 400 with descriptive message', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(400, { error: { message: 'Bad request' } }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/400/);
    });

    it('throws authentication error on HTTP 401', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrorResponse(401, { error: { message: 'Unauthorized' } }),
      );
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/401|authentication/i);
    });

    it('throws permission error on HTTP 403', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(403, { error: { message: 'Forbidden' } }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/403|permission/i);
    });

    it('throws not-found error on HTTP 404', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(404, { error: { message: 'Not found' } }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/404|not found/i);
    });

    it('throws rate limit error on HTTP 429', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrorResponse(429, { error: { message: 'Rate limited' } }),
      );
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/429|rate limit/i);
    });

    it('includes retry-after in rate limit error when header is present', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'retry-after': '30' },
        }),
      );
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/30/);
    });

    it('throws server error on HTTP 500', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(500, { error: 'Internal error' }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/500|service error/i);
    });

    it('throws server error on HTTP 502', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(502, { error: 'Bad gateway' }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/502|service error/i);
    });

    it('throws server error on HTTP 503', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(503, { error: 'Unavailable' }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/503|service error/i);
    });

    it('throws overloaded error on HTTP 529', async () => {
      fetchSpy.mockResolvedValueOnce(makeErrorResponse(529, { error: 'Overloaded' }));
      await expect(provider.sendRequest(baseRequest())).rejects.toThrow(/529|overloaded/i);
    });
  });

  // =========================================================================
  // sendRequest — success paths
  // =========================================================================

  describe('sendRequest', () => {
    it('returns parsed content, model, and token usage on success', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      const result = await provider.sendRequest(baseRequest());

      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('claude-opus-4-6-20251101');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(5);
      expect(result.totalTokens).toBe(15);
    });

    it('returns empty content when no text block exists', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody({ content: [] })));
      const result = await provider.sendRequest(baseRequest());
      expect(result.content).toBe('');
    });

    it('extracts tool_use blocks as tool_calls in OpenAI format', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse(
          makeAnthropicSuccessBody({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_01',
                name: 'get_weather',
                input: { location: 'London' },
              },
            ],
          }),
        ),
      );

      const result = await provider.sendRequest(baseRequest());

      expect(result.tool_calls).toHaveLength(1);
      const call = result.tool_calls![0] as {
        id: string;
        type: string;
        function: { name: string; arguments: string };
      };
      expect(call.id).toBe('toolu_01');
      expect(call.type).toBe('function');
      expect(call.function.name).toBe('get_weather');
      expect(JSON.parse(call.function.arguments)).toEqual({ location: 'London' });
    });

    it('maps stop_reason "tool_use" to finishReason "tool_calls"', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse(
          makeAnthropicSuccessBody({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'toolu_01', name: 'fn', input: {} }],
          }),
        ),
      );

      const result = await provider.sendRequest(baseRequest());
      expect(result.finishReason).toBe('tool_calls');
    });

    it('propagates cache token counts when present', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse(
          makeAnthropicSuccessBody({
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 80,
              cache_read_input_tokens: 20,
            },
          }),
        ),
      );

      const result = await provider.sendRequest(baseRequest());
      expect(result.cacheCreationInputTokens).toBe(80);
      expect(result.cachedInputTokens).toBe(20);
    });

    it('strips system messages from the messages array passed to Anthropic', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(body.system).toBe('You are helpful.');
      const systemInMessages = body.messages.some((m: { role: string }) => m.role === 'system');
      expect(systemInMessages).toBe(false);
    });
  });

  // =========================================================================
  // Prompt caching
  // =========================================================================

  describe('prompt caching', () => {
    it('adds cache_control to system content when usePromptCache is true', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          usePromptCache: true,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(Array.isArray(body.system)).toBe(true);
      expect(body.system[0]).toMatchObject({
        type: 'text',
        text: 'You are a helpful assistant.',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('adds cache_control to last user message when usePromptCache is true', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          usePromptCache: true,
          messages: [{ role: 'user', content: 'Hello there' }],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      const lastMsg = body.messages[body.messages.length - 1];
      expect(Array.isArray(lastMsg.content)).toBe(true);
      expect(lastMsg.content[0]).toMatchObject({
        type: 'text',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('does not add cache_control when usePromptCache is false', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          usePromptCache: false,
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      // system should be a plain string, not an array
      expect(typeof body.system).toBe('string');
    });
  });

  // =========================================================================
  // streamRequest
  // =========================================================================

  describe('streamRequest', () => {
    function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
    }

    it('returns the response body as a ReadableStream', async () => {
      const sseChunks = [
        'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6-20251101","stop_reason":null,"usage":{"input_tokens":5,"output_tokens":0}}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ];

      const fakeBody = makeSSEStream(sseChunks);

      fetchSpy.mockResolvedValueOnce(
        new Response(fakeBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const stream = await provider.streamRequest(baseRequest({ stream: true }));
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('throws on HTTP 401 during streaming', async () => {
      fetchSpy.mockResolvedValueOnce(
        makeErrorResponse(401, { error: { message: 'Unauthorized' } }),
      );

      await expect(provider.streamRequest(baseRequest({ stream: true }))).rejects.toThrow(
        /401|authentication/i,
      );
    });

    it('throws when response body is null', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(provider.streamRequest(baseRequest({ stream: true }))).rejects.toThrow(
        /no response body/i,
      );
    });

    it('sends stream: true in the request body', async () => {
      const fakeBody = makeSSEStream(['data: {"type":"message_stop"}\n\n']);
      fetchSpy.mockResolvedValueOnce(
        new Response(fakeBody, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      await provider.streamRequest(baseRequest({ stream: true }));

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(body.stream).toBe(true);
    });
  });

  // =========================================================================
  // mapMessagesToAnthropic (exercised via sendRequest)
  // =========================================================================

  describe('mapMessagesToAnthropic (via sendRequest)', () => {
    it('converts tool-role messages to tool_result blocks inside a user message', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          messages: [
            { role: 'user', content: 'What is the weather?' },
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'toolu_01',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{"location":"London"}' },
                },
              ],
            },
            { role: 'tool', content: 'Sunny, 20C', tool_call_id: 'toolu_01' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      // The tool message should be inside a role:"user" message
      const toolResultMessage = body.messages.find(
        (m: { role: string; content: unknown }) => m.role === 'user' && Array.isArray(m.content),
      );
      expect(toolResultMessage).toBeDefined();
      const toolResultBlock = (
        toolResultMessage.content as Array<{ type: string; tool_use_id: string; content: string }>
      ).find((c) => c.type === 'tool_result');
      expect(toolResultBlock).toBeDefined();
      expect(toolResultBlock?.tool_use_id).toBe('toolu_01');
      expect(toolResultBlock?.content).toBe('Sunny, 20C');
    });

    it('converts assistant tool_calls to tool_use blocks', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          messages: [
            { role: 'user', content: 'Call the tool' },
            {
              role: 'assistant',
              content: 'I will call it',
              tool_calls: [
                {
                  id: 'toolu_01',
                  type: 'function',
                  function: { name: 'my_tool', arguments: '{"key":"value"}' },
                },
              ],
            },
            // A follow-up tool result so the assistant message is not last
            { role: 'tool', content: 'result', tool_call_id: 'toolu_01' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      const assistantMsg = body.messages.find((m: { role: string }) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      const toolUseBlock = (
        assistantMsg.content as Array<{ type: string; id: string; name: string }>
      ).find((c) => c.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock?.id).toBe('toolu_01');
      expect(toolUseBlock?.name).toBe('my_tool');
    });

    it('adds cache_control to last tool_result when usePromptCache is true', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          usePromptCache: true,
          messages: [
            { role: 'user', content: 'Call the tool' },
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'toolu_01',
                  type: 'function',
                  function: { name: 'my_tool', arguments: '{}' },
                },
              ],
            },
            { role: 'tool', content: 'result', tool_call_id: 'toolu_01' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      const toolResultMsg = body.messages.find(
        (m: { role: string; content: unknown[] }) => m.role === 'user' && Array.isArray(m.content),
      );
      const lastBlock = toolResultMsg?.content[toolResultMsg.content.length - 1] as {
        cache_control?: { type: string };
      };
      expect(lastBlock?.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('skips empty content messages', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      await provider.sendRequest(
        baseRequest({
          messages: [
            { role: 'user', content: '' }, // should be skipped
            { role: 'user', content: 'Hello' },
          ],
        }),
      );

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      // Only the non-empty message should appear
      expect(body.messages).toHaveLength(1);
      expect((body.messages[0] as { content: string }).content).toBe('Hello');
    });
  });

  // =========================================================================
  // transformTools (exercised via sendRequest)
  // =========================================================================

  describe('transformTools (via sendRequest)', () => {
    it('passes through already-Anthropic-format tools unchanged', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      const anthropicTool = {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      };

      await provider.sendRequest(baseRequest({ tools: [anthropicTool] }));

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(body.tools[0]).toEqual(anthropicTool);
    });

    it('transforms OpenAI function-format tools to Anthropic format', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      const openAiTool = {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      };

      await provider.sendRequest(baseRequest({ tools: [openAiTool] }));

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(body.tools[0]).toEqual({
        name: 'get_weather',
        description: 'Get weather for a location',
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      });
    });

    it('falls back to parameters when input_schema is missing', async () => {
      fetchSpy.mockResolvedValueOnce(makeOkResponse(makeAnthropicSuccessBody()));

      const bareTool = {
        name: 'my_tool',
        description: 'A bare tool',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      };

      await provider.sendRequest(baseRequest({ tools: [bareTool] }));

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
      expect(body.tools[0].input_schema).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
    });
  });
});
