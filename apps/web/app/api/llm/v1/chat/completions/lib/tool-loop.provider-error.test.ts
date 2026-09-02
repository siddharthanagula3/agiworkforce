import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageProviderStep: vi.fn(),
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
}));

import { runToolLoop } from './tool-loop';
import { mapClassifiedUpstreamError } from './upstream-error-copy';
import type { ProcessedRequest } from './request-processor';

const UPSTREAM_REJECTION =
  'Google API API error (400): Invalid JSON payload received. Unknown name "propertyNames" at \'tools[0].function_declarations[4].parameters.properties[2].value.properties[1].value\'';

function providerRejection(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-provider-error-1',
    chatRequest: { model: 'gemini-test', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gemini-test',
    provider: 'google',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gemini-test',
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
  } as ProcessedRequest;
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

describe('runToolLoop — a provider rejection reaches the user as product copy', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
  });

  it('replaces the raw provider text with the public copy for the rejection category', async () => {
    mockBuildToolLoopStream.mockRejectedValue(providerRejection(400, UPSTREAM_REJECTION));

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const streamError = streamErrorFrom(output);

    expect(streamError).toEqual({
      message: 'The provider rejected this request. Try again, or choose another model.',
      code: '400',
      retryable: false,
    });
    expect(output).not.toContain('propertyNames');
    expect(output).not.toContain('function_declarations');
    expect(output).not.toContain('Invalid JSON payload');
  });

  it('reports the same copy on the canonical error event, not just the delta', async () => {
    mockBuildToolLoopStream.mockRejectedValue(providerRejection(400, UPSTREAM_REJECTION));

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    const errorEvent = output
      .split('\n')
      .map((line) => line.replace(/^data: /, ''))
      .filter((line) => line.includes('"type":"error"'))
      .map((line) => JSON.parse(line))
      .at(-1);

    expect(JSON.stringify(errorEvent)).toContain(
      'The provider rejected this request. Try again, or choose another model.',
    );
    expect(JSON.stringify(errorEvent)).not.toContain('propertyNames');
  });

  it('tells the failover plan which step failed, so it can rule on a rejection', async () => {
    const encoder = new TextEncoder();
    const answer = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: { content: 'Answered.' }, finish_reason: 'stop' }],
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    mockBuildToolLoopStream
      .mockRejectedValueOnce(providerRejection(400, UPSTREAM_REJECTION))
      .mockResolvedValueOnce(answer);

    const processed = makeProcessed();
    const rotated = { ...processed, provider: 'anthropic' } as ProcessedRequest;
    const next = vi.fn(() => ({ provider: 'anthropic', processed: rotated }));

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', failover: { next } }),
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error), { step: 1 });
    expect(output).toContain('Answered.');
    expect(output).not.toContain('x_stream_error');
  });

  it.each([
    [503, 'server_overload'],
    [401, 'auth'],
    [429, 'rate_limit'],
  ])('keeps every other upstream status on its own mapped copy (%i)', async (status) => {
    const error = providerRejection(status, `upstream detail for ${status}`);
    mockBuildToolLoopStream.mockRejectedValue(error);

    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    const { classifyError } = await import('@agiworkforce/provider-runtime');
    expect(streamErrorFrom(output).message).toBe(
      mapClassifiedUpstreamError(classifyError(error), 'google').message,
    );
    expect(output).not.toContain('upstream detail for');
  });
});
