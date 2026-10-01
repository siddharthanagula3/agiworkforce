import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_RATE_CARD,
  FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD,
  chargeMicrousdForProviderCost,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/services/cogs-ledger-service');
type ScanModule1 = typeof import('@agiworkforce/types');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (db: unknown) => db,
}));

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const quotaValues = vi.hoisted(() => new Map<string, number | boolean>());
const quotaStore = vi.hoisted(() => ({ set: vi.fn(), increment: vi.fn() }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => quotaStore }));

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordSettledProviderCost,
}));

vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
}));

const TestManagedUsageRequestError = vi.hoisted(
  () =>
    class extends Error {
      constructor(
        message: string,
        readonly status: number,
        readonly code: string,
      ) {
        super(message);
      }
    },
);
const reserveManagedUsageRequest = vi.hoisted(() => vi.fn());
const finalizeManagedUsageRequest = vi.hoisted(() => vi.fn());
const markManagedUsageProviderStarted = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageRequest,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  fingerprintManagedUsageRequest: (value: unknown) => JSON.stringify(value),
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number; estimatedCostCents: number }) =>
    source.estimatedCostMicrousd ?? source.estimatedCostCents * 10_000,
  ManagedUsageRequestError: TestManagedUsageRequestError,
}));

const RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

const VCPU_RATE = FEATURE_RATE_CARD.sandbox_vcpu_second.providerCogsMicrousd as number;
const GIB_RATE = FEATURE_RATE_CARD.sandbox_gib_second.providerCogsMicrousd as number;
const DEFAULT_SHAPE_RATE = Math.round(2 * VCPU_RATE + 4 * GIB_RATE);
const HOUR_AT_DEFAULT_SHAPE = 3_600 * DEFAULT_SHAPE_RATE;
const MINUTE_AT_DEFAULT_SHAPE = 60 * DEFAULT_SHAPE_RATE;

function clearScopedEnv(): void {
  vi.stubEnv(RATE_ENV, undefined);
}

const HELD_MICROUSD = 1_000_000;

const reservation = {
  idempotencyKey: 'agi.e2b.compute.res-1',
  requestHash: 'hash-1',
  leaseToken: 'lease-1',
  estimatedCostMicrousd: HELD_MICROUSD,
  provider: 'e2b',
  model: 'e2b',
};

function resetMocks(): void {
  logger.warn.mockClear();
  logger.error.mockClear();
  logger.info.mockClear();
  quotaValues.clear();
  quotaStore.set.mockReset();
  quotaStore.set.mockImplementation(
    async (key: string, value: number | boolean, options?: { onlyIfAbsent?: boolean }) => {
      if (options?.onlyIfAbsent && quotaValues.has(key)) return false;
      quotaValues.set(key, value);
      return true;
    },
  );
  quotaStore.increment.mockReset();
  quotaStore.increment.mockImplementation(async (key: string, amount: number) => {
    const next = Number(quotaValues.get(key) ?? 0) + amount;
    quotaValues.set(key, next);
    return next;
  });
  recordSettledProviderCost.mockReset();
  recordSettledProviderCost.mockResolvedValue(undefined);
  markManagedUsageProviderStarted.mockReset();
  markManagedUsageProviderStarted.mockResolvedValue(undefined);
  reserveManagedUsageRequest.mockReset();
  reserveManagedUsageRequest.mockImplementation(async (input: Record<string, unknown>) => ({
    db: input['db'],
    userId: input['userId'],
    idempotencyKey: input['idempotencyKey'],
    requestHash: input['requestHash'],
    leaseToken: 'lease-1',
    estimatedCostMicrousd: input['estimatedCostMicrousd'],
    estimatedCostCents: 1,
  }));
  finalizeManagedUsageRequest.mockReset();
  finalizeManagedUsageRequest.mockResolvedValue({
    requestStatus: 'completed',
    operationResult: 'finalized',
    settlementStatus: 'succeeded',
  });
}

async function loadModule() {
  vi.resetModules();
  return import('../compute-metering');
}

function interval(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    sandboxId: 'sbx-1',
    startedAtMs: 1_000_000,
    endedAtMs: 1_000_000 + 60_000,
    reason: 'pause' as const,
    reservation,
    ...overrides,
  };
}

describe('sandboxComputeIsPriceable, the provisioning gate', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true with no override, priced from the published vCPU and memory table', async () => {
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('falls back to the declared table when the override is not a positive number', async () => {
    vi.stubEnv(RATE_ENV, '0');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(DEFAULT_SHAPE_RATE);
    expect(logger.error).toHaveBeenCalled();
  });

  it('is true once a valid override is configured', async () => {
    vi.stubEnv(RATE_ENV, '28');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
  });
});

