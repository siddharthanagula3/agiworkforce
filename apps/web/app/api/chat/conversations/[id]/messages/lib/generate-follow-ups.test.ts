import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@agiworkforce/routing');

vi.mock('@/lib/server/side-call-training-policy', () => ({
  sideCallRoutingRequest: async (_db: unknown, _userId: string, request: unknown) => request,
}));

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
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, resolveAutoRoute: () => SELECTED_ROUTE };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: vi.fn(() => new Set<string>()),
  buildServerProviderAdapter: () => ({ stream: () => (async function* () {})() }),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  buildProtocolRouteAdapter: vi.fn(),
}));

const recordCostMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordCostMock(...args),
}));

const { generateFollowUpSuggestions, sanitizeFollowUpSuggestions } =
  await import('./generate-follow-ups');

function input(overrides: Record<string, unknown> = {}) {
  return {
    db: {} as never,
    userId: 'user-1',
    organizationId: null,
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
  it('records the call at the platform cost and charges the user nothing', async () => {
    const suggestions = await generateFollowUpSuggestions(input());

    expect(recordCostMock).toHaveBeenCalledTimes(1);
    expect(recordCostMock.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      provider: 'anthropic',
      model: 'test.model',
      customerCanonicalMicrousd: 0,
      taskOutcome: 'delivered',
      usage: { type: 'follow_up_suggestions', conversationId: 'conversation-1' },
    });
    expect(suggestions).toHaveLength(3);
  });

  it('records nothing when the provider call fails', async () => {
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));

    await expect(generateFollowUpSuggestions(input())).rejects.toThrow('upstream anthropic');

    expect(recordCostMock).not.toHaveBeenCalled();
  });

  it('never reaches the provider for an empty answer', async () => {
    expect(await generateFollowUpSuggestions(input({ answer: '  ' }))).toEqual([]);

    expect(recordCostMock).not.toHaveBeenCalled();
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
