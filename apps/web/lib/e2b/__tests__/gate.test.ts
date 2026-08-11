/**
 * E2B gate predicates — unit tests.
 *
 * Verifies that e2bCutoverEnabled() gates on the EXPLICIT FLAG only (never on
 * key presence alone), and that e2bExecutionEnabled() gates on key OR flag.
 *
 * These are the critical invariants: dropping E2B_API_KEY into prod without the
 * explicit flag must NOT open the managed-compute execution path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// gate.ts is 'server-only'; stub that import so vitest doesn't fail in the test env.
vi.mock('server-only', () => ({}));
// Stub the managed-compute gate dependency.
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: vi.fn(() => false),
}));
const computeIsPriceableMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('../compute-metering', () => ({
  sandboxComputeIsPriceable: computeIsPriceableMock,
}));

const ENV_KEY = 'AGI_E2B_EXECUTION';
const API_KEY = 'E2B_API_KEY';

describe('e2bCutoverEnabled', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { [ENV_KEY]: process.env[ENV_KEY], [API_KEY]: process.env[API_KEY] };
    delete process.env[ENV_KEY];
    delete process.env[API_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    process.env[ENV_KEY] = savedEnv[ENV_KEY];
    process.env[API_KEY] = savedEnv[API_KEY];
    if (savedEnv[ENV_KEY] === undefined) delete process.env[ENV_KEY];
    if (savedEnv[API_KEY] === undefined) delete process.env[API_KEY];
  });

  it('is false by default (no flag, no key)', async () => {
    const { e2bCutoverEnabled } = await import('../gate');
    expect(e2bCutoverEnabled()).toBe(false);
  });

  it('is true when AGI_E2B_EXECUTION=1', async () => {
    process.env[ENV_KEY] = '1';
    vi.resetModules();
    const { e2bCutoverEnabled } = await import('../gate');
    expect(e2bCutoverEnabled()).toBe(true);
  });

  it('is false when AGI_E2B_EXECUTION=0 even with an API key present', async () => {
    // Critical: key presence alone must NOT open the cut-over path.
    process.env[ENV_KEY] = '0';
    process.env[API_KEY] = 'sk-test-key';
    vi.resetModules();
    const { e2bCutoverEnabled } = await import('../gate');
    expect(e2bCutoverEnabled()).toBe(false);
  });

  it('is false when only E2B_API_KEY is present (key alone is not cut-over consent)', async () => {
    // This is the load-bearing rule: key-only must not activate managed compute for all users.
    process.env[API_KEY] = 'sk-test-key';
    vi.resetModules();
    const { e2bCutoverEnabled } = await import('../gate');
    expect(e2bCutoverEnabled()).toBe(false);
  });

  it('is false for arbitrary non-1 flag values', async () => {
    for (const val of ['true', 'yes', 'on', '2', '']) {
      process.env[ENV_KEY] = val;
      vi.resetModules();
      const { e2bCutoverEnabled } = await import('../gate');
      expect(e2bCutoverEnabled()).toBe(false);
    }
  });
});

describe('e2bExecutionEnabled', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { [ENV_KEY]: process.env[ENV_KEY], [API_KEY]: process.env[API_KEY] };
    delete process.env[ENV_KEY];
    delete process.env[API_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    process.env[ENV_KEY] = savedEnv[ENV_KEY];
    process.env[API_KEY] = savedEnv[API_KEY];
    if (savedEnv[ENV_KEY] === undefined) delete process.env[ENV_KEY];
    if (savedEnv[API_KEY] === undefined) delete process.env[API_KEY];
  });

  it('is false by default', async () => {
    const { e2bExecutionEnabled } = await import('../gate');
    expect(e2bExecutionEnabled()).toBe(false);
  });

  it('is true when E2B_API_KEY is present', async () => {
    process.env[API_KEY] = 'sk-live-key';
    vi.resetModules();
    const { e2bExecutionEnabled } = await import('../gate');
    expect(e2bExecutionEnabled()).toBe(true);
  });

  it('is true when AGI_E2B_EXECUTION=1 even without a key', async () => {
    process.env[ENV_KEY] = '1';
    vi.resetModules();
    const { e2bExecutionEnabled } = await import('../gate');
    expect(e2bExecutionEnabled()).toBe(true);
  });
});

describe('e2bProvisioningReady', () => {
  beforeEach(() => {
    delete process.env[ENV_KEY];
    delete process.env[API_KEY];
    computeIsPriceableMock.mockReturnValue(true);
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
    delete process.env[API_KEY];
  });

  it('requires both deliberate cut-over and a non-empty API key', async () => {
    const { e2bProvisioningReady } = await import('../gate');
    expect(e2bProvisioningReady()).toBe(false);

    process.env[ENV_KEY] = '1';
    expect(e2bProvisioningReady()).toBe(false);

    process.env[API_KEY] = 'e2b-test-key';
    expect(e2bProvisioningReady()).toBe(true);

    process.env[ENV_KEY] = '0';
    expect(e2bProvisioningReady()).toBe(false);
  });

  it('refuses to advertise provisioning when sandbox compute cannot be priced', async () => {
    process.env[ENV_KEY] = '1';
    process.env[API_KEY] = 'e2b-test-key';
    computeIsPriceableMock.mockReturnValue(false);
    vi.resetModules();

    const { e2bProvisioningReady } = await import('../gate');
    expect(e2bProvisioningReady()).toBe(false);
  });
});