describe('getSandboxComputeMicrousdPerSecond', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prices the E2B default shape when the template declares none', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(DEFAULT_SHAPE_RATE);
  });

  it('charges vCPU seconds and memory seconds together from the rate card', async () => {
    const mod = await loadModule();
    for (const [vcpuCount, memoryGib] of [
      [1, 2],
      [2, 4],
      [4, 8],
      [8, 16],
    ] as const) {
      expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount, memoryGib })).toBe(
        Math.round(vcpuCount * VCPU_RATE + memoryGib * GIB_RATE),
      );
    }
  });

  it('treats a zero, negative or unknown dimension as undeclared and uses the default', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 0, memoryGib: 0 })).toBe(
      DEFAULT_SHAPE_RATE,
    );
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: -1, memoryGib: null })).toBe(
      DEFAULT_SHAPE_RATE,
    );
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 4 })).toBe(
      Math.round(4 * VCPU_RATE + 4 * GIB_RATE),
    );
  });

  it('the override wins over the table regardless of sandbox shape', async () => {
    vi.stubEnv(RATE_ENV, '250');
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 8, memoryGib: 16 })).toBe(250);
  });
});

describe('meterSandboxComputeInterval', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bills from the declared table rather than nothing when the override is invalid', async () => {
    vi.stubEnv(RATE_ENV, 'garbage');
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(
      chargeMicrousdForProviderCost(HOUR_AT_DEFAULT_SHAPE),
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: chargeMicrousdForProviderCost(HOUR_AT_DEFAULT_SHAPE),
        providerCostMicrousd: HOUR_AT_DEFAULT_SHAPE,
        usage: expect.objectContaining({ microusd_per_second: DEFAULT_SHAPE_RATE }),
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('bills a minute at its provider cost rounded up to a hundredth of a credit', async () => {
    const mod = await loadModule();

    const charged = chargeMicrousdForProviderCost(MINUTE_AT_DEFAULT_SHAPE);
    expect(charged).toBeGreaterThanOrEqual(MINUTE_AT_DEFAULT_SHAPE);
    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(charged);
    expect(markManagedUsageProviderStarted).toHaveBeenCalledTimes(1);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'completed',
        actualCostMicrousd: charged,
        providerCostMicrousd: MINUTE_AT_DEFAULT_SHAPE,
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('stays silent for an interval that was never billable', async () => {
    const mod = await loadModule();

    await expect(mod.meterSandboxComputeInterval(interval({ endedAtMs: 1_000_000 }))).resolves.toBe(
      0,
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('settles a priced interval into the usage ledger using the override', async () => {
    vi.stubEnv(RATE_ENV, '28');
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(
      chargeMicrousdForProviderCost(3_600 * 28),
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actualCostMicrousd: chargeMicrousdForProviderCost(3_600 * 28),
        idempotencyKey: 'agi.e2b.compute.res-1',
        leaseToken: 'lease-1',
        quotaFeature: 'sandbox_compute',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('settles from the table when no override is configured', async () => {
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(
      chargeMicrousdForProviderCost(HOUR_AT_DEFAULT_SHAPE),
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actualCostMicrousd: chargeMicrousdForProviderCost(HOUR_AT_DEFAULT_SHAPE),
        usage: expect.objectContaining({ microusd_per_second: DEFAULT_SHAPE_RATE }),
      }),
    );
  });

  it('uses the interval sandbox shape to select the table rate', async () => {
    const mod = await loadModule();
    const hour = interval({
      endedAtMs: 1_000_000 + 3_600_000,
      vcpuCount: 4,
      memoryGib: 8,
    });

    const rate = Math.round(4 * VCPU_RATE + 8 * GIB_RATE);
    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(
      chargeMicrousdForProviderCost(3_600 * rate),
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: chargeMicrousdForProviderCost(3_600 * rate),
        usage: expect.objectContaining({ microusd_per_second: rate }),
      }),
    );
  });

  it('settles from the rate snapshotted at provisioning, over both override and table', async () => {
    vi.stubEnv(RATE_ENV, '250');
    const mod = await loadModule();
    const hour = interval({
      endedAtMs: 1_000_000 + 3_600_000,
      vcpuCount: 4,
      memoryGib: 8,
      snapshotMicrousdPerSecond: 46,
    });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(
      chargeMicrousdForProviderCost(3_600 * 46),
    );
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: chargeMicrousdForProviderCost(3_600 * 46),
        usage: expect.objectContaining({ microusd_per_second: 46 }),
      }),
    );
  });

  it('swallows a ledger failure so pause / kill / reclaim still release the sandbox', async () => {
    vi.stubEnv(RATE_ENV, '5000');
    const mod = await loadModule();
    finalizeManagedUsageRequest.mockRejectedValueOnce(new Error('ledger down'));

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('never settles an interval that carries no reservation', async () => {
    const mod = await loadModule();
    const { reservation: _unreserved, ...noHold } = interval();

    await expect(mod.meterSandboxComputeInterval(noHold)).resolves.toBe(0);
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('never settles past what the account agreed to hold', async () => {
    vi.stubEnv(RATE_ENV, '5000');
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(HELD_MICROUSD);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: HELD_MICROUSD,
        providerCostMicrousd: 3_600 * 5_000,
        usage: expect.objectContaining({ metered_microusd: 3_600 * 5_000 }),
      }),
    );
  });
});

describe('reserveSandboxComputeInterval', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const reserveInput = {
    userId: 'user-1',
    planTier: 'pro',
    templateId: 'tpl-1',
    microusdPerSecond: DEFAULT_SHAPE_RATE,
    ttlMs: 3_600_000,
  };

  it('holds the whole admitted lifetime before the sandbox exists', async () => {
    const mod = await loadModule();

    const outcome = await mod.reserveSandboxComputeInterval(reserveInput);
    expect(outcome.outcome).toBe('reserved');
    const held = reserveManagedUsageRequest.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(held['estimatedCostMicrousd']).toBe(
      chargeMicrousdForProviderCost(3_600 * DEFAULT_SHAPE_RATE),
    );
    expect(held['planTier']).toBe('pro');
    expect(held['leaseSeconds']).toBeGreaterThan(3_600);
    expect(held['provider']).toBe('e2b');
    expect(held['model']).toBe('tpl-1');
    expect(held['quotaFeature']).toBe('sandbox_compute');
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('refuses an account that is over its quota, so no sandbox is provisioned', async () => {
    const mod = await loadModule();
    reserveManagedUsageRequest.mockRejectedValue(
      new TestManagedUsageRequestError('no budget', 402, 'insufficient_credits'),
    );

    const outcome = await mod.reserveSandboxComputeInterval(reserveInput);
    expect(outcome).toMatchObject({ outcome: 'refused' });
    if (outcome.outcome !== 'refused') throw new Error('expected a refusal');
    expect(outcome.error.status).toBe(402);
    expect(outcome.error.code).toBe('insufficient_credits');
  });

  it('refuses rather than provisions when billing itself cannot answer', async () => {
    const mod = await loadModule();
    reserveManagedUsageRequest.mockRejectedValue(new Error('billing down'));

    const outcome = await mod.reserveSandboxComputeInterval(reserveInput);
    expect(outcome).toMatchObject({ outcome: 'refused' });
    if (outcome.outcome !== 'refused') throw new Error('expected a refusal');
    expect(outcome.error.status).toBe(503);
  });

  it('releases a hold whose sandbox never ran', async () => {
    const mod = await loadModule();
    const outcome = await mod.reserveSandboxComputeInterval(reserveInput);
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');

    await mod.releaseSandboxComputeReservation({
      userId: 'user-1',
      reservation: outcome.reservation,
      reason: 'sandbox_create_failed',
    });
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed', actualCostMicrousd: 0 }),
    );
  });

  it('reserves Free sandbox compute against platform allowance without paid managed usage', async () => {
    const mod = await loadModule();
    const outcome = await mod.reserveSandboxComputeInterval({
      ...reserveInput,
      planTier: 'free',
      ttlMs: 600_000,
    });
    expect(outcome.outcome).toBe('reserved');
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');
    expect(outcome.reservation.fundingSource).toBe('platform-free');
    expect(outcome.reservation.estimatedCostMicrousd).toBe(600 * DEFAULT_SHAPE_RATE);
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('refuses Free compute after its daily platform allowance is exhausted', async () => {
    const mod = await loadModule();
    const perHold = 600 * DEFAULT_SHAPE_RATE;
    const fits = Math.floor(FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD / perHold);
    const outcomes = await Promise.all(
      Array.from({ length: fits + 1 }, () =>
        mod.reserveSandboxComputeInterval({ ...reserveInput, planTier: 'free', ttlMs: 600_000 }),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.outcome === 'reserved')).toHaveLength(fits);
    const refusal = outcomes.find((outcome) => outcome.outcome === 'refused');
    expect(refusal).toMatchObject({
      outcome: 'refused',
      error: { status: 429, code: 'free_sandbox_allowance_exhausted' },
    });
    expect(reserveManagedUsageRequest).not.toHaveBeenCalled();
  });

  it('returns a Free platform hold when provisioning fails, once only', async () => {
    const mod = await loadModule();
    const outcome = await mod.reserveSandboxComputeInterval({
      ...reserveInput,
      planTier: 'free',
      ttlMs: 600_000,
    });
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');
    const reservation = outcome.reservation;
    await mod.releaseSandboxComputeReservation({ userId: 'user-1', reservation, reason: 'failed' });
    await mod.releaseSandboxComputeReservation({ userId: 'user-1', reservation, reason: 'failed' });
    if (reservation.fundingSource !== 'platform-free') throw new Error('expected Free funding');
    expect(quotaValues.get(reservation.quotaKey)).toBe(0);
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
  });
});

describe('platform-funded Free sandbox settlement', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refunds unused reserved lifetime and records platform COGS without charging the user', async () => {
    const mod = await loadModule();
    const outcome = await mod.reserveSandboxComputeInterval({
      userId: 'user-1',
      planTier: 'free',
      microusdPerSecond: DEFAULT_SHAPE_RATE,
      ttlMs: 600_000,
    });
    if (outcome.outcome !== 'reserved') throw new Error('expected a reservation');
    const reservation = outcome.reservation;
    await expect(mod.meterSandboxComputeInterval(interval({ reservation }))).resolves.toBe(
      MINUTE_AT_DEFAULT_SHAPE,
    );
    if (reservation.fundingSource !== 'platform-free') throw new Error('expected Free funding');
    expect(quotaValues.get(reservation.quotaKey)).toBe(MINUTE_AT_DEFAULT_SHAPE);
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(recordSettledProviderCost).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'e2b',
        customerCanonicalMicrousd: 0,
        providerEstimatedCostMicrousd: MINUTE_AT_DEFAULT_SHAPE,
        sourceRef: reservation.idempotencyKey,
        usage: expect.objectContaining({
          operation: 'e2b_sandbox_compute',
          funding_source: 'platform-free',
        }),
      }),
    );
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();

    await expect(mod.meterSandboxComputeInterval(interval({ reservation }))).resolves.toBe(
      MINUTE_AT_DEFAULT_SHAPE,
    );
    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    expect(quotaValues.get(reservation.quotaKey)).toBe(MINUTE_AT_DEFAULT_SHAPE);
  });
});

