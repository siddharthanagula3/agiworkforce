import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

const RAW_PROVIDER_TEXT =
  'Anthropic API error (400): 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';

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
  const messages = [{ role: 'user', content: 'Reply with only: ok' }];
  return {
    chatSurface: 'cli' as const,
    requestId: 'fixture-provider-error-request',
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

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

/**
 * An adapter that fails inside its stream emits the provider's verbatim
 * error as an x_stream_error frame; the loop forwarded that line, so a
 * provider's raw payload reached every client before the loop's own
 * sentence, and the step was then counted as an empty response.
 */
describe("tool loop · the provider's own error frame", () => {
  beforeEach(() => provider.stream.mockReset());

  it('speaks for the failure in its own words and classifies it from the provider text', async () => {
    provider.stream.mockResolvedValueOnce(
      stream([
        { choices: [{ delta: { role: 'assistant', content: '' }, index: 0 }], model: 'fixture' },
        {
          choices: [
            {
              delta: { x_stream_error: { message: RAW_PROVIDER_TEXT, retryable: false } },
              finish_reason: 'stop',
              index: 0,
            },
          ],
          model: 'fixture',
        },
      ]),
    );

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(output).not.toContain('credit balance');
    expect(output).not.toContain('invalid_request_error');
    const errorLines = output.split('\n').filter((line) => line.includes('x_stream_error'));
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toContain('"code":"provider_billing_exhausted"');
    expect(errorLines[0]).toContain('"retryable":false');
    expect(output).toContain('"reason":"error"');
  });
});
