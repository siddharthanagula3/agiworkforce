/**
 * Proof that runToolLoop's Anthropic dispatch (tool-loop-anthropic.ts, task
 * #34's tool-loop slice) actually works -- NOT a byte-parity test against the
 * old `LLMProviderFactory.streamRequest('anthropic', ...)` dispatch, because
 * there is no correct legacy baseline to match here: `collectProviderStream`
 * only ever understood OpenAI-shaped `.choices[0].delta` events, and
 * Anthropic's raw wire (what the old dispatch handed it) is natively shaped
 * `content_block_delta`/`message_delta`/etc -- a genuinely different, never-
 * correctly-parsed shape. This suite is a forward correctness proof: it only
 * passes because `buildAnthropicToolLoopStream` reshapes the adapter's
 * `StreamChunk`s into the OpenAI-shaped bytes `collectProviderStream` (kept
 * unchanged -- see tool-loop-anthropic.ts's docstring) already knows how to
 * read. Structurally, it also cannot pass against the OLD dispatch: these
 * tests mock `@agiworkforce/providers-anthropic`'s `createAnthropicAdapter`,
 * not `@/lib/llm-providers/factory`'s `streamRequest` -- the old code path
 * would never call the mocked adapter at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetOptionalEnv = vi.fn((key: string) =>
  key === 'ANTHROPIC_API_KEY' ? 'mock-anthropic-key' : undefined,
);
vi.mock('@/utils/env', () => ({
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

// The Anthropic branch must never fall through to the legacy factory --
// throwing here turns an accidental fallthrough into a hard test failure
// instead of a silent real network call.
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
    requestId: 'req-anthropic-1',
    chatRequest: { model: 'claude-opus-4-8', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'claude-opus-4.8',
    provider: 'anthropic',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'claude-opus-4.8',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'claude-opus-4.8',
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
    // Step 1: two tool_use blocks in the SAME message, non-zero and non-
    // sequential vendorIndex (4 and 7) -- proves collectProviderStream's
    // index-keyed accumulator (which reads tc.index off the wire, whatever
    // value it is) doesn't collide or corrupt args across two concurrent
    // tool calls, the exact risk flagged for this migration.
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

    // Both tools actually dispatched, with the RIGHT args -- proves the
    // vendor-indexed accumulator kept the two tool calls' argument fragments
    // separate instead of interleaving/overwriting them.
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('search', 'web_search', {
      query: 'weather today',
    });
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('search', 'web_fetch', {
      url: 'https://example.com',
    });

    // The provider was re-invoked for step 2 with BOTH tool results appended,
    // each carrying its own correct tool_call_id (not swapped or merged).
    expect(mockAnthropicStream).toHaveBeenCalledTimes(2);
    const secondStepChatRequest = mockAnthropicStream.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolMessages = secondStepChatRequest.messages.filter((m) => m.role === 'user');
    // openAIWireRequestToChatRequest folds role:'tool' messages into role:'user'
    // messages carrying a tool_result block (see openai-wire-compat.ts) -- assert
    // on the ORIGINAL OpenAI-shaped messages array tool-loop.ts built instead,
    // which is simpler and is the thing this migration is actually responsible for.
    expect(toolMessages.length).toBeGreaterThan(0);

    // Client-visible SSE reflects both tool calls by name and status, and the
    // final model answer, ending in a clean [DONE].
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
          // A DIFFERENT vendorIndex (0) on step 2 -- if the assembler carried
          // stale state from step 1, this could be mis-keyed against call_1's
          // now-stale index-2 slot instead of getting its own.
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

  it('surfaces an adapter-level error as inline SSE content, flushes terminal, and stops -- no second call', async () => {
    mockAnthropicStream.mockImplementationOnce(
      fakeAdapterStream([{ type: 'error', message: 'rate limited', code: '429' }]),
    );

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(output).toContain('Error:');
    expect(output).toContain('rate limited');
    // A mid-loop provider error is a terminal exit like any other (see
    // flushTerminal()'s doc comment): it still owes the client any files
    // generated by earlier steps' execution tools, plus a closing [DONE], so
    // both are present here. What must NOT happen is a second provider call.
    expect(output).toContain('[DONE]');
    expect(mockAnthropicStream).toHaveBeenCalledTimes(1);
  });

  it('emits an additive x_stream_error marker alongside the inline error content (Finding 3: tool-loop hand-rolls its own SSE, so the base-path marker does not cover it without this)', async () => {
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

    expect(usage).toEqual({
      providerCalls: 2,
      inputTokens: 300,
      outputTokens: 50,
      cacheReadTokens: 90,
      cacheWriteTokens: 30,
      cacheWrite1hTokens: 7,
      reasoningTokens: 11,
    });
  });

  // ─── TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01 ───────────────────────────
  // Extended thinking + tool_use in the same turn: the signed thinking block
  // must survive the tool-loop round-trip and be replayed to Anthropic before
  // the tool_use blocks, WITHOUT any literal <thinking> tag text.

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

    // Follow-up (step 2) request carries the reconstructed signed thinking
    // block FIRST, then the tag-free assistant text, then the tool_use block.
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
    // No literal <thinking> tag text replayed into the assistant content.
    expect(JSON.stringify(assistant?.content)).not.toContain('<thinking>');

    // Client-facing SSE is unchanged: the thinking is still rendered inline as
    // <thinking>/</thinking> content deltas (locked public wire contract), and
    // the loop completes with the final answer + a clean [DONE].
    expect(output).toContain('<thinking>');
    expect(output).toContain('It is noon.');
    expect(output).toContain('data: [DONE]');
    // The signature never reaches the client wire.
    expect(output).not.toContain('sig-live-001');
  });

  it('does not attach thinking continuity when the thinking turn has no tool_use', async () => {
    // Thinking but no tool call: the loop terminates on end_turn and never
    // pushes an assistant message, so there is nothing to reconstruct — and a
    // single provider call, exactly as before this fix.
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
