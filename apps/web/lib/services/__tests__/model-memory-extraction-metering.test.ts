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

const runnerResult = vi.fn();
vi.mock('@agiworkforce/agent-core', () => ({
  isMemoryExtractionWorthwhile: () => true,
  extractCandidateMemoryFacts: () => ['pattern fact'],
  extractMemoryFactsWithModel: async (
    message: string,
    options: {
      runner: (
        input: { systemPrompt: string; message: string },
        signal: AbortSignal,
      ) => Promise<string>;
      onFallback?: (reason: string) => void;
    },
  ) => {
    try {
      const content = await options.runner(
        { systemPrompt: 'extract', message },
        new AbortController().signal,
      );
      return { facts: [content] };
    } catch {
      options.onFallback?.('provider_error');
      return { facts: ['pattern fact'] };
    }
  },
}));

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
  idempotencyKey: 'memory-extraction:request-1',
  requestHash: 'hash',
  leaseToken: 'lease',
  estimatedCostMicrousd: 500,
  estimatedCostCents: 1,
  quotaFeature: 'memory_extraction',
}));
const finalizeMock = vi.fn(async (..._args: unknown[]) => ({
  requestStatus: 'completed',
  operationResult: 'finalized',
  settlementStatus: 'succeeded',
  actualCostCents: 1,
}));
const markStartedMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    reserveManagedUsageRequest: (...args: unknown[]) => reserveMock(...args),
    finalizeManagedUsageRequest: (...args: unknown[]) => finalizeMock(...args),
    markManagedUsageProviderStarted: (...args: unknown[]) => markStartedMock(...args),
  };
});

const { MEMORY_EXTRACTION_QUOTA_FEATURE, extractAutoMemoryFactsWithModel } =
  await import('../model-memory-extraction');

function input(overrides: Record<string, unknown> = {}) {
  return {
    db: {} as never,
    message: 'My name is Sid. I just moved to Berlin.',
    userId: 'user-1',
    organizationId: null,
    planTier: 'pro',
    requestId: 'request-1',
    ...overrides,
  } as Parameters<typeof extractAutoMemoryFactsWithModel>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  runnerResult.mockReset();
  drainToLlmResponseMock.mockResolvedValue({
    content: 'User lives in Berlin',
    model: 'test.model',
    promptTokens: 120,
    completionTokens: 20,
    totalTokens: 140,
  });
});

describe('extractAutoMemoryFactsWithModel metering', () => {
  it('reserves and finalizes exactly once for one extraction', async () => {
    const facts = await extractAutoMemoryFactsWithModel(input());

    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(reserveMock.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1',
      planTier: 'pro',
      isFlagship: false,
      quotaFeature: MEMORY_EXTRACTION_QUOTA_FEATURE,
    });
    expect(markStartedMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({ outcome: 'completed' });
    expect(facts).toEqual(['User lives in Berlin']);
  });

  it('skips extraction and keeps the pattern facts when the reservation is refused', async () => {
    reserveMock.mockRejectedValueOnce(new Error('Usage budget exhausted'));

    expect(await extractAutoMemoryFactsWithModel(input())).toEqual(['pattern fact']);

    expect(drainToLlmResponseMock).not.toHaveBeenCalled();
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it('keys the reservation on the turn it reads, not on a fresh value', async () => {
    await extractAutoMemoryFactsWithModel(input());
    await extractAutoMemoryFactsWithModel(input());
    await extractAutoMemoryFactsWithModel(input({ requestId: 'request-2' }));

    const keys = reserveMock.mock.calls.map(
      ([call]) => (call as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[0]).toMatch(/^memory-extraction\.[0-9a-f]{48}$/);
  });

  it('releases the reservation when the provider call fails', async () => {
    drainToLlmResponseMock.mockRejectedValueOnce(new Error('upstream anthropic'));

    expect(await extractAutoMemoryFactsWithModel(input())).toEqual(['pattern fact']);

    expect(reserveMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0]?.[0]).toMatchObject({
      outcome: 'failed',
      actualCostCents: 0,
    });
  });
});

describe('extractAutoMemoryFactsWithModel replayed', () => {
  let ledger: Map<string, { requestHash: string }>;

  beforeEach(() => {
    ledger = new Map();
    reserveMock.mockImplementation(async (...args: unknown[]) => {
      const call = args[0] as { idempotencyKey: string; requestHash: string };
      const held = ledger.get(call.idempotencyKey);
      if (held) {
        throw new Error(
          held.requestHash === call.requestHash
            ? 'This idempotency key has already reached a terminal state.'
            : 'This idempotency key was already used for a different request body.',
        );
      }
      ledger.set(call.idempotencyKey, { requestHash: call.requestHash });
      return {
        db: {},
        userId: 'user-1',
        idempotencyKey: call.idempotencyKey,
        requestHash: call.requestHash,
        leaseToken: 'lease',
        estimatedCostMicrousd: 500,
        estimatedCostCents: 1,
        quotaFeature: 'memory_extraction',
      };
    });
  });

  it('charges one turn once however many times its extraction is replayed', async () => {
    const first = await extractAutoMemoryFactsWithModel(input());
    const replay = await extractAutoMemoryFactsWithModel(input());

    expect(first).toEqual(['User lives in Berlin']);
    expect(ledger.size).toBe(1);
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(replay).toEqual(['pattern fact']);
  });

  it('gives two turns two reservations', async () => {
    await extractAutoMemoryFactsWithModel(input());
    await extractAutoMemoryFactsWithModel(input({ requestId: 'request-2' }));

    expect(ledger.size).toBe(2);
    expect(drainToLlmResponseMock).toHaveBeenCalledTimes(2);
  });
});
