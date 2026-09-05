import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const settleCreditsDurably = vi.fn(async (_op: unknown) => ({ status: 'settled' }));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { settleCreditsDurably: (op: unknown) => settleCreditsDurably(op) },
}));

const RATE_ENV = 'AGI_E2B_COMPUTE_MICROUSD_PER_SECOND';

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

  it('is true with no override, priced from the published per-vCPU table', async () => {
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('is false when the override is set but not a positive number', async () => {
    vi.stubEnv(RATE_ENV, '0');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
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

  it('falls back to the published per-vCPU table default (2 vCPU) with no vcpuCount given', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(28);
  });

  it('scales linearly with the declared vCPU count', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond(1)).toBe(14);
    expect(mod.getSandboxComputeMicrousdPerSecond(2)).toBe(28);
    expect(mod.getSandboxComputeMicrousdPerSecond(4)).toBe(56);
    expect(mod.getSandboxComputeMicrousdPerSecond(6)).toBe(84);
    expect(mod.getSandboxComputeMicrousdPerSecond(8)).toBe(112);
  });

  it('treats a zero or negative vCPU count as unknown, using the default', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond(0)).toBe(28);
    expect(mod.getSandboxComputeMicrousdPerSecond(-1)).toBe(28);
    expect(mod.getSandboxComputeMicrousdPerSecond(null)).toBe(28);
  });

  it('returns 0 when the override is set but unusable, ignoring the table', async () => {
    vi.stubEnv(RATE_ENV, 'not-a-number');
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond(8)).toBe(0);
  });

  it('the override wins over the table regardless of vCPU count', async () => {
    vi.stubEnv(RATE_ENV, '250');
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond(8)).toBe(250);
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

  it('reports every interval as UNPRICED when the override is explicitly invalid', async () => {
    vi.stubEnv(RATE_ENV, 'garbage');
    const mod = await loadModule();

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    await expect(mod.meterSandboxComputeInterval(interval({ sandboxId: 'sbx-2' }))).resolves.toBe(
      0,
    );

    expect(settleCreditsDurably).not.toHaveBeenCalled();
    const unpricedCalls = logger.error.mock.calls.filter(
      (call) => typeof call[0] === 'object' && call[0] !== null && 'elapsedMs' in call[0],
    );
    expect(unpricedCalls).toHaveLength(2);
    expect(unpricedCalls[0]?.[0]).toMatchObject({ elapsedMs: 60_000, unbilledMs: 60_000 });
    expect(unpricedCalls[1]?.[0]).toMatchObject({ elapsedMs: 60_000, unbilledMs: 120_000 });
  });

  it('counts an interval that rounds to 0 cents at the default table rate as unbilled', async () => {
    const mod = await loadModule();

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    expect(settleCreditsDurably).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0]).toMatchObject({
      elapsedMs: 60_000,
      unbilledMs: 60_000,
      microusdPerSecond: 28,
    });
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

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(10);
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountCents: 10,
        idempotencyKey: 'e2b-compute:sbx-1:1000000',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('settles a priced interval into the usage ledger from the table when no override is configured', async () => {
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(10);
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amountCents: 10,
        metadata: expect.objectContaining({ microusd_per_second: 28 }),
      }),
    );
  });

  it('uses the interval vCPU count to select the table rate', async () => {
    const mod = await loadModule();
    const hour = interval({ endedAtMs: 1_000_000 + 3_600_000, vcpuCount: 4 });

    await expect(mod.meterSandboxComputeInterval(hour)).resolves.toBe(20);
    expect(settleCreditsDurably).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 20,
        metadata: expect.objectContaining({ microusd_per_second: 56 }),
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

  it('reflects a different registry rate for the same vCPU count', async () => {
    vi.doMock('@agiworkforce/types', () => ({
      getProviderComputePricing: () => ({ unit: 'usd_per_vcpu_second', ratePerUnit: 0.00005 }),
    }));
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond(2)).toBe(100);
  });

  it('is unpriced and logs an error when the registry has no compute-pricing entry', async () => {
    vi.doMock('@agiworkforce/types', () => ({
      getProviderComputePricing: () => null,
    }));
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(mod.getSandboxComputeMicrousdPerSecond(2)).toBe(0);
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
