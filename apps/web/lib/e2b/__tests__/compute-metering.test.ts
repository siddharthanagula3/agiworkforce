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
  vi.stubEnv('NODE_ENV', undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('NEXT_PHASE', undefined);
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

describe('sandboxComputeIsPriceable — the provisioning gate', () => {
  beforeEach(() => {
    clearScopedEnv();
    resetMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false on a production runtime with no configured rate', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
  });

  it('is false on a self-hosted production runtime signalled only by VERCEL_ENV', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
  });

  it('is false on production when the rate is not a positive number', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(RATE_ENV, '0');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('is true on production once a rate is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(RATE_ENV, '28');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
  });

  it('is true during the production build phase', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
  });

  it('is true on a preview deployment and on a dev box, warning once', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    const mod = await loadModule();
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
    expect(mod.sandboxComputeIsPriceable()).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
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

  it('returns 0 when the rate is unset or unusable', async () => {
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(0);
    vi.stubEnv(RATE_ENV, 'not-a-number');
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(0);
  });

  it('returns the configured rate', async () => {
    vi.stubEnv(RATE_ENV, '250');
    const mod = await loadModule();
    expect(mod.getSandboxComputeMicrousdPerSecond()).toBe(250);
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

  it('reports every unpriced interval and never throws at the caller', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadModule();

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    await expect(mod.meterSandboxComputeInterval(interval({ sandboxId: 'sbx-2' }))).resolves.toBe(
      0,
    );

    expect(settleCreditsDurably).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error.mock.calls[0]?.[0]).toMatchObject({
      elapsedMs: 60_000,
      unbilledMs: 60_000,
    });
    expect(logger.error.mock.calls[1]?.[0]).toMatchObject({
      elapsedMs: 60_000,
      unbilledMs: 120_000,
    });
  });

  it('counts an interval that rounds to 0 cents at a realistic rate as unbilled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(RATE_ENV, '28');
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
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await loadModule();

    await expect(mod.meterSandboxComputeInterval(interval({ endedAtMs: 1_000_000 }))).resolves.toBe(
      0,
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('settles a priced interval into the usage ledger', async () => {
    vi.stubEnv('NODE_ENV', 'production');
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

  it('swallows a ledger failure so pause / kill / reclaim still release the sandbox', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(RATE_ENV, '5000');
    const mod = await loadModule();
    settleCreditsDurably.mockRejectedValueOnce(new Error('ledger down'));

    await expect(mod.meterSandboxComputeInterval(interval())).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
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
