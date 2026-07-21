/**
 * Proof that runToolLoop's dispatch for an `openai-passthrough` wireMode
 * provider (task #34's tool-loop generalization: buildToolLoopStream is now
 * table-driven off ADAPTER_PROVIDERS, covering all 12 providers, not just
 * Anthropic) actually works end-to-end through the REAL adapter ->
 * `OpenAIWireAssembler` (wireMode: 'openai-passthrough') -> collectProviderStream
 * pipeline. Uses OpenAI itself as the representative -- 8 of the 9 compat
 * providers share the exact same wireMode/translate layer (see
 * adapter-providers.ts's docstring), so this is not an OpenAI-specific
 * concern; it is the FIRST proof any openai-passthrough provider's tool
 * calls survive the tool-loop's OpenAIWireAssembler -> collectProviderStream
 * round trip, mirroring the risk tool-loop-anthropic.test.ts already closed
 * for 'legacy-web' mode.
 *
 * Mirrors tool-loop-anthropic.test.ts's structure and mocking layer exactly
 * (mock `@agiworkforce/providers-openai`'s `createOpenAIAdapter`, not
 * `buildToolLoopStream` itself) so this is a genuine forward-correctness
 * proof, not a re-test of already-mocked wiring.
 */
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

// The openai branch must never fall through to the legacy factory --
// throwing here turns an accidental fallthrough into a hard test failure
// instead of a silent real network call.
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
import type { ProcessedRequest } from './request-processor';

/** Turn an array of canonical StreamChunks into an async generator, matching
 *  `ProviderAdapter.stream()`'s signature (req, signal) => AsyncIterable. */
function fakeAdapterStream(chunks: unknown[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk;
  };
}

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-openai-1',
    chatRequest: { model: 'gpt-5.6-sol', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-5.6-sol',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-5.6-sol',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'gpt-5.6-sol',
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

    // The tool actually fired with the model's args -- proves collectProviderStream
    // read finish_reason:'tool_calls' correctly off the openai-passthrough-mode
    // wire the REAL OpenAIWireAssembler produced (not a mocked shortcut).
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('fs', 'list_directory', { path: '/' });

    // The provider was re-invoked for step 2 with the tool result appended.
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
          // A DIFFERENT vendorIndex (0) on step 2 -- if the assembler carried
          // stale state from step 1, this could be mis-keyed against call_1's
          // now-stale index-3 slot instead of getting its own.
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

  it('surfaces an adapter-level error as inline SSE content, flushes terminal, and stops -- no second call', async () => {
    mockOpenAIStream.mockImplementationOnce(
      fakeAdapterStream([{ type: 'error', message: 'rate limited', code: '429' }]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(output).toContain('Error:');
    expect(output).toContain('rate limited');
    // A mid-loop provider error is a terminal exit like any other (see
    // flushTerminal()'s doc comment in tool-loop.ts): it still owes the
    // client any files generated by earlier steps' execution tools, plus a
    // closing [DONE]. What must NOT happen is a second provider call.
    expect(output).toContain('[DONE]');
    expect(mockOpenAIStream).toHaveBeenCalledTimes(1);
  });

  it('emits an additive x_stream_error marker alongside the inline error content (Finding 3: tool-loop hand-rolls its own SSE, so the base-path marker does not cover it without this)', async () => {
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
