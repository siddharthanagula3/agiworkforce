import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockBuildAdapter = vi.fn(() => ({ id: 'openrouter' }));
const mockBuildChatRequest = vi.fn(() => ({
  model: 'claude-sonnet-5',
  messages: [] as unknown[],
}));
vi.mock('./adapter-providers', () => ({
  ADAPTER_PROVIDERS: {
    openrouter: {
      buildAdapter: (...args: unknown[]) => mockBuildAdapter(...args),
      buildChatRequest: (...args: unknown[]) => mockBuildChatRequest(...args),
      mapError: (err: unknown) => err,
      wireMode: 'openai-passthrough',
    },
    anthropic: {
      buildAdapter: (...args: unknown[]) => mockBuildAdapter(...args),
      buildChatRequest: (...args: unknown[]) => mockBuildChatRequest(...args),
      mapError: (err: unknown) => err,
      wireMode: 'legacy-web',
    },
  },
}));

const mockStartProviderStream = vi.fn(async () => (async function* () {})());
vi.mock('./adapter-factory', () => ({
  startProviderStream: (...args: unknown[]) => mockStartProviderStream(...args),
}));

import { buildToolLoopStream } from './tool-loop-anthropic';
import type { ProcessedRequest } from './request-processor';

function makeProcessed(routeAffinity?: ProcessedRequest['routeAffinity']): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-affinity-1',
    chatRequest: { model: 'claude-sonnet-5', messages: [], stream: true } as never,
    conversationId: 'conversation-1',
    requestedModel: 'claude-sonnet-5',
    provider: 'openrouter',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'claude-sonnet-5',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    ...(routeAffinity ? { routeAffinity } : {}),
    llmRequest: {
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 1000,
      stream: true,
    },
  } as ProcessedRequest;
}

function dispatchedChatRequest(): { metadata?: Record<string, unknown> } {
  return mockStartProviderStream.mock.calls.at(-1)![1] as { metadata?: Record<string, unknown> };
}

describe('buildToolLoopStream · warm-route provider pinning', () => {
  beforeEach(() => {
    mockBuildAdapter.mockClear();
    mockBuildChatRequest.mockClear();
    mockStartProviderStream.mockClear();
  });

  it('pins the OpenRouter upstream provider when this attempt is the warm route', async () => {
    const processed = makeProcessed({
      routeId: 'open_router/claude-sonnet-5',
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, 'claude-sonnet-5');

    expect(dispatchedChatRequest().metadata).toEqual({
      openRouterProviderRouting: { order: ['deepinfra'], allowFallbacks: true },
    });
  });

  it('does not pin when the served route differs from the warm one', async () => {
    const processed = makeProcessed({
      routeId: 'open_router/claude-opus-5',
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, 'claude-sonnet-5');

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });

  it('does not pin a non-OpenRouter attempt even with a matching affinity record', async () => {
    const processed = makeProcessed({
      routeId: 'anthropic/claude-sonnet-5',
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('anthropic', processed, processed.llmRequest, 'claude-sonnet-5');

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });

  it('does not pin when the affinity carries no upstream provider attribution', async () => {
    const processed = makeProcessed({ routeId: 'open_router/claude-sonnet-5' });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, 'claude-sonnet-5');

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });
});
