import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    calculateCost: vi.fn(() => 4),
    calculateCostMicrousd: vi.fn(() => 40_000),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
}));

const persistence = vi.hoisted(() => ({
  TRUNCATED_ASSISTANT_TURN_REASON: 'stream_cancelled',
  canPersistAssistantTurn: vi.fn(() => true),
  persistAssistantTurn: vi.fn(async () => undefined),
  patchAssistantTurnSourceUrls: vi.fn(async (_params: unknown) => undefined),
  extractAssistantTextDelta: vi.fn(() => ''),
}));
vi.mock('../lib/assistant-turn-persistence', () => persistence);

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123';

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-citation-urls',
    chatRequest: { model: 'fixture-model', messages: [], stream: true },
    requestedModel: 'fixture-model',
    provider: 'google',
    conversationId: '99999999-9999-4999-8999-999999999999',
    assistantMessageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    conversationIsTemporary: false,
    organizationId: null,
    estimatedCostCents: 5,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    usedFallback: false,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
  } as unknown as ProcessedRequest;
}

/** The frames a Gemini grounded turn emits: sources carrying the router's URL. */
function groundedChunks(): StreamChunk[] {
  return [
    { type: 'text-delta', delta: 'Reuters reported it [1].' },
    {
      type: 'server-tool-result',
      toolUseId: 'grounding-1',
      name: 'web_search',
      payload: {
        type: 'gemini_grounding_result',
        results: [
          {
            type: 'web_search_result',
            url: REDIRECT,
            title: 'reuters.com',
            encrypted_content: 'a snippet',
          },
        ],
      },
    },
    { type: 'usage', inputTokens: 10, outputTokens: 5 },
    { type: 'stop', reason: 'end_turn' },
  ] as unknown as StreamChunk[];
}

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readAllText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function runGroundedTurn(): Promise<Response> {
  return buildAdapterStreamResponse(
    makeRequest() as never,
    chunksOf(groundedChunks()),
    makeProcessed(),
    'user-grounded',
    'token-grounded',
    1_700_000_000_000,
    'legacy-web',
  ) as unknown as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  persistence.canPersistAssistantTurn.mockReturnValue(true);
  persistence.patchAssistantTurnSourceUrls.mockImplementation(async () => undefined);
});

/**
 * A plain grounded turn has no ingestion hop, so the redirect the provider
 * hands back was what got persisted, and those redirects expire. Resolving one
 * is a network call, which cannot run inside the streaming translation path, so
 * the repair runs against the row after the stream is closed.
 */
describe('buildAdapterStreamResponse · grounded citation URLs', () => {
  it('hands the persisted turn its grounded sources to resolve', async () => {
    const response = await runGroundedTurn();
    await readAllText(response);

    expect(persistence.persistAssistantTurn).toHaveBeenCalledOnce();
    expect(persistence.patchAssistantTurnSourceUrls).toHaveBeenCalledOnce();
    const patch = persistence.patchAssistantTurnSourceUrls.mock.calls[0]?.[0] as {
      sources?: Array<{ url: string }>;
    };
    expect(patch.sources?.[0]?.url).toBe(REDIRECT);
  });

  /**
   * The whole reason this runs after `close()` rather than beside the write.
   * Resolution reaches the open web with a two-second budget per redirect; a
   * reader waiting on `[DONE]` must never pay for it.
   */
  it('delivers the whole stream before the resolution has finished', async () => {
    let releasePatch = (): void => undefined;
    let patchSettled = false;
    let patchStarted = (): void => undefined;
    const patchCalled = new Promise<void>((resolve) => {
      patchStarted = resolve;
    });
    persistence.patchAssistantTurnSourceUrls.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          patchStarted();
          releasePatch = () => {
            patchSettled = true;
            resolve(undefined);
          };
        }),
    );

    const response = await runGroundedTurn();
    const text = await readAllText(response);

    expect(text).toContain('Reuters reported it [1].');
    expect(text).toContain('data: [DONE]');
    await patchCalled;
    expect(patchSettled, 'the stream closed while the resolution was still in flight').toBe(false);

    releasePatch();
  });

  /**
   * A turn nobody can persist has no row to patch, and resolving for it would
   * reach the open web on behalf of a transcript that is never reloaded.
   */
  it('does not resolve for a turn that was never persisted', async () => {
    persistence.canPersistAssistantTurn.mockReturnValue(false);

    const response = await runGroundedTurn();
    await readAllText(response);

    expect(persistence.persistAssistantTurn).not.toHaveBeenCalled();
    expect(persistence.patchAssistantTurnSourceUrls).not.toHaveBeenCalled();
  });
});
