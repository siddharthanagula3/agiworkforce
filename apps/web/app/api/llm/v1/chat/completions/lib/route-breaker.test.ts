import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockResolveProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: (...args: unknown[]) => mockResolveProviderFromModel(...args),
  buildServerProviderAdapter: vi.fn(),
  listAvailableManagedProviderIds: () => new Set<string>(),
  toGenericUpstreamError: vi.fn(),
}));

const mockGetRouteHealthSnapshot = vi.fn();
const mockGetCredentialHealthSnapshot = vi.fn();
const mockGetCredentialCooldownSnapshot = vi.fn();
const mockRecordCredentialOutcome = vi.fn();

vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  recordShadowRouteOutcome: vi.fn(async () => undefined),
  getRouteHealthSnapshot: (...args: unknown[]) => mockGetRouteHealthSnapshot(...args),
  getCredentialHealthSnapshot: (...args: unknown[]) => mockGetCredentialHealthSnapshot(...args),
  getCredentialCooldownSnapshot: (...args: unknown[]) => mockGetCredentialCooldownSnapshot(...args),
  recordCredentialOutcome: (...args: unknown[]) => mockRecordCredentialOutcome(...args),
  providerOfRouteId: (routeId: string) => routeId.split('/')[0],
  getServedRouteAffinity: vi.fn(async () => null),
  getFreeLaneRuntimeState: vi.fn(async () => ({})),
}));

import { ROUTE_RPM_REFUSAL } from '@agiworkforce/routing';
import { classifyError, RouteBudgetExhaustedError } from '@agiworkforce/provider-runtime';

import { recordCredentialRejection, resolveFailoverBreakerView } from './route-breaker';
import type { ProcessedRequest } from './request-processor';

const NOW = 1_700_000_000_000;
const OPEN_SNAPSHOT = { available: false, halfOpen: false, consecutiveFailures: 5, sampleCount: 5 };
const CLOSED_SNAPSHOT = {
  available: true,
  halfOpen: false,
  consecutiveFailures: 0,
  sampleCount: 0,
};

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    provider: 'anthropic',
    chatRequest: {
      model: 'primary-model',
      messages: [],
    } as unknown as ProcessedRequest['chatRequest'],
    fallbackModels: ['candidate-a'],
    freeLane: undefined,
    ...overrides,
  } as ProcessedRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRouteHealthSnapshot.mockResolvedValue({});
  mockGetCredentialHealthSnapshot.mockResolvedValue({});
  mockGetCredentialCooldownSnapshot.mockResolvedValue({});
  mockResolveProviderFromModel.mockImplementation(() => 'anthropic');
});

describe('resolveFailoverBreakerView', () => {
  it('reports no provider as credential-open when every snapshot reads closed', async () => {
    mockGetCredentialHealthSnapshot.mockResolvedValue({ anthropic: CLOSED_SNAPSHOT });
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW);
    expect(view.openCredentialProviders).toEqual([]);
  });

  it('lists a provider whose breaker snapshot reads open', async () => {
    mockGetCredentialHealthSnapshot.mockResolvedValue({ anthropic: OPEN_SNAPSHOT });
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW);
    expect(view.openCredentialProviders).toEqual(['anthropic']);
  });

  it('flags a candidate as credential-cooling from the new cooldown scope, independent of the breaker', async () => {
    mockGetCredentialHealthSnapshot.mockResolvedValue({ anthropic: CLOSED_SNAPSHOT });
    mockGetCredentialCooldownSnapshot.mockResolvedValue({ anthropic: OPEN_SNAPSHOT });
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW);
    expect(view.openCredentialProviders).toEqual([]);
    expect(view.isCredentialCooling({ modelKey: 'primary-model', provider: 'anthropic' })).toBe(
      true,
    );
  });

  it('reports credential-cooling false when the cooldown snapshot reads closed', async () => {
    mockGetCredentialCooldownSnapshot.mockResolvedValue({ anthropic: CLOSED_SNAPSHOT });
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW);
    expect(view.isCredentialCooling({ modelKey: 'primary-model', provider: 'anthropic' })).toBe(
      false,
    );
  });

  it('reads the route breaker for a candidate model/provider pair', async () => {
    mockGetRouteHealthSnapshot.mockResolvedValue({ 'openai/candidate-a': OPEN_SNAPSHOT });
    mockResolveProviderFromModel.mockImplementation((model: string) =>
      model === 'candidate-a' ? 'openai' : 'anthropic',
    );
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW);
    expect(view.isCandidateBreakerOpen({ modelKey: 'candidate-a', provider: 'openai' })).toBe(true);
  });

  it('treats a candidate over its dispatch budget as unselectable, and names the refusal', async () => {
    const candidate = { modelKey: 'candidate-a', provider: 'openai' };
    const view = await resolveFailoverBreakerView(makeProcessed(), NOW, {
      'openai/candidate-a': {
        admitted: false,
        refusal: ROUTE_RPM_REFUSAL,
        retryAfterMs: 4_000,
        requestsInWindow: 60,
        tokensInWindow: 0,
      },
    });

    expect(view.isCandidateBreakerOpen(candidate)).toBe(true);
    expect(view.rateLimitRefusal(candidate)).toBe(ROUTE_RPM_REFUSAL);
    expect(view.rateLimitRefusal({ modelKey: 'primary-model', provider: 'anthropic' })).toBeNull();
  });

  it('admits a candidate inside its budget, and admits every candidate when no budget was read', async () => {
    const candidate = { modelKey: 'candidate-a', provider: 'openai' };
    const withinBudget = await resolveFailoverBreakerView(makeProcessed(), NOW, {
      'openai/candidate-a': {
        admitted: true,
        retryAfterMs: 0,
        requestsInWindow: 1,
        tokensInWindow: 10,
      },
    });
    const noBudget = await resolveFailoverBreakerView(makeProcessed(), NOW);

    expect(withinBudget.isCandidateBreakerOpen(candidate)).toBe(false);
    expect(withinBudget.rateLimitRefusal(candidate)).toBeNull();
    expect(noBudget.isCandidateBreakerOpen(candidate)).toBe(false);
    expect(noBudget.rateLimitRefusal(candidate)).toBeNull();
  });

  it('classifies the refusal as a rate limit that is worth another route', () => {
    const classified = classifyError(
      new RouteBudgetExhaustedError('openai/candidate-a', ROUTE_RPM_REFUSAL, 4_000),
    );

    expect(classified.category).toBe('rate_limit');
    expect(classified.code).toBe(ROUTE_RPM_REFUSAL);
    expect(classified.fallbackable).toBe(true);
    expect(classified.retryAfterSeconds).toBe(4);
  });
});

describe('recordCredentialRejection', () => {
  it('records a credential_rejected outcome against the provider breaker scope', () => {
    mockRecordCredentialOutcome.mockResolvedValue(undefined);
    recordCredentialRejection('anthropic');
    expect(mockRecordCredentialOutcome).toHaveBeenCalledWith('anthropic', {
      class: 'credential_rejected',
    });
  });
});
