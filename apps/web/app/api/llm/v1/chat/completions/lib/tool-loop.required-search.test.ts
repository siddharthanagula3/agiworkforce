import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

const mockExecuteWebSearch = vi.fn();
vi.mock('@/lib/web-search/web-search-tool', async () => {
  const actual = await vi.importActual<typeof import('@/lib/web-search/web-search-tool')>(
    '@/lib/web-search/web-search-tool',
  );
  return {
    ...actual,
    executeWebSearch: (...args: unknown[]) => mockExecuteWebSearch(...args),
    enrichWebSearchResultTitles: async (sources: unknown) => sources,
  };
});

import { runToolLoop } from './tool-loop';
import { REQUIRED_SEARCH_RETRY_DIRECTIVE } from '@/lib/web-search/required-search';
import { WEB_SEARCH_TOOL, webSearchToolDef } from '@/lib/web-search/web-search-tool';
import type { ProcessedRequest } from './request-processor';

const SEARCH_TOOL_CHOICE = { type: 'function', function: { name: WEB_SEARCH_TOOL } };

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function memoryAnswerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

function groundedAnswerStep(text: string): ReadableStream {
  return sseStreamFrom([
    chunk({ x_search_results: { content: [{ url: 'https://example.com', title: 'Example' }] } }),
    chunk({ content: text }),
    chunk({}, 'stop'),
  ]);
}

function searchToolCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [{ index: 0, id: 'call_1', function: { name: WEB_SEARCH_TOOL, arguments: '' } }],
    }),
    chunk({
      tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ query: 'headline' }) } }],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(overrides: {
  enforcement: ProcessedRequest['searchEnforcement'];
  toolChoice?: unknown;
  provider?: string;
}): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-search',
    chatRequest: { model: 'gpt-test', messages: [], stream: true, web_search: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: overrides.provider ?? 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    searchRequirement: { required: true, source: 'toggle' as const },
    searchEnforcement: overrides.enforcement,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: "today's top headline" }],
      max_tokens: 1000,
      stream: true,
      tools: [webSearchToolDef()],
      ...(overrides.toolChoice !== undefined ? { tool_choice: overrides.toolChoice } : {}),
    },
  } as unknown as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function stepRequests(): Array<Record<string, unknown>> {
  return mockBuildToolLoopStream.mock.calls.map((call) => call[2] as Record<string, unknown>);
}

describe('runToolLoop, required web search', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebSearch.mockReset();
    mockGetE2BExecutor.mockResolvedValue(null);
    mockExecuteWebSearch.mockResolvedValue({
      ok: true,
      results: [{ url: 'https://example.com', title: 'Example', snippet: 'x' }],
      elapsedMs: 1,
    });
  });

  it('releases the forced search choice once the search step is done', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(searchToolCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Here is the headline.'));

    await drain(
      runToolLoop(
        makeProcessed({
          enforcement: {
            mode: 'tool-choice',
            toolChoice: SEARCH_TOOL_CHOICE as never,
            attachedTool: 'generic-function',
          },
          toolChoice: SEARCH_TOOL_CHOICE,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    const requests = stepRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tool_choice).toEqual(SEARCH_TOOL_CHOICE);
    expect(requests[1]?.tool_choice).toBe('auto');
  });

  it('discards a memory answer and asks once more when search can only be requested', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('From what I recall, ...'));
    mockBuildToolLoopStream.mockResolvedValueOnce(groundedAnswerStep('Per Reuters, ...'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'google-builtin' },
          provider: 'google',
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).not.toContain('From what I recall');
    expect(output).toContain('Per Reuters');

    const retryMessages = stepRequests()[1]?.messages as Array<{ content: string }>;
    expect(retryMessages.at(-1)?.content).toBe(REQUIRED_SEARCH_RETRY_DIRECTIVE);
  });

  it('streams a grounded answer without a retry', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(groundedAnswerStep('Per Reuters, ...'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'google-builtin' },
          provider: 'google',
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('Per Reuters');
  });

  it('retries at most once, then delivers the second answer as it stands', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('First from memory.'));
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Second from memory.'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'anthropic-server' },
          provider: 'anthropic',
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).not.toContain('First from memory');
    expect(output).toContain('Second from memory');
  });

  it('leaves a turn that requires no search streaming from the first byte', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('An ordinary answer.'));

    const output = await drain(
      runToolLoop(makeProcessed({ enforcement: { mode: 'none', attachedTool: null } }), {
        approvalMode: 'auto',
        userId: 'user-1',
      }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('An ordinary answer');
  });
});
