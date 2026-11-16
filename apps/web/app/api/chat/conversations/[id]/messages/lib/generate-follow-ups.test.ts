import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelEffortOptions, listCanonicalModels } from '@agiworkforce/types';
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

let selectedRoute: typeof SELECTED_ROUTE = SELECTED_ROUTE;
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, resolveAutoRoute: () => selectedRoute };
});

const drainToLlmResponseMock = vi.fn();
const streamedRequests: unknown[] = [];
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: vi.fn(() => new Set<string>()),
  buildServerProviderAdapter: () => ({
    stream: (request: unknown) => {
      streamedRequests.push(request);
      return (async function* () {})();
    },
  }),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
  buildProtocolRouteAdapter: vi.fn(),
}));

const lease = {
  providerStarted: vi.fn(async () => {}),
  completed: vi.fn(async (_input: unknown) => {}),
  failed: vi.fn(async (_record: unknown) => {}),
};
const reserveBackgroundUsageMock = vi.fn(async (_input: unknown) => lease);
vi.mock('@/lib/services/background-usage-lease', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveBackgroundUsage: (input: unknown) => reserveBackgroundUsageMock(input),
}));

vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitledPlanTier: vi.fn(async () => 'free'),
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
  selectedRoute = SELECTED_ROUTE;
  streamedRequests.length = 0;
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
  it('reserves the call against the account’s budget before the provider and settles it after', async () => {
    const suggestions = await generateFollowUpSuggestions(input());

    expect(reserveBackgroundUsageMock).toHaveBeenCalledTimes(1);
    expect(reserveBackgroundUsageMock.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      planTier: 'free',
      idempotencyKey: 'follow-ups:message-1',
      provider: 'anthropic',
      model: 'test.model',
      routeId: 'test-route',
      maxOutputTokens: expect.any(Number),
      quotaFeature: 'follow_up_suggestions',
    });
    expect(lease.providerStarted).toHaveBeenCalledTimes(1);
    expect(lease.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: 'test.model',
        usage: expect.objectContaining({ promptTokens: 400, completionTokens: 40 }),
      }),
    );
    expect(suggestions).toHaveLength(3);
  });

  it('never reaches the provider when the budget refuses the call', async () => {
    reserveBackgroundUsageMock.mockRejectedValueOnce(new Error('budget reached'));

    expect(await generateFollowUpSuggestions(input())).toEqual([]);

    expect(drainToLlmResponseMock).not.toHaveBeenCalled();
  });

  it('releases the hold when the provider call fails', async () => {
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));

    await expect(generateFollowUpSuggestions(input())).rejects.toThrow('upstream anthropic');

    expect(lease.failed).toHaveBeenCalledTimes(1);
    expect(lease.completed).not.toHaveBeenCalled();
  });

  it('turns reasoning off on a route that admits it, so the small output budget goes to the questions', async () => {
    const model = listCanonicalModels().find((candidate) =>
      getModelEffortOptions(candidate.id).includes('none'),
    );
    if (!model) throw new Error('Catalog fixture with none effort is unavailable');
    selectedRoute = { ...SELECTED_ROUTE, modelKey: model.id };

    await generateFollowUpSuggestions(input());

    expect(streamedRequests[0]).toMatchObject({ effort: 'none' });
  });

  it('does not force an effort the selected route does not offer', async () => {
    await generateFollowUpSuggestions(input());

    expect(streamedRequests[0]).not.toHaveProperty('effort');
  });

  it('drops the fragment a reply cut off at the output limit ends on', async () => {
    drainToLlmResponseMock.mockResolvedValueOnce({
      content: 'What changed in the 2026 chassis?\nWhy does shifting',
      model: 'test.model',
      promptTokens: 400,
      completionTokens: 160,
      totalTokens: 560,
      finishReason: 'length',
    });

    expect(await generateFollowUpSuggestions(input())).toEqual([
      'What changed in the 2026 chassis?',
    ]);
  });

  it('offers nothing when the output limit cut the reply before its first line ended', async () => {
    drainToLlmResponseMock.mockResolvedValueOnce({
      content: 'Why does shifting',
      model: 'test.model',
      promptTokens: 400,
      completionTokens: 160,
      totalTokens: 560,
      finishReason: 'length',
    });

    expect(await generateFollowUpSuggestions(input())).toEqual([]);
    expect(lease.completed).toHaveBeenCalledTimes(1);
  });

  it('never reaches the provider for an empty answer', async () => {
    expect(await generateFollowUpSuggestions(input({ answer: '  ' }))).toEqual([]);

    expect(reserveBackgroundUsageMock).not.toHaveBeenCalled();
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

  it('keeps the characters a question is about', () => {
    expect(
      sanitizeFollowUpSuggestions(
        [
          'What does the <script> tag do?',
          '- How is \\(\\sum_{i=1}^{3} x_i\\) evaluated?',
          '> What does `<div>` do in [brackets]?',
        ].join('\n'),
      ),
    ).toEqual([
      'What does the <script> tag do?',
      'How is \\(\\sum_{i=1}^{3} x_i\\) evaluated?',
      'What does `<div>` do in [brackets]?',
    ]);
  });

  it('removes only a marker that starts the line, never a number the question begins with', () => {
    expect(
      sanitizeFollowUpSuggestions(
        '1.5 million people live there, why?\n> - Is #1 the best rank?\n## Why is a > b here?',
      ),
    ).toEqual([
      '1.5 million people live there, why?',
      'Is #1 the best rank?',
      'Why is a > b here?',
    ]);
  });

  it('still makes each suggestion one bounded line', () => {
    const [only] = sanitizeFollowUpSuggestions(`What\tabout\u0000this ${'a'.repeat(200)}?`);

    // eslint-disable-next-line no-control-regex -- asserting control characters are gone
    expect(only).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(only).toMatch(/^What about this a+…$/);
    expect(only!.length).toBeLessThanOrEqual(101);
  });

  it('drops fragments too short to be a question', () => {
    expect(sanitizeFollowUpSuggestions('ok\nWhy did the chassis change?')).toEqual([
      'Why did the chassis change?',
    ]);
  });
});
