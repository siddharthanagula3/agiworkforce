import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-empty-response-1',
    chatRequest: { model: 'gemini-test', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'auto',
    provider: 'google',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'auto',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'summarise the repository' }],
      max_tokens: 1000,
      stream: true,
    } as never,
    ...overrides,
  } as ProcessedRequest;
}

function sseStream(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function cleanEmptyStream(): ReadableStream<Uint8Array> {
  return sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }]);
}

function blockedStream(): ReadableStream<Uint8Array> {
  return sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }] }]);
}

function answeredStream(text: string): ReadableStream<Uint8Array> {
  return sseStream([{ choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }] }]);
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of generator) out += decoder.decode(value);
  return out;
}

function streamErrorFrom(output: string): { message: string; code?: string; retryable?: boolean } {
  const line = output.split('\n').find((entry) => entry.includes('x_stream_error'));
  expect(line).toBeDefined();
  return JSON.parse(line!.replace(/^data: /, '')).choices[0].delta.x_stream_error;
}

describe('runToolLoop, a clean but empty provider step', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
  });

  it('classifies a content-empty clean stop as empty_response, without a failover plan', async () => {
    mockBuildToolLoopStream.mockResolvedValue(cleanEmptyStream());

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const streamError = streamErrorFrom(output);

    expect(streamError.code).toBe('empty_response');
    expect(output).toContain('"reason":"error"');
  });

  it('classifies a content-filter stop with no content as content_blocked', async () => {
    mockBuildToolLoopStream.mockResolvedValue(blockedStream());

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const streamError = streamErrorFrom(output);

    expect(streamError.code).toBe('content_blocked');
    expect(output).toContain('"reason":"refusal"');
  });

  it('rotates an auto-routed request once when the first route answers with nothing', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(cleanEmptyStream())
      .mockResolvedValueOnce(answeredStream('Answered on the second route.'));

    const processed = makeProcessed();
    const rotated = {
      ...processed,
      provider: 'openai',
      llmRequest: { ...processed.llmRequest, model: 'gpt-fallback' },
    } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openai', processed: rotated }));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error), { step: 1 });
    expect(output).toContain('Answered on the second route.');
    expect(output).not.toContain('x_stream_error');
  });

  it('never rotates a content-blocked finish, even with a failover plan configured', async () => {
    mockBuildToolLoopStream.mockResolvedValue(blockedStream());
    const next = vi.fn(() => ({ provider: 'openai', processed: makeProcessed() }));

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(streamErrorFrom(output).code).toBe('content_blocked');
  });

  it('never rotates an exact model pin, even when it answers with nothing', async () => {
    mockBuildToolLoopStream.mockResolvedValue(cleanEmptyStream());
    const next = vi.fn(() => ({ provider: 'openai', processed: makeProcessed() }));

    const output = await drain(
      runToolLoop(makeProcessed({ requestedModel: 'gemini-test' }), {
        approvalMode: 'auto',
        failover: { next },
      }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(streamErrorFrom(output).code).toBe('empty_response');
  });

  it('rotates at most once per turn, even when the second route is also empty', async () => {
    mockBuildToolLoopStream.mockImplementation(async () => cleanEmptyStream());

    const processed = makeProcessed();
    const rotated = {
      ...processed,
      provider: 'openai',
      llmRequest: { ...processed.llmRequest, model: 'gpt-fallback' },
    } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openai', processed: rotated }));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(streamErrorFrom(output).code).toBe('empty_response');
  });
});
