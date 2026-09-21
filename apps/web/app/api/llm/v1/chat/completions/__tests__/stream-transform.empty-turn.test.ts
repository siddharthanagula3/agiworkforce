import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cors')>()),
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/llm-cost-calculator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/llm-cost-calculator')>()),
  LLMCostCalculator: {
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    calculateCost: vi.fn(() => 0),
    calculateCostMicrousd: vi.fn(() => 0),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));
vi.mock('@/lib/cost-tracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cost-tracker')>()),
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  isEventPromotedRequest: () => false,
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
}));
vi.mock('../lib/assistant-turn-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/assistant-turn-persistence')>()),
  canPersistAssistantTurn: vi.fn(() => true),
  persistAssistantTurn: vi.fn(() => Promise.resolve()),
  patchAssistantTurnSourceUrls: vi.fn(() => Promise.resolve()),
  extractAssistantTextDelta: vi.fn(() => ''),
}));

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import { persistAssistantTurn } from '../lib/assistant-turn-persistence';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';

const mockPersistAssistantTurn = persistAssistantTurn as ReturnType<typeof vi.fn>;

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-empty-turn-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true },
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
    estimatedCostCents: 0,
    quotaWarningHeader: null,
    quotaFeature: 'standard',
    isFlagshipRequest: false,
    usedFallback: false,
    resolvedTaskType: null,
    classifierConfidence: null,
    resolvedSlot: null,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
  } as unknown as ProcessedRequest;
}

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' });
}

async function drain(response: Response): Promise<string> {
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

async function run(
  chunks: StreamChunk[],
): Promise<{ body: string; successfulTurns: number; persisted: { truncated: boolean }[] }> {
  let successfulTurns = 0;
  const response = await buildAdapterStreamResponse(
    makeRequest() as never,
    chunksOf(chunks),
    makeProcessed(),
    'user-1',
    'token',
    Date.now(),
    'legacy-web',
    async () => {
      successfulTurns += 1;
    },
  );
  const body = await drain(response);
  return {
    body,
    successfulTurns,
    persisted: mockPersistAssistantTurn.mock.calls.map(
      (call) => call[0].snapshot as { truncated: boolean },
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildAdapterStreamResponse, a turn with nothing in it', () => {
  it('does not record a completion the reader never saw', async () => {
    const { successfulTurns, persisted } = await run([{ type: 'stop', reason: 'end_turn' }]);

    expect(persisted).toEqual([{ ...persisted[0], truncated: true }]);
    expect(successfulTurns).toBe(0);
  });

  it('records a turn the provider cut short as truncated, keeping the text it delivered', async () => {
    const { successfulTurns, persisted } = await run([
      { type: 'text-delta', delta: 'Half an ans' },
      { type: 'stop', reason: 'error' },
    ]);

    expect(persisted[0]).toMatchObject({ truncated: true, content: 'Half an ans' });
    expect(successfulTurns).toBe(0);
  });

  it('records a real answer as the complete turn it is', async () => {
    const { successfulTurns, persisted } = await run([
      { type: 'text-delta', delta: 'Here is the answer.' },
      { type: 'stop', reason: 'end_turn' },
    ]);

    expect(persisted[0]).toMatchObject({ truncated: false, content: 'Here is the answer.' });
    expect(successfulTurns).toBe(1);
  });

  it('keeps counting a turn whose only output was a tool call as complete', async () => {
    const { persisted, successfulTurns } = await run([
      { type: 'tool-use-start', toolUseId: 'call_1', name: 'lookup' },
      { type: 'tool-use-delta', toolUseId: 'call_1', deltaJson: '{}' },
      { type: 'tool-use-end', toolUseId: 'call_1' },
      { type: 'stop', reason: 'tool_use' },
    ]);

    expect(persisted[0]).toMatchObject({ truncated: false });
    expect(successfulTurns).toBe(1);
  });

  it('records a stream that reported a failure as truncated', async () => {
    const { successfulTurns, persisted } = await run([
      { type: 'text-delta', delta: 'Half' },
      { type: 'error', message: 'upstream went away', code: '502', retryable: true },
      { type: 'stop', reason: 'error' },
    ]);

    expect(persisted[0]).toMatchObject({ truncated: true });
    expect(successfulTurns).toBe(0);
  });
});