describe('compute pricing is read from the rate card, not a literal', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@agiworkforce/types');
  });

  it('prices every shape from the rate card rate pair', async () => {
    vi.doMock('@agiworkforce/types', async (importOriginal) => ({
      ...(await importOriginal<ScanModule1>()),
      sandboxComputeRate: () => ({ ok: true, microusdPerSecond: 140, overrideInvalid: false }),
    }));
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 2, memoryGib: 4 })).toBe(140);
  });

  it('is unpriced and logs an error when the rate card declares no rate pair', async () => {
    vi.doMock('@agiworkforce/types', async (importOriginal) => ({
      ...(await importOriginal<ScanModule1>()),
      sandboxComputeRate: () => ({ ok: false, overrideInvalid: false }),
    }));
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 2, memoryGib: 4 })).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('settles nothing from an unpriced sandbox and says so', async () => {
    vi.doMock('@agiworkforce/types', async (importOriginal) => ({
      ...(await importOriginal<ScanModule1>()),
      sandboxComputeRate: () => ({ ok: false, overrideInvalid: false }),
    }));
    const mod = await loadModule();
    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    expect(finalizeManagedUsageRequest).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('sandboxComputeCostCents', () => {
  it('charges nothing for a zero, negative or implausibly long interval', async () => {
    const mod = await loadModule();
    expect(mod.sandboxComputeCostCents(0, 5000)).toBe(0);
    expect(mod.sandboxComputeCostCents(-1000, 5000)).toBe(0);
    expect(mod.sandboxComputeCostCents(25 * 60 * 60 * 1000, 5000)).toBe(0);
    expect(mod.sandboxComputeCostCents(Number.NaN, 5000)).toBe(0);
  });

  it('charges nothing when the rate is unusable', async () => {
    const mod = await loadModule();
    expect(mod.sandboxComputeCostCents(60_000, 0)).toBe(0);
  });
});
