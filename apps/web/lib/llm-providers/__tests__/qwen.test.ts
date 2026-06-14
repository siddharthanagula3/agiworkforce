import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { QwenProvider } from '../qwen';
import type { LLMProviderRequest } from '../base';

const makeRequest = (overrides: Partial<LLMProviderRequest> = {}): LLMProviderRequest => ({
  model: 'qwen-plus',
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Say hello.' },
  ],
  ...overrides,
});

function mockJsonResponse(payload: unknown) {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockStreamResponse() {
  vi.mocked(fetch).mockResolvedValue(
    new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
}

function lastRequestBody() {
  const body = vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected fetch body to be a JSON string');
  }
  return JSON.parse(body);
}

describe('QwenProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('preserves system, user, and assistant roles for native DashScope requests', async () => {
    mockJsonResponse({
      output: {
        choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      },
      model: 'qwen-plus',
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    });

    const provider = new QwenProvider('qwen-test-key');

    await provider.sendRequest(
      makeRequest({
        messages: [
          { role: 'system', content: 'You are concise.' },
          { role: 'user', content: 'Say hello.' },
          { role: 'assistant', content: 'Hello.' },
        ],
      }),
    );

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    );
    expect(
      lastRequestBody().input.messages.map((message: { role: string }) => message.role),
    ).toEqual(['system', 'user', 'assistant']);
  });

  it('uses the OpenAI-compatible DashScope chat endpoint when QWEN_BASE_URL is compatible mode', async () => {
    mockStreamResponse();

    const provider = new QwenProvider(
      'qwen-test-key',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );

    await provider.streamRequest(makeRequest());

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    expect(lastRequestBody()).toMatchObject({
      model: 'qwen-plus',
      stream: true,
    });
  });

  it('preserves tool messages and tool calls for MuleRouter OpenAI-compatible requests', async () => {
    const toolCalls = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"query":"weather"}' },
      },
    ];
    mockJsonResponse({
      choices: [{ message: { content: '', tool_calls: toolCalls }, finish_reason: 'tool_calls' }],
      model: 'qwen-plus',
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    });

    const provider = new QwenProvider('qwen-test-key', 'https://api.mulerouter.ai');

    const response = await provider.sendRequest(
      makeRequest({
        messages: [
          { role: 'system', content: 'Use tools when needed.' },
          { role: 'user', content: 'Check the weather.' },
          { role: 'assistant', content: '', tool_calls: toolCalls },
          { role: 'tool', content: '{"temp":"72F"}', tool_call_id: 'call_1' },
        ],
        tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
        tool_choice: 'auto',
      }),
    );

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://api.mulerouter.ai/vendors/openai/v1/chat/completions',
    );
    expect(lastRequestBody().messages).toEqual([
      { role: 'system', content: 'Use tools when needed.' },
      { role: 'user', content: 'Check the weather.' },
      { role: 'assistant', content: '', tool_calls: toolCalls },
      { role: 'tool', content: '{"temp":"72F"}', tool_call_id: 'call_1' },
    ]);
    expect(response.tool_calls).toEqual(toolCalls);
  });

  it('does not fake native DashScope streaming on the non-compatible base URL', async () => {
    const provider = new QwenProvider('qwen-test-key');

    await expect(provider.streamRequest(makeRequest())).rejects.toThrow(
      /OpenAI-compatible Qwen base URL/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
