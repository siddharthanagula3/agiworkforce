import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const settleCreditsDurably = vi.fn(async (_op: unknown) => ({ status: 'settled' }));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { settleCreditsDurably: (op: unknown) => settleCreditsDurably(op) },
}));

const RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

/** 2 vCPU at 14 microUSD plus 4 GiB at 4.5 microUSD, the published E2B default shape. */
const DEFAULT_SHAPE_RATE = 46;

function clearScopedEnv(): void {
  vi.stubEnv(RATE_ENV, undefined);
}

function resetMocks(): void {
  logger.warn.mockClear();
  logger.error.mockClear();
  logger.info.mockClear();
  settleCreditsDurably.mockClear();
  settleCreditsDurably.mockResolvedValue({ status: 'settled' });
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
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicrousd: 165600,
        metadata: expect.objectContaining({ microusd_per_second: DEFAULT_SHAPE_RATE }),
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
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({ amountMicrousd: 2_760 }),
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
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountMicrousd: 100800,
        idempotencyKey: 'e2b-compute:sbx-1:1000000',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('settles from the table when no override is configured', async () => {
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(165600);
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountMicrousd: 165600,
        metadata: expect.objectContaining({ microusd_per_second: DEFAULT_SHAPE_RATE }),
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
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicrousd: 331200,
        metadata: expect.objectContaining({ microusd_per_second: 92 }),
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
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicrousd: 165600,
        metadata: expect.objectContaining({ microusd_per_second: 46 }),
      }),
    );
  });

  it('swallows a ledger failure so pause / kill / reclaim still release the sandbox', async () => {
    vi.stubEnv(RATE_ENV, '5000');
    const mod = await loadModule();
    settleCreditsDurably.mockRejectedValueOnce(new Error('ledger down'));

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
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
