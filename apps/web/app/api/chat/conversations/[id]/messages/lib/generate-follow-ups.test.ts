import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: 'balanced',
  taskType: 'simple_chat',
  modelKey: 'test.model',
  provider: 'anthropic',
  providerModelId: 'test-provider-model-id',
  routeId: 'test-route',
  harnessId: 'test/chat',
  fallbacks: [],
  reason: 'preferred_slot',
};

vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return { ...actual, resolveAutoRoute: () => SELECTED_ROUTE };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: () => ({ stream: () => (async function* () {})() }),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  buildProtocolRouteAdapter: vi.fn(),
}));

const reserveMock = vi.fn(async (..._args: unknown[]) => ({
  db: {},
  userId: 'user-1',
  idempotencyKey: 'follow-ups:message-1',
  requestHash: 'hash',
  leaseToken: 'lease',
  estimatedCostMicrousd: 400,
  estimatedCostCents: 1,
}));
const finalizeMock = vi.fn(async (..._args: unknown[]) => ({
  requestStatus: 'completed',
  operationResult: 'finalized',
  settlementStatus: 'succeeded',
  actualCostCents: 1,
}));
const markStartedMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageRequest: (...args: unknown[]) => reserveMock(...args),
  finalizeManagedUsageRequest: (...args: unknown[]) => finalizeMock(...args),
  markManagedUsageProviderStarted: (...args: unknown[]) => markStartedMock(...args),
  fingerprintManagedUsageRequest: () => 'hash',
}));

const { generateFollowUpSuggestions, sanitizeFollowUpSuggestions } =
  await import('./generate-follow-ups');

function input(overrides: Record<string, unknown> = {}) {
  return {
    db: {} as never,
    userId: 'user-1',
    organizationId: null,
    planTier: 'free',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    answer: 'The mainboard is user replaceable and the chassis changed in 2026.',
    sourceTitles: ['Framework Laptop 13 review', 'Framework pricing page'],
    ...overrides,
  } as Parameters<typeof generateFollowUpSuggestions>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  drainToLlmResponseMock.mockResolvedValue({
    content:
      '1. What changed in the 2026 chassis?\n- How much does the mainboard cost?\nIs the old chassis still sold?',
    model: 'test.model',
    promptTokens: 400,
    completionTokens: 40,
    totalTokens: 440,
  });
});

describe('generateFollowUpSuggestions', () => {
  it('reserves and finalizes exactly once for one turn', async () => {
    const suggestions = await generateFollowUpSuggestions(input());

    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({ outcome: 'completed' });
    expect(suggestions).toHaveLength(3);
  });

  it('releases the reservation when the provider call fails', async () => {
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));

    await expect(generateFollowUpSuggestions(input())).rejects.toThrow('upstream anthropic');

    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
  });

  it('never reaches the provider for an empty answer', async () => {
    expect(await generateFollowUpSuggestions(input({ answer: '  ' }))).toEqual([]);

    expect(reserveMock).not.toHaveBeenCalled();
    expect(drainToLlmResponseMock).not.toHaveBeenCalled();
  });
});

describe('sanitizeFollowUpSuggestions', () => {
  it('strips list markers, markdown and duplicates', () => {
    expect(
      sanitizeFollowUpSuggestions(
        '1. **What changed in 2026?**\n- what changed in 2026?\n* Who makes the mainboard?\n\n> Is it repairable by hand?',
      ),
    ).toEqual(['What changed in 2026?', 'Who makes the mainboard?', 'Is it repairable by hand?']);
  });

  it('drops fragments too short to be a question', () => {
    expect(sanitizeFollowUpSuggestions('ok\nWhy did the chassis change?')).toEqual([
      'Why did the chassis change?',
    ]);
  });
});
