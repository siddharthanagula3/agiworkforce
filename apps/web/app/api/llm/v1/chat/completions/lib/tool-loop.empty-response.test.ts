import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';
import { EmptyProviderResponseError } from '@agiworkforce/provider-runtime';

const TRANSIENT_RETRY_MODEL = listCanonicalModels().find(
  (model) => model.transientSameRouteRetries === 1,
)?.id;
if (!TRANSIENT_RETRY_MODEL) {
  throw new Error('Canonical transient same-route retry fixture is missing');
}

const mockWarn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => {
  const logger = { info: vi.fn(), error: vi.fn(), warn: mockWarn, debug: vi.fn() };
  return { logger, default: logger };
});

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

function interruptedStream(delta: {
  reasoning?: string;
  content?: string;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let pulls = 0;
  return new ReadableStream({
    pull(controller) {
      if (pulls === 0) {
        pulls += 1;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`),
        );
        return;
      }
      controller.error(new Error('provider stream disconnected'));
    },
  });
}

function transientRetryProcessed(): ProcessedRequest {
  return makeProcessed({
    requestedModel: TRANSIENT_RETRY_MODEL,
    originalModel: TRANSIENT_RETRY_MODEL,
    provider: 'openrouter',
    chatRequest: { model: TRANSIENT_RETRY_MODEL, messages: [], stream: true } as never,
    llmRequest: {
      model: TRANSIENT_RETRY_MODEL,
      messages: [{ role: 'user', content: 'summarise the repository' }],
      max_tokens: 1000,
      stream: true,
    } as never,
  });
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
    mockWarn.mockReset();
  });

  it('classifies a content-empty clean stop as empty_response, without a failover plan', async () => {
    mockBuildToolLoopStream.mockResolvedValue(cleanEmptyStream());

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const streamError = streamErrorFrom(output);

    expect(streamError.code).toBe('empty_response');
    expect(output).toContain('"reason":"error"');
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'llm_empty_provider_trace',
        finishReason: 'stop',
        collectedTextChars: 0,
        publicTextChars: 0,
        providerTrace: null,
      }),
      '[tool-loop] empty provider step stream shape',
    );
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

  it('retries a configured exact route once after a clean empty stop', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(cleanEmptyStream())
      .mockResolvedValueOnce(answeredStream('Answered on the same route.'));
    const processed = transientRetryProcessed();
    const retry = { ...processed, retries: 1 } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openrouter', processed: retry }));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(expect.any(EmptyProviderResponseError), {
      step: 1,
      sameRouteRetrySafe: true,
    });
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).toContain('Answered on the same route.');
    expect(output).not.toContain('x_stream_error');
  });

  it('retries a whitespace-only Free response before releasing it to the reader', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStream([
          { choices: [{ index: 0, delta: { content: '  \n  ' }, finish_reason: 'stop' }] },
        ]),
      )
      .mockResolvedValueOnce(answeredStream('Answered on the same route.'));
    const processed = transientRetryProcessed();
    const retry = { ...processed, retries: 1 } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openrouter', processed: retry }));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledOnce();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(output).toContain('Answered on the same route.');
    expect(output).not.toContain('x_stream_error');
  });

  it('keeps leading whitespace in order once the same attempt writes an answer', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStream([
        { choices: [{ index: 0, delta: { content: '  ' } }] },
        { choices: [{ index: 0, delta: { content: 'Answered.' }, finish_reason: 'stop' }] },
      ]),
    );

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(output.indexOf('"content":"  "')).toBeGreaterThanOrEqual(0);
    expect(output.indexOf('"content":"  "')).toBeLessThan(output.indexOf('Answered.'));
    expect(output).not.toContain('x_stream_error');
  });

  it('does not retry after an oversized whitespace prelude was released', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    mockBuildToolLoopStream.mockResolvedValueOnce(answeredStream(' '.repeat(70 * 1024)));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(streamErrorFrom(output).code).toBe('empty_response');
  });

  it('retries the same route once after a clean reasoning-only stop without showing discarded reasoning', async () => {
    const processed = transientRetryProcessed();
    const retry = { ...processed, retries: 1 } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openrouter', processed: retry }));
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        answeredStream('<thinking>The answer is still being worked out.</thinking>'),
      )
      .mockResolvedValueOnce(answeredStream('Answered on the same route.'));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(expect.any(EmptyProviderResponseError), {
      step: 1,
      sameRouteRetrySafe: true,
    });
    expect(output).toContain('Answered on the same route.');
    expect(output).not.toContain('The answer is still being worked out.');
    expect(output).not.toContain('x_stream_error');
  });

  it('retries an empty output-limit stop once with a larger budget on the same Free route', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn();
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStream([
          { choices: [{ index: 0, delta: { reasoning: 'Reasoning used the first budget.' } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] },
        ]),
      )
      .mockResolvedValueOnce(answeredStream('Answered with more room.'));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    const firstRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as { max_tokens: number };
    const secondRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as { max_tokens: number };
    expect(firstRequest.max_tokens).toBe(1000);
    expect(secondRequest.max_tokens).toBe(2000);
    expect(next).not.toHaveBeenCalled();
    expect(output).toContain('Answered with more room.');
    expect(output).not.toContain('Reasoning used the first budget.');
    expect(output).not.toContain('x_stream_error');
  });

  it('can retry the observed 4096-token Free router ceiling with 8192 tokens', async () => {
    const processed = transientRetryProcessed();
    processed.llmRequest.max_tokens = 4096;
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }]),
      )
      .mockResolvedValueOnce(answeredStream('Answered after the larger budget.'));

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    const secondRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as { max_tokens: number };
    expect(secondRequest.max_tokens).toBe(8192);
    expect(output).toContain('Answered after the larger budget.');
    expect(output).not.toContain('x_stream_error');
  });

  it('stops after the one output-limit retry if the Free route still returns nothing', async () => {
    const processed = transientRetryProcessed();
    const capped = sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }]);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(capped)
      .mockResolvedValueOnce(
        sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }]),
      );

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(streamErrorFrom(output).code).toBe('max_output_tokens_exceeded');
  });

  it('retries when buffered reasoning is interrupted before any line reaches the client', async () => {
    const processed = transientRetryProcessed();
    const retry = { ...processed, retries: 1 } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'openrouter', processed: retry }));
    mockBuildToolLoopStream
      .mockResolvedValueOnce(interruptedStream({ reasoning: 'Private work' }))
      .mockResolvedValueOnce(answeredStream('Answered on the same route.'));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error), {
      step: 1,
      sameRouteRetrySafe: true,
    });
    expect(output).toContain('Answered on the same route.');
    expect(output).not.toContain('Private work');
    expect(output).not.toContain('x_stream_error');
  });

  it('does not retry an interrupted stream after answer text has reached the client', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    mockBuildToolLoopStream.mockResolvedValueOnce(
      interruptedStream({ content: 'A visible partial answer' }),
    );

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(output).toContain('A visible partial answer');
    expect(output).toContain('x_stream_error');
  });

  it('streams held reasoning in order when the same attempt produces an answer', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStream([
        { choices: [{ index: 0, delta: { content: '<thinking>Working' } }] },
        {
          choices: [
            { index: 0, delta: { content: '</thinking>Answered.' }, finish_reason: 'stop' },
          ],
        },
      ]),
    );

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(output.indexOf('Working')).toBeLessThan(output.indexOf('Answered.'));
    expect(output).not.toContain('x_stream_error');
  });

  it('does not retry a second reasoning-only stop on the exact route', async () => {
    const processed = transientRetryProcessed();
    const next = vi
      .fn()
      .mockReturnValueOnce({ provider: 'openrouter', processed: { ...processed, retries: 1 } })
      .mockReturnValue(null);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(answeredStream('<thinking>First attempt.</thinking>'))
      .mockResolvedValueOnce(answeredStream('<thinking>Second attempt.</thinking>'));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );
    expect(next).toHaveBeenCalledOnce();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(streamErrorFrom(output).code).toBe('empty_response');
    expect(output).not.toContain('First attempt.');
    expect(output).toContain('Second attempt.');
  });

  it('releases an oversized reasoning prelude instead of buffering without limit or retrying', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    const oversizedThought = 'x'.repeat(70 * 1024);
    mockBuildToolLoopStream.mockResolvedValueOnce(
      answeredStream(`<thinking>${oversizedThought}</thinking>`),
    );

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(streamErrorFrom(output).code).toBe('empty_response');
    expect(output).toContain(oversizedThought);
  });

  it('does not retry a configured exact route after a tool-call delta', async () => {
    const processed = transientRetryProcessed();
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));

    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStream([
        { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1' }] } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ]),
    );
    await drain(runToolLoop(processed, { approvalMode: 'auto', failover: { next } }));
    expect(next).not.toHaveBeenCalled();
  });

  it('respects an explicit output cap and never retries a blocked stop', async () => {
    const processed = transientRetryProcessed();
    processed.chatRequest.max_tokens = 1000;
    const next = vi.fn(() => ({ provider: 'openrouter', processed }));
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStream([{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }]),
    );

    const capped = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );
    expect(streamErrorFrom(capped).code).toBe('max_output_tokens_exceeded');
    expect(next).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);

    mockBuildToolLoopStream.mockResolvedValueOnce(blockedStream());
    await drain(runToolLoop(processed, { approvalMode: 'auto', failover: { next } }));
    expect(next).not.toHaveBeenCalled();
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
