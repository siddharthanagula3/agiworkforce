import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tool-loop-anthropic')>()),
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/e2b/runtime')>()),
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function stream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      );
      controller.close();
    },
  });
}

function makeProcessed(): ProcessedRequest {
  const messages = [{ role: 'user', content: 'Write the summary' }];
  return {
    chatSurface: 'web' as const,
    requestId: 'fixture-incomplete-turn-request',
    chatRequest: { model: 'fixture-model', messages, stream: true },
    conversationId: undefined,
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: { model: 'fixture-model', messages, max_tokens: 512, stream: true },
  } as ProcessedRequest;
}

async function drive(events: unknown[]): Promise<string> {
  provider.stream.mockResolvedValue(stream(events));
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of runToolLoop(makeProcessed(), { approvalMode: 'auto' })) {
    output += decoder.decode(chunk);
  }
  return output;
}

function reportedFailure(output: string): { message: string; code?: string } | undefined {
  const line = output.split('\n').find((entry) => entry.includes('x_stream_error'));
  if (!line) return undefined;
  return JSON.parse(line.replace(/^data: /, '')).choices[0].delta.x_stream_error;
}

beforeEach(() => {
  provider.stream.mockReset();
});

describe('runToolLoop, why a turn came back with no answer', () => {
  it('tells a reader who hit the output limit that they hit it, not that the model said nothing', async () => {
    const output = await drive([{ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }]);

    expect(reportedFailure(output)?.code).toBe('max_output_tokens_exceeded');
  });

  it('reports a model that spent its whole budget reasoning as an output limit, not as silence', async () => {
    const output = await drive([
      { choices: [{ index: 0, delta: { reasoning_content: 'Considering the options' } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] },
    ]);

    expect(reportedFailure(output)?.code).toBe('max_output_tokens_exceeded');
  });

  it('reports a stream that ended with no terminal signal as a transport failure', async () => {
    const output = await drive([{ choices: [{ index: 0, delta: { content: '' } }] }]);

    expect(reportedFailure(output)?.code).toBe('provider_unreachable');
  });

  it('keeps the classification the adapter already made instead of re-deriving it from prose', async () => {
    const output = await drive([
      {
        choices: [
          {
            index: 0,
            delta: {
              x_stream_error: { message: 'too many requests', code: '429', retryable: true },
            },
          },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]);

    expect(reportedFailure(output)?.code).toBe('provider_rate_limited');
  });

  it('does not pass a turn whose only content was a thinking block as a finished answer', async () => {
    const output = await drive([
      {
        choices: [{ index: 0, delta: { content: '<thinking>Working it out</thinking>' } }],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]);

    expect(reportedFailure(output)?.code).toBe('empty_response');
    expect(output).toContain('"reason":"error"');
  });

  it('still reads a genuinely answered turn as finished', async () => {
    const output = await drive([
      { choices: [{ index: 0, delta: { content: 'Here is the summary.' } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]);

    expect(reportedFailure(output)).toBeUndefined();
    expect(output).toContain('"reason":"end-turn"');
  });
});

describe('runToolLoop, a turn that failed after the reader had already seen text', () => {
  it('keeps the partial answer and still reports the failure', async () => {
    const output = await drive([
      { choices: [{ index: 0, delta: { content: 'Half an ans' } }] },
      {
        choices: [
          {
            index: 0,
            delta: {
              x_stream_error: {
                message: 'The response stream ended before the model finished.',
                code: 'stream_interrupted',
                retryable: true,
              },
            },
          },
        ],
      },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
    ]);

    expect(output).toContain('Half an ans');
    expect(reportedFailure(output)).toBeDefined();
    expect(output).toContain('"reason":"error"');
    expect(output).not.toContain('"reason":"end-turn"');
  });
});

function tornStream(deliverFirst?: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let delivered = deliverFirst === undefined;
  return new ReadableStream({
    pull(controller) {
      if (!delivered) {
        delivered = true;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: deliverFirst } }] })}\n\n`,
          ),
        );
        return;
      }
      throw new Error('socket hang up');
    },
  });
}

describe('runToolLoop, recovering from an interruption', () => {
  it('retries once when the attempt failed before the reader saw anything', async () => {
    provider.stream
      .mockResolvedValueOnce(tornStream())
      .mockResolvedValueOnce(
        stream([
          { choices: [{ index: 0, delta: { content: 'Answered on the retry.' } }] },
          { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ]),
      );
    const processed = makeProcessed();
    const next = vi.fn(() => ({ provider: processed.provider, processed }));

    const decoder = new TextDecoder();
    let output = '';
    for await (const chunk of runToolLoop(processed, {
      approvalMode: 'auto',
      failover: { next },
    })) {
      output += decoder.decode(chunk);
    }

    expect(next).toHaveBeenCalledTimes(1);
    expect(output).toContain('Answered on the retry.');
    expect(reportedFailure(output)).toBeUndefined();
  });

  it('never retries once text is on the reader\u2019s screen, and says what went wrong', async () => {
    provider.stream.mockResolvedValue(tornStream('Half an ans'));
    const processed = makeProcessed();
    const next = vi.fn(() => ({ provider: processed.provider, processed }));

    const decoder = new TextDecoder();
    let output = '';
    for await (const chunk of runToolLoop(processed, {
      approvalMode: 'auto',
      failover: { next },
    })) {
      output += decoder.decode(chunk);
    }

    expect(next).not.toHaveBeenCalled();
    expect(output).toContain('Half an ans');
    expect(reportedFailure(output)).toBeDefined();
    expect(output).toContain('"reason":"error"');
  });
});
