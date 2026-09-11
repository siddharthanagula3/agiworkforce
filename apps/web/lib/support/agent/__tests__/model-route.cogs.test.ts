import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const resolveAutoRouteMock = vi.fn(() => SELECTED_ROUTE);
vi.mock('@agiworkforce/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/routing')>();
  return { ...actual, resolveAutoRoute: () => resolveAutoRouteMock() };
});

const drainToLlmResponseMock = vi.fn();
vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => drainToLlmResponseMock(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: () => ({ stream: () => (async function* () {})() }),
  buildProtocolRouteAdapter: vi.fn(),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
}));

const recordSettledProviderCostMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCostMock(...args),
}));

import { callSupportModel } from '../answer/model-route';

const originalEnabled = process.env['SUPPORT_AGENT_ENABLED'];

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SUPPORT_AGENT_ENABLED'] = 'true';
  resolveAutoRouteMock.mockReturnValue(SELECTED_ROUTE);
  drainToLlmResponseMock.mockResolvedValue({
    model: 'test.model',
    content: 'Here is how to reset your password.',
    promptTokens: 120,
    completionTokens: 40,
    totalTokens: 160,
  });
});

afterEach(() => {
  if (originalEnabled === undefined) delete process.env['SUPPORT_AGENT_ENABLED'];
  else process.env['SUPPORT_AGENT_ENABLED'] = originalEnabled;
});

describe('support agent COGS recording', () => {
  it('records a zero-charge COGS event for a signed-in caller', async () => {
    const result = await callSupportModel({
      userMessage: 'how do I reset my password',
      planTier: 'pro',
      userId: 'user_42',
      surface: 'app',
    });

    expect(result.status).toBe('ok');
    expect(recordSettledProviderCostMock).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_42',
        provider: 'anthropic',
        model: 'test.model',
        customerCanonicalMicrousd: 0,
        surface: 'app',
        taskOutcome: 'delivered',
        sourceRef: expect.stringContaining('support:'),
      }),
    );
  });

  it('records a zero-charge COGS event for an anonymous caller', async () => {
    await callSupportModel({
      userMessage: 'what plans do you offer',
      planTier: null,
      userId: null,
      surface: 'marketing',
    });

    expect(recordSettledProviderCostMock).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'anonymous', surface: 'marketing' }),
    );
  });

  it('still records the spend when the provider returns an empty response', async () => {
    drainToLlmResponseMock.mockResolvedValue({
      model: 'test.model',
      content: '   ',
      promptTokens: 80,
      completionTokens: 0,
      totalTokens: 80,
    });

    const result = await callSupportModel({
      userMessage: 'hello',
      planTier: null,
      userId: 'user_1',
      surface: 'app',
    });

    expect(result.status).toBe('unavailable');
    expect(recordSettledProviderCostMock).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the provider call throws', async () => {
    drainToLlmResponseMock.mockRejectedValue(new Error('upstream boom'));

    const result = await callSupportModel({
      userMessage: 'hello',
      planTier: null,
      userId: 'user_1',
      surface: 'app',
    });

    expect(result.status).toBe('unavailable');
    expect(recordSettledProviderCostMock).not.toHaveBeenCalled();
  });
});
