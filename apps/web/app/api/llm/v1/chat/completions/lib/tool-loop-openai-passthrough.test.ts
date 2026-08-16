import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetOptionalEnv = vi.fn((key: string) =>
  key === 'OPENAI_API_KEY' ? 'mock-openai-key' : undefined,
);
vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: (...args: [string]) => mockGetOptionalEnv(...args),
}));

const mockOpenAIStream = vi.fn();
vi.mock('@agiworkforce/providers-openai', () => ({
  createOpenAIAdapter: vi.fn(() => ({
    id: 'openai',
    label: 'OpenAI',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    stream: (...args: unknown[]) => mockOpenAIStream(...args),
  })),
}));

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    streamRequest: vi.fn(() => {
      throw new Error('unexpected: legacy LLMProviderFactory.streamRequest called for openai');
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
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

const OPENAI_MODEL = requireProviderDefaultModel('openai');

function fakeAdapterStream(chunks: unknown[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk;
  };
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-openai-1',
    chatRequest: { model: OPENAI_MODEL, messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: OPENAI_MODEL,
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: OPENAI_MODEL,
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: 'list the files in this repo' }],
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

describe('runToolLoop openai-passthrough dispatch (mocked adapter)', () => {
  beforeEach(() => {
    mockOpenAIStream.mockReset();
    mockExecuteWebMcpTool.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
  });

  it('round-trips finish_reason:tool_calls through OpenAIWireAssembler and actually fires the tool', async () => {
    mockOpenAIStream
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__fs__list_directory',
            vendorIndex: 0,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{"path":"/"}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          { type: 'text-delta', delta: 'Here are the files.' },
          { type: 'stop', reason: 'end_turn' },
        ]),
      );

    mockExecuteWebMcpTool.mockResolvedValue({
      content: [{ type: 'text', text: 'README.md\npackage.json' }],
    });

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'list_directory', { path: '/' });

    expect(mockOpenAIStream).toHaveBeenCalledTimes(2);

    expect(output).toContain('"name":"mcp__fs__list_directory"');
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('Here are the files.');
    expect(output).toContain('data: [DONE]');
  });

  it('keeps a fresh per-step assembler across two openai-passthrough steps', async () => {
    mockOpenAIStream
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_1',
            name: 'mcp__fs__read_file',
            vendorIndex: 3,
          },
          { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{"path":"/README.md"}' },
          { type: 'tool-use-end', toolUseId: 'call_1' },
          { type: 'stop', reason: 'tool_use' },
        ]),
      )
      .mockImplementationOnce(
        fakeAdapterStream([
          {
            type: 'tool-use-start',
            toolUseId: 'call_2',
            name: 'mcp__fs__list_directory',
            vendorIndex: 0,
          },
          { type: 'tool-use-delta', toolUseId: 'call_2', deltaJson: '{"path":"/src"}' },
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

    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'read_file', {
      path: '/README.md',
    });
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'list_directory', { path: '/src' });
    expect(mockOpenAIStream).toHaveBeenCalledTimes(3);
    expect(output).toContain('Done.');
    expect(output).toContain('data: [DONE]');
  });

  it('surfaces an adapter-level error on structured SSE channels, flushes terminal, and stops -- no second call', async () => {
    mockOpenAIStream.mockImplementationOnce(
      fakeAdapterStream([{ type: 'error', message: 'rate limited', code: '429' }]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(output).not.toContain('"content":"\\n\\nError:');
    expect(output).toContain('"type":"error"');
    expect(output).toContain('rate limited');
    expect(output).toContain('[DONE]');
    expect(mockOpenAIStream).toHaveBeenCalledTimes(1);
  });

  it('emits an x_stream_error marker alongside the canonical error event (Finding 3: tool-loop hand-rolls its own SSE, so the base-path marker does not cover it without this)', async () => {
    mockOpenAIStream.mockImplementationOnce(
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

  it('never touches E2B for an openai-passthrough turn with no tool calls', async () => {
    mockOpenAIStream.mockImplementationOnce(
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
});
