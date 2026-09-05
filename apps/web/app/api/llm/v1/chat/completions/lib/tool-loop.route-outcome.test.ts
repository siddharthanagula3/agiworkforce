import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (provider: string, model: string) => `${provider}/${model}`,
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return {
    ...actual,
    reserveManagedUsageProviderStep: vi.fn(),
    ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
  };
});

const mockRecordRouteOutcome = vi.fn(async (..._args: unknown[]) => undefined);
const mockRecordServedRouteAffinity = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getCredentialCooldownSnapshot: vi.fn(async () => ({})),
  providerOfRouteId: (routeId: string) => routeId.split('/')[0],
  recordRouteOutcome: (...args: unknown[]) => mockRecordRouteOutcome(...args),
  recordServedRouteAffinity: (...args: unknown[]) => mockRecordServedRouteAffinity(...args),
  routeAffinityTtlMs: () => 3_600_000,
  getRouteHealthSnapshot: vi.fn(async () => ({})),
  getServedRouteAffinity: vi.fn(async () => null),
  getFreeLaneRuntimeState: vi.fn(async () => ({})),
}));

vi.mock('@agiworkforce/model-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/model-registry')>();
  return { ...actual, getRoutePricing: () => ({ cacheClass: 'gateway_prompt_cache' }) };
});

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function providerRejection(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function textStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: { content: text }, finish_reason: 'stop' }],
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
}

function makeProcessed(conversationId?: string): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-route-outcome-1',
    chatRequest: { model: 'gemini-test', messages: [], stream: true } as never,
    conversationId,
    requestedModel: 'gemini-test',
    provider: 'openrouter',
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
      messages: [{ role: 'user', content: 'hi' }],
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

describe('runToolLoop, route outcome recording', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockRecordRouteOutcome.mockClear();
    mockRecordServedRouteAffinity.mockClear();
  });

  it('records a success outcome for the serving route', async () => {
    mockBuildToolLoopStream.mockResolvedValue(textStream('Hi.'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      'openrouter/gemini-test',
      expect.objectContaining({ class: 'success', durationMs: expect.any(Number) }),
      expect.any(Number),
    );
  });

  it('records affinity for the served route only when the turn has a conversation', async () => {
    mockBuildToolLoopStream.mockResolvedValue(textStream('Hi.'));

    await drain(runToolLoop(makeProcessed('conversation-9'), { approvalMode: 'auto' }));

    expect(mockRecordServedRouteAffinity).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-9',
        routeId: 'openrouter/gemini-test',
        ttlMs: 3_600_000,
      }),
    );
  });

  it('records no affinity for a turn with no conversation', async () => {
    mockBuildToolLoopStream.mockResolvedValue(textStream('Hi.'));

    await drain(runToolLoop(makeProcessed(undefined), { approvalMode: 'auto' }));

    expect(mockRecordServedRouteAffinity).not.toHaveBeenCalled();
  });

  it('maps a rate-limit rejection onto the rate_limit outcome class', async () => {
    mockBuildToolLoopStream.mockRejectedValue(providerRejection(429, 'slow down'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      'openrouter/gemini-test',
      { class: 'rate_limit' },
      expect.any(Number),
    );
  });

  it('maps a 503 overload onto the server_error outcome class', async () => {
    mockBuildToolLoopStream.mockRejectedValue(providerRejection(503, 'overloaded'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      'openrouter/gemini-test',
      { class: 'server_error' },
      expect.any(Number),
    );
  });

  it('records nothing for a request-shaped failure that says nothing about the route', async () => {
    mockBuildToolLoopStream.mockRejectedValue(
      Object.assign(new Error('content_filter triggered'), { status: 400 }),
    );

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordRouteOutcome).not.toHaveBeenCalled();
  });
});
