import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetOptionalEnv = vi.fn((key: string) =>
  key === 'ANTHROPIC_API_KEY' ? 'mock-anthropic-key' : undefined,
);
vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: (...args: [string]) => mockGetOptionalEnv(...args),
}));

const mockAnthropicStream = vi.fn();
vi.mock('@agiworkforce/providers-anthropic', () => ({
  createAnthropicAdapter: vi.fn(() => ({
    id: 'anthropic',
    label: 'Anthropic',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    stream: (...args: unknown[]) => mockAnthropicStream(...args),
  })),
}));

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    streamRequest: vi.fn(() => {
      throw new Error('unexpected: legacy LLMProviderFactory.streamRequest called for anthropic');
    }),
  },
}));

const mockExecuteWebMcpTool = vi.fn();
vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
  };
});

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

import { runToolLoop } from './tool-loop';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

const ANTHROPIC_MODEL = requireProviderDefaultModel('anthropic');

function fakeAdapterStream(chunks: unknown[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk;
  };
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-anthropic-1',
    chatRequest: { model: ANTHROPIC_MODEL, messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: ANTHROPIC_MODEL,
    provider: 'anthropic',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: ANTHROPIC_MODEL,
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: ANTHROPIC_MODEL,
      messages: [{ role: 'user', content: 'search the web and fetch a page' }],
      max_tokens: 1000,
      stream: true,
    },
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) {
    out += decoder.decode(value);
  }
  return out;
}

