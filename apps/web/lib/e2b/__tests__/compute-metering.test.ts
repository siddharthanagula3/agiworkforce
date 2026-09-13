import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

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
vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageRequest,
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest: (value: unknown) => JSON.stringify(value),
  estimateMicrousdOf: (source: { estimatedCostMicrousd?: number; estimatedCostCents: number }) =>
    source.estimatedCostMicrousd ?? source.estimatedCostCents * 10_000,
  ManagedUsageRequestError: TestManagedUsageRequestError,
}));

const RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

/** 2 vCPU at 14 microUSD plus 4 GiB at 4.5 microUSD, the published E2B default shape. */
const DEFAULT_SHAPE_RATE = 46;

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

  it('charges vCPU seconds and memory seconds together', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 1, memoryGib: 2 })).toBe(23);
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 2, memoryGib: 4 })).toBe(46);
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 4, memoryGib: 8 })).toBe(92);
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 8, memoryGib: 16 })).toBe(184);
  });

  it('treats a zero, negative or unknown dimension as undeclared and uses the default', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 0, memoryGib: 0 })).toBe(
      DEFAULT_SHAPE_RATE,
    );
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: -1, memoryGib: null })).toBe(
      DEFAULT_SHAPE_RATE,
    );
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 4 })).toBe(74);
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(165600);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: 165600,
        usage: expect.objectContaining({ microusd_per_second: DEFAULT_SHAPE_RATE }),
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('bills a minute that used to round away to nothing', async () => {
    const mod = await loadModule();

    // A minute at the table rate is 2,760 microUSD, under a third of a cent.
    // Rounding it to cents billed zero and moved no usage cap, so a sandbox
    // paused every minute ran indefinitely for free.
    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(2_760);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ actualCostMicrousd: 2_760 }),
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(100800);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actualCostMicrousd: 100800,
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(165600);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actualCostMicrousd: 165600,
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(331200);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: 331200,
        usage: expect.objectContaining({ microusd_per_second: 92 }),
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(165600);
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostMicrousd: 165600,
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
      expect.objectContaining({ actualCostMicrousd: HELD_MICROUSD }),
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
    expect(held['estimatedCostMicrousd']).toBe(3_600 * DEFAULT_SHAPE_RATE);
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
});

describe('compute pricing is read from the registry, not a literal', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@agiworkforce/types');
  });

  it('reflects a different registry rate for the same sandbox shape', async () => {
    vi.doMock('@agiworkforce/types', () => ({
      getProviderComputePricing: () => ({
        unit: 'usd_per_vcpu_second',
        ratePerUnit: 0.00005,
        ramRatePerGibSecond: 0.00001,
      }),
    }));
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 2, memoryGib: 4 })).toBe(140);
  });

  it('refuses to price when the registry declares no memory rate', async () => {
    vi.doMock('@agiworkforce/types', () => ({
      getProviderComputePricing: () => ({ unit: 'usd_per_vcpu_second', ratePerUnit: 0.00005 }),
    }));
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('is unpriced and logs an error when the registry has no compute-pricing entry', async () => {
    vi.doMock('@agiworkforce/types', () => ({
      getProviderComputePricing: () => null,
    }));
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(mod.getSandboxComputeMicrousdPerSecond({ vcpuCount: 2, memoryGib: 4 })).toBe(0);
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
