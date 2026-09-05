import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getModelsForProvider, requireProviderDefaultModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const ANTHROPIC_MODEL = requireProviderDefaultModel('anthropic');
const anthropicPremiumModel = getModelsForProvider('anthropic').find(
  (model) =>
    model.reasoning?.thinkingDefault === 'adaptive' &&
    model.reasoning.rejectsSamplingParameters === true,
);
if (!anthropicPremiumModel) {
  throw new Error('The canonical Anthropic premium reasoning fixture must exist');
}
const ANTHROPIC_PREMIUM_MODEL = anthropicPremiumModel.id;

const mockBuildAdapter = vi.fn((..._args: unknown[]) => ({ id: 'openrouter' }));
const mockBuildChatRequest = vi.fn((..._args: unknown[]) => ({
  model: ANTHROPIC_MODEL,
  messages: [] as unknown[],
  metadata: undefined as Record<string, unknown> | undefined,
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
  resolveWireMode: vi.fn(),
}));

const mockStartProviderStream = vi.fn(async (..._args: unknown[]) => (async function* () {})());
vi.mock('./adapter-factory', () => ({
  startProviderStream: (...args: unknown[]) => mockStartProviderStream(...args),
  buildAnthropicAdapter: vi.fn(),
  buildDeepSeekAdapter: vi.fn(),
  buildGoogleAdapter: vi.fn(),
  buildGroqAdapter: vi.fn(),
  buildMinimaxAdapter: vi.fn(),
  buildMoonshotAdapter: vi.fn(),
  buildNvidiaNimAdapter: vi.fn(),
  buildOpenAIAdapter: vi.fn(),
  buildOpenRouterAdapter: vi.fn(),
  buildPerplexityAdapter: vi.fn(),
  buildQwenAdapter: vi.fn(),
  buildVercelGatewayAdapter: vi.fn(),
  buildWorkersAiAdapter: vi.fn(),
  buildXAIAdapter: vi.fn(),
  buildZhipuAdapter: vi.fn(),
}));

import { buildToolLoopStream } from './tool-loop-anthropic';
import type { ProcessedRequest } from './request-processor';

function makeProcessed(routeAffinity?: ProcessedRequest['routeAffinity']): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-affinity-1',
    chatRequest: { model: ANTHROPIC_MODEL, messages: [], stream: true } as never,
    conversationId: 'conversation-1',
    requestedModel: ANTHROPIC_MODEL,
    provider: 'openrouter',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: ANTHROPIC_MODEL,
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    ...(routeAffinity ? { routeAffinity } : {}),
    llmRequest: {
      model: ANTHROPIC_MODEL,
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
      routeId: `open_router/${ANTHROPIC_MODEL}`,
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, ANTHROPIC_MODEL);

    expect(dispatchedChatRequest().metadata).toEqual({
      openRouterProviderRouting: { order: ['deepinfra'], allowFallbacks: true },
    });
  });

  it('does not pin when the served route differs from the warm one', async () => {
    const processed = makeProcessed({
      routeId: `open_router/${ANTHROPIC_PREMIUM_MODEL}`,
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, ANTHROPIC_MODEL);

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });

  it('does not pin a non-OpenRouter attempt even with a matching affinity record', async () => {
    const processed = makeProcessed({
      routeId: `anthropic/${ANTHROPIC_MODEL}`,
      upstreamProvider: 'deepinfra',
    });

    await buildToolLoopStream('anthropic', processed, processed.llmRequest, ANTHROPIC_MODEL);

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });

  it('does not pin when the affinity carries no upstream provider attribution', async () => {
    const processed = makeProcessed({ routeId: `open_router/${ANTHROPIC_MODEL}` });

    await buildToolLoopStream('openrouter', processed, processed.llmRequest, ANTHROPIC_MODEL);

    expect(dispatchedChatRequest().metadata).toBeUndefined();
  });
});