describe('runToolLoop Anthropic dispatch (mocked adapter)', () => {
  beforeEach(() => {
    mockAnthropicStream.mockReset();
    mockExecuteWebMcpTool.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
  });

  it('extracts and executes two vendor-indexed tool calls from a single Anthropic step', async () => {
    mockAnthropicStream
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__search__web_search',
            vendorIndex: 4,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{"query":' },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '"weather today"}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          {
            type: 'tool-use-start',
            toolUseId: 'call_2',
            name: 'mcp__search__web_fetch',
            vendorIndex: 7,
          },
          {
            type: 'tool-use-delta',
            toolUseId: 'call_2',
            deltaJson: '{"url":"https://example.com"}',
          },
          { type: 'tool-use-end', toolUseId: 'call_2' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      // Step 2: after both tool results are fed back, the model answers.
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'text-delta', delta: "Here's what I found." },
          { type: 'stop', reason: 'end_turn' },
        ]),
      );

    mockExecuteWebMcpTool.mockImplementation((serverId: string, toolName: string) => {
      if (toolName === 'web_search') {
        return Promise.resolve({ content: [{ type: 'text', text: 'sunny, 72F' }] });
      }
      if (toolName === 'web_fetch') {
        return Promise.resolve({ content: [{ type: 'text', text: '<html>page body</html>' }] });
      }
      throw new Error(`unexpected tool ${serverId}/${toolName}`);
    });

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('search', 'web_search', {
      query: 'weather today',
    });
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('search', 'web_fetch', {
      url: 'https://example.com',
    });

    expect(mockAnthropicStream).toHaveBeenCalledTimes(2);
    const secondStepChatRequest = mockAnthropicStream.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolMessages = secondStepChatRequest.messages.filter((m) => m.role === 'user');
    expect(toolMessages.length).toBeGreaterThan(0);

    expect(output).toContain('"name":"mcp__search__web_search"');
    expect(output).toContain('"name":"mcp__search__web_fetch"');
    expect(output).toContain('"status":"completed"');
    expect(output).toContain("Here's what I found.");
    expect(output).toContain('data: [DONE]');
  });

  it('keeps a fresh per-step assembler: step 2 tool call gets its own index, unaffected by step 1', async () => {
    mockAnthropicStream
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__fs__list_directory',
            vendorIndex: 2,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{"path":"/"}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_2',
            name: 'mcp__fs__read_file',
            vendorIndex: 0,
          },
          { type: 'tool-use-delta', toolUseId: 'call_2', deltaJson: '{"path":"/README.md"}' },
          { type: 'tool-use-end', toolUseId: 'call_2' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'text-delta', delta: 'Done.' },
          { type: 'stop', reason: 'end_turn' },
        ]),
      );

    mockExecuteWebMcpTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'list_directory', { path: '/' });
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'read_file', { path: '/README.md' });
    expect(mockAnthropicStream).toHaveBeenCalledTimes(3);
    expect(output).toContain('Done.');
    expect(output).toContain('data: [DONE]');
  });

  it('surfaces an adapter-level error on structured SSE channels, flushes terminal, and stops -- no second call', async () => {
    mockAnthropicStream.mockImplementationOnce(
      fakeAdapterStream([{ type: 'error', message: 'rate limited', code: '429' }]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(output).not.toContain('"content":"\\n\\nError:');
    expect(output).toContain('"type":"error"');
    expect(output).toContain('rate limited');
    expect(output).toContain('[DONE]');
    expect(mockAnthropicStream).toHaveBeenCalledTimes(1);
  });

  it('emits an x_stream_error marker alongside the canonical error event (Finding 3: tool-loop hand-rolls its own SSE, so the base-path marker does not cover it without this)', async () => {
    mockAnthropicStream.mockImplementationOnce(
      fakeAdapterStream([{ type: 'error', message: 'rate limited', code: '429' }]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    const errorMarkerLine = output.split('\n').find((line) => line.includes('x_stream_error'));
    expect(errorMarkerLine).toBeDefined();
    const parsed = JSON.parse(errorMarkerLine!.replace(/^data: /, ''));
    expect(parsed.choices[0].delta.x_stream_error).toMatchObject({
      message: expect.stringContaining('rate limited'),
    });
  });

  it('never touches E2B for an Anthropic turn with no tool calls', async () => {
    mockAnthropicStream.mockImplementationOnce(
      fakeAdapterStream([
        { type: 'text-delta', delta: 'Hi there.' },
        { type: 'stop', reason: 'end_turn' },
      ]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(output).toContain('Hi there.');
    expect(output).toContain('data: [DONE]');
  });

  it('aggregates canonical usage across every provider step, including cache dimensions', async () => {
    mockAnthropicStream
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__clock__get_time',
            vendorIndex: 1,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          {
            type: 'usage',
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 40,
            cacheWriteTokens: 10,
            cacheWrite1hTokens: 3,
            reasoningTokens: 5,
          },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'text-delta', delta: 'It is noon.' },
          {
            type: 'usage',
            inputTokens: 200,
            outputTokens: 30,
            cacheReadTokens: 50,
            cacheWriteTokens: 20,
            cacheWrite1hTokens: 4,
            reasoningTokens: 6,
          },
          { type: 'stop', reason: 'end_turn' },
        ]),
      );
    mockExecuteWebMcpTool.mockResolvedValue({ content: [{ type: 'text', text: '12:00' }] });

    const usage = createObservedProviderUsage();
    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto', usage }));

    expect(usage).toMatchObject({
      providerCalls: 2,
      inputTokens: 300,
      outputTokens: 50,
      cacheReadTokens: 90,
      cacheWriteTokens: 30,
      cacheWrite1hTokens: 7,
      reasoningTokens: 11,
    });
    expect(usage.providerCallObservations).toHaveLength(2);
    expect(usage.providerCallObservations?.map((call) => call.inputTokens)).toEqual([100, 200]);
    expect(usage.providerCallObservations?.every((call) => call.costDollars !== undefined)).toBe(
      true,
    );
  });

  it('replays the signed thinking block before tool_use on the follow-up request, with tag-free text', async () => {
    mockAnthropicStream
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'thinking-delta', delta: 'I should ' },
          { type: 'thinking-delta', delta: 'call get_time.' },
          { type: 'thinking-delta', delta: '', signature: 'sig-live-001' },
          { type: 'text-delta', delta: 'Let me check.' },
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__clock__get_time',
            vendorIndex: 1,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'text-delta', delta: 'It is noon.' },
          { type: 'stop', reason: 'end_turn' },
        ]),
      );

    mockExecuteWebMcpTool.mockResolvedValue({ content: [{ type: 'text', text: '12:00' }] });

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockAnthropicStream).toHaveBeenCalledTimes(2);
    const step2 = mockAnthropicStream.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const assistant = step2.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toEqual([
      { type: 'thinking', thinking: 'I should call get_time.', signature: 'sig-live-001' },
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 'call_1', name: 'mcp__clock__get_time', input: {} },
    ]);
    expect(JSON.stringify(assistant?.content)).not.toContain('<thinking>');

    expect(output).toContain('<thinking>');
    expect(output).toContain('It is noon.');
    expect(output).toContain('data: [DONE]');
    expect(output).not.toContain('sig-live-001');
  });

  it('does not attach thinking continuity when the thinking turn has no tool_use', async () => {
    mockAnthropicStream.mockImplementationOnce(
      fakeAdapterStream([
        { type: 'thinking-delta', delta: 'pondering' },
        { type: 'thinking-delta', delta: '', signature: 'sig-x' },
        { type: 'text-delta', delta: 'Final answer.' },
        { type: 'stop', reason: 'end_turn' },
      ]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockAnthropicStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('Final answer.');
    expect(output).toContain('data: [DONE]');
  });
});
