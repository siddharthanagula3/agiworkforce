import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
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

const mockResolveSearchBudget = vi.fn();
const mockReserveSearchCharge = vi.fn();
vi.mock('@/lib/web-search/search-budget', async () => {
  const actual = await vi.importActual<typeof import('@/lib/web-search/search-budget')>(
    '@/lib/web-search/search-budget',
  );
  return {
    ...actual,
    resolveSearchBudget: (...args: unknown[]) => mockResolveSearchBudget(...args),
    reserveSearchCharge: (...args: unknown[]) => mockReserveSearchCharge(...args),
  };
});

import { runToolLoop, type ToolLoopApprovalCheckpoint } from './tool-loop';
import { REQUIRED_SEARCH_RETRY_DIRECTIVE } from '@/lib/web-search/required-search';
import { WEB_SEARCH_TOOL, webSearchToolDef } from '@/lib/web-search/web-search-tool';
import type { ProcessedRequest } from './request-processor';
import { getModels } from '@agiworkforce/types';

const freeRouterModel = getModels().find(
  (model) => model.webSearchToolOfferPolicy === 'required_only',
);
if (!freeRouterModel) throw new Error('The required-only search route is missing from the catalog');

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
  requestedModel?: string;
  searchRequired?: boolean;
}): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-search',
    chatRequest: {
      model: 'gpt-test',
      messages: [
        { role: 'user', content: 'Private earlier context must not become a search query.' },
        { role: 'user', content: "today's top headline" },
      ],
      stream: true,
      web_search: true,
    } as never,
    conversationId: undefined,
    requestedModel: overrides.requestedModel ?? 'gpt-test',
    provider: overrides.provider ?? 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    searchRequirement: {
      required: overrides.searchRequired ?? true,
      source: 'explicit_intent' as const,
    },
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
    mockResolveSearchBudget.mockReset();
    mockResolveSearchBudget.mockResolvedValue({ outcome: 'included' });
    mockReserveSearchCharge.mockReset();
    mockGetE2BExecutor.mockResolvedValue(null);
    mockExecuteWebSearch.mockResolvedValue({
      ok: true,
      query: "today's top headline",
      results: [{ url: 'https://example.com', title: 'Example', snippet: 'x' }],
      providerId: 'perplexity',
      retrievedAt: '2026-09-22T00:00:00.000Z',
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
    expect(requests[0]?.['tool_choice']).toEqual(SEARCH_TOOL_CHOICE);
    expect(requests[1]?.['tool_choice']).toBe('auto');
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

    const retryMessages = stepRequests()[1]?.['messages'] as Array<{ content: string }>;
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

  it('runs the server search when Free Auto emits pseudo tool text instead of a call', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      memoryAnswerStep('<tool_call>web_search query=example</tool_call>'),
    );
    mockBuildToolLoopStream.mockResolvedValueOnce(
      memoryAnswerStep('According to [1], here is the answer.'),
    );

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).not.toContain('<tool_call>');
    expect(output).toContain('According to [1]');
    expect(output).toContain('x_search_results');
    expect(output).not.toContain('web_search_not_performed');
    expect(mockExecuteWebSearch).toHaveBeenCalledWith(
      { query: "today's top headline" },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(JSON.stringify(mockExecuteWebSearch.mock.calls)).not.toContain(
      'Private earlier context',
    );
    const followUpMessages = stepRequests()[1]?.['messages'] as Array<Record<string, unknown>>;
    expect(followUpMessages.slice(-2).map((message) => message['role'])).toEqual([
      'assistant',
      'tool',
    ]);
  });

  it('retries a transient Free continuation after search without searching twice', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'))
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({ x_stream_error: { message: 'Upstream overloaded', code: '503' } }, 'error'),
        ]),
      )
      .mockResolvedValueOnce(memoryAnswerStep('Answer from [1].'));
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });
    processed.freeTrial = {} as NonNullable<ProcessedRequest['freeTrial']>;

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(3);
    expect(mockExecuteWebSearch).toHaveBeenCalledTimes(1);
    expect(output).toContain('Answer from [1].');
    expect(output).not.toContain('x_stream_error');
    expect(stepRequests()[1]?.['messages']).toEqual(stepRequests()[2]?.['messages']);
  });

  it('does not immediately retry a Free continuation when the provider requests a wait', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'))
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk(
            {
              x_stream_error: {
                message: 'Upstream overloaded',
                code: '503',
                retryAfterSeconds: 60,
              },
            },
            'error',
          ),
        ]),
      );
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });
    processed.freeTrial = {} as NonNullable<ProcessedRequest['freeTrial']>;

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockExecuteWebSearch).toHaveBeenCalledTimes(1);
    expect(output).toContain('x_stream_error');
  });

  it('stops after one transient Free continuation retry', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'))
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({ x_stream_error: { message: 'Upstream overloaded', code: '503' } }, 'error'),
        ]),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({ x_stream_error: { message: 'Still overloaded', code: '503' } }, 'error'),
        ]),
      );
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });
    processed.freeTrial = {} as NonNullable<ProcessedRequest['freeTrial']>;

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(3);
    expect(mockExecuteWebSearch).toHaveBeenCalledTimes(1);
    expect(output).toContain('x_stream_error');
    expect(output).not.toContain('Still overloaded');
  });

  it('does not replay a Free continuation after answer text has reached the user', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'))
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({ content: 'Partial answer from search.' }),
          chunk({ x_stream_error: { message: 'Upstream overloaded', code: '503' } }, 'error'),
        ]),
      );
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });
    processed.freeTrial = {} as NonNullable<ProcessedRequest['freeTrial']>;

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(mockExecuteWebSearch).toHaveBeenCalledTimes(1);
    expect(output).toContain('Partial answer from search.');
    expect(output).toContain('x_stream_error');
    expect(output).not.toContain('Upstream overloaded');
  });

  it('pauses a server-owned search for approval when the account asks every time', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    const onApprovalCheckpoint = vi.fn(async () => undefined);

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
        }),
        {
          approvalMode: 'manual',
          toolApprovalPolicy: 'ask_every_time',
          userId: 'user-1',
          onApprovalCheckpoint,
        },
      ),
    );

    expect(output).not.toContain('Unsourced answer.');
    expect(output).toContain('x_tool_approval_request');
    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(onApprovalCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingToolCalls: [
          expect.objectContaining({
            qualifiedName: WEB_SEARCH_TOOL,
            args: { query: "today's top headline" },
          }),
        ],
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
        ]),
      }),
    );
  });

  it('resumes an approved server-owned search before asking the model to answer', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    let checkpoint: ToolLoopApprovalCheckpoint | undefined;
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        userId: 'user-1',
        onApprovalCheckpoint: async (value) => {
          checkpoint = value;
        },
      }),
    );

    expect(checkpoint).toBeDefined();
    const pending = checkpoint!.pendingToolCalls[0]!;
    processed.llmRequest.messages = checkpoint!.messages;
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Answer from [1].'));

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        userId: 'user-1',
        resume: { approvals: [{ toolCallId: pending.id, decision: 'approved' }] },
        eventSessionId: checkpoint!.sessionId,
        eventTurnId: checkpoint!.turnId,
        initialCompletedSteps: checkpoint!.completedSteps,
        initialEventSequence: checkpoint!.nextEventSequence,
      }),
    );

    expect(mockExecuteWebSearch).toHaveBeenCalledTimes(1);
    expect(output).toContain('x_search_results');
    expect(output).toContain('Answer from [1].');
    const continuation = stepRequests()[1]?.['messages'] as Array<Record<string, unknown>>;
    expect(continuation.slice(-2).map((message) => message['role'])).toEqual(['assistant', 'tool']);
  });

  it('does not continue with an unsourced answer after server-owned search is denied', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    let checkpoint: ToolLoopApprovalCheckpoint | undefined;
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        userId: 'user-1',
        onApprovalCheckpoint: async (value) => {
          checkpoint = value;
        },
      }),
    );

    expect(checkpoint).toBeDefined();
    processed.llmRequest.messages = checkpoint!.messages;
    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        userId: 'user-1',
        resume: {
          approvals: [{ toolCallId: checkpoint!.pendingToolCalls[0]!.id, decision: 'rejected' }],
        },
        eventSessionId: checkpoint!.sessionId,
        eventTurnId: checkpoint!.turnId,
        initialCompletedSteps: checkpoint!.completedSteps,
      }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(output).not.toContain('Unsourced answer.');
    expect(output).toContain('web_search_not_performed');
  });

  it('does not ask for a second search after a model-requested search is denied', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(searchToolCallStep());
    let checkpoint: ToolLoopApprovalCheckpoint | undefined;
    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        userId: 'user-1',
        onApprovalCheckpoint: async (value) => {
          checkpoint = value;
        },
      }),
    );

    expect(checkpoint?.pendingToolCalls[0]?.qualifiedName).toBe(WEB_SEARCH_TOOL);
    processed.llmRequest.messages = checkpoint!.messages;
    const onSecondApprovalCheckpoint = vi.fn(async () => undefined);
    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        toolApprovalPolicy: 'ask_every_time',
        userId: 'user-1',
        resume: {
          approvals: [{ toolCallId: checkpoint!.pendingToolCalls[0]!.id, decision: 'rejected' }],
        },
        eventSessionId: checkpoint!.sessionId,
        eventTurnId: checkpoint!.turnId,
        initialCompletedSteps: checkpoint!.completedSteps,
        onApprovalCheckpoint: onSecondApprovalCheckpoint,
      }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(onSecondApprovalCheckpoint).not.toHaveBeenCalled();
    expect(output).toContain('web_search_not_performed');
  });

  it('answers plainly when a server-owned search succeeds with no results', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    mockExecuteWebSearch.mockResolvedValueOnce({
      ok: true,
      query: "today's top headline",
      results: [],
      providerId: 'perplexity',
      retrievedAt: '2026-09-22T00:00:00.000Z',
    });

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).not.toContain('Unsourced answer.');
    expect(output).toContain('I searched the web, but found no results for that query.');
    expect(output).not.toContain('x_stream_error');
    expect(output).not.toContain('source-list');
  });

  it('answers plainly when a model-called required search succeeds with no results', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(searchToolCallStep());
    mockExecuteWebSearch.mockResolvedValueOnce({
      ok: true,
      query: 'headline',
      results: [],
      providerId: 'perplexity',
      retrievedAt: '2026-09-22T00:00:00.000Z',
    });

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('I searched the web, but found no results for that query.');
    expect(output).not.toContain('x_stream_error');
    expect(output).not.toContain('source-list');
  });

  it('marks an account-bound search refusal unavailable without invoking the provider', async () => {
    mockResolveSearchBudget.mockResolvedValue({ outcome: 'blocked', reason: 'plan_bound' });
    mockBuildToolLoopStream.mockResolvedValueOnce(searchToolCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(
      memoryAnswerStep('I could not search because the account reached its included search limit.'),
    );

    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
    });
    processed.subscriptionTier = 'free';
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(output).toContain('20 included searches in the last 30 days');
    expect(output).toContain('"name":"web_search","status":"failed"');
    expect(output).toContain('"isError":true');
    expect(output).toContain(
      'I could not search because the account reached its included search limit.',
    );
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
  });

  it('marks a refused search charge unavailable without charging or invoking search', async () => {
    mockResolveSearchBudget.mockResolvedValue({
      outcome: 'charge',
      feature: 'web_search_perplexity',
      chargeMicrousd: 10_000,
      chargeCents: 1,
    });
    mockReserveSearchCharge.mockResolvedValue({ outcome: 'refused' });
    mockBuildToolLoopStream.mockResolvedValueOnce(searchToolCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(
      memoryAnswerStep('I could not search because the account has no credits for this call.'),
    );

    const output = await drain(
      runToolLoop(
        makeProcessed({ enforcement: { mode: 'nudge', attachedTool: 'generic-function' } }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockReserveSearchCharge).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(output).toContain('account has no credits left');
    expect(output).toContain('"name":"web_search","status":"failed"');
    expect(output).toContain('"isError":true');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a server-owned search fails before producing sources', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    mockExecuteWebSearch.mockResolvedValueOnce({
      ok: false,
      errorCode: 'upstream_error',
      error: 'Temporary provider failure',
      retryable: true,
    });

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).not.toContain('Unsourced answer.');
    expect(output).toContain('web_search_no_sources');
  });

  it('reports a server-owned search allowance refusal as unavailable, not empty sources', async () => {
    mockResolveSearchBudget.mockResolvedValue({ outcome: 'blocked', reason: 'plan_bound' });
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));

    const processed = makeProcessed({
      enforcement: { mode: 'nudge', attachedTool: 'generic-function' },
      provider: freeRouterModel.provider,
      requestedModel: freeRouterModel.id,
    });
    processed.subscriptionTier = 'free';
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-1' }));

    expect(mockExecuteWebSearch).not.toHaveBeenCalled();
    expect(output).toContain('20 included searches in the last 30 days');
    expect(output).toContain('web_search_not_performed');
    expect(output).not.toContain('web_search_no_sources');
    expect(output).not.toContain('Unsourced answer.');
  });

  it('runs server-owned search if Free Web ignores a forced search choice', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Unsourced answer.'));
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Answer from [1].'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: {
            mode: 'tool-choice',
            toolChoice: SEARCH_TOOL_CHOICE as never,
            attachedTool: 'generic-function',
          },
          toolChoice: SEARCH_TOOL_CHOICE,
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).not.toContain('Unsourced answer.');
    expect(output).toContain('Answer from [1].');
    expect(stepRequests()[1]?.['tool_choice']).toBe('auto');
  });

  it('keeps ordinary Free Web answers streaming without a search requirement', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(memoryAnswerStep('Ordinary answer.'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          enforcement: { mode: 'none', attachedTool: null },
          provider: freeRouterModel.provider,
          requestedModel: freeRouterModel.id,
          searchRequired: false,
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('Ordinary answer.');
    expect(output).not.toContain('web_search_not_performed');
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
