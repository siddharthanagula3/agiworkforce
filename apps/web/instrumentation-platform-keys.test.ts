import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalCmekProvider, type CmekProvider } from '@/lib/crypto/cmek';
import {
  PLATFORM_DATA_KEY_ENV,
  PLATFORM_KEY_PROVIDER_ENV,
  PLATFORM_KMS_KEY_URI_ENV,
  PLATFORM_KMS_REGION_ENV,
} from '@/lib/crypto/platform-keys';

const recordConfigurationState = vi.fn();
const buildCmekProviderRegistry = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(() => ({})),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  validateOpenTelemetrySetup: vi.fn(),
}));

vi.mock('botid/client/core', () => ({
  initBotId: () => undefined,
}));

vi.mock('@/lib/validate-env', () => ({
  validateEnvironment: () => ({ valid: true, errors: [] }),
  logValidationResults: () => undefined,
}));

vi.mock('@/lib/server/db-pool-tuning', () => ({
  assertPooledDatabaseEndpoint: () => undefined,
}));

vi.mock('@/lib/observability/metrics', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordConfigurationState: (...args: unknown[]) => recordConfigurationState(...args) as unknown,
}));

vi.mock('@/lib/server/organization-encryption-keys', () => ({
  buildCmekProviderRegistry: () => buildCmekProviderRegistry() as unknown,
}));

const DESCRIPTOR = {
  provider: 'local' as const,
  keyUri: 'local://platform/root',
  region: 'us-east-1',
};
const TOTP_ENV = 'TOTP_ENCRYPTION_KEY';
const TOTP_KEY = 'ab'.repeat(32);

interface CountedProvider {
  provider: CmekProvider;
  unwraps: () => number;
}

function counted(inner: CmekProvider, failure?: (wrapped: string) => Error): CountedProvider {
  let unwraps = 0;
  return {
    unwraps: () => unwraps,
    provider: {
      id: inner.id,
      generateDataKey: (descriptor) => inner.generateDataKey(descriptor),
      unwrapDataKey: async (descriptor, wrapped) => {
        unwraps += 1;
        const error = failure?.(wrapped);
        if (error) throw error;
        return inner.unwrapDataKey(descriptor, wrapped);
      },
    },
  };
}

async function sealedPlatform(failure?: (wrapped: string) => Error) {
  const local = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
  const { wrapped, plaintext } = await local.generateDataKey(DESCRIPTOR);
  const { sealEnvelope } = await import('@/lib/crypto/envelope');
  const ring = { active: { id: '1', material: plaintext }, retired: [] };
  vi.stubEnv(PLATFORM_KEY_PROVIDER_ENV, 'local');
  vi.stubEnv(PLATFORM_KMS_KEY_URI_ENV, DESCRIPTOR.keyUri);
  vi.stubEnv(PLATFORM_KMS_REGION_ENV, DESCRIPTOR.region);
  vi.stubEnv(PLATFORM_DATA_KEY_ENV, wrapped);
  vi.stubEnv(`${PLATFORM_DATA_KEY_ENV}_ID`, '1');
  vi.stubEnv(TOTP_ENV, sealEnvelope(ring, TOTP_KEY, 'b64-iv-ct-tag', 'agi:platform-secret'));
  const tracked = counted(local, failure);
  buildCmekProviderRegistry.mockReturnValue({ local: tracked.provider });
  return { wrapped, tracked };
}

async function loadInstrumentation() {
  vi.resetModules();
  return import('@/instrumentation');
}

beforeEach(() => {
  recordConfigurationState.mockReset();
  buildCmekProviderRegistry.mockReset();
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startup under the environment key provider, which is what production runs', () => {
  it('builds no provider client and asks no vendor to unseal anything', async () => {
    vi.stubEnv(PLATFORM_KEY_PROVIDER_ENV, '');
    vi.stubEnv(TOTP_ENV, TOTP_KEY);

    const { register } = await loadInstrumentation();
    await expect(register()).resolves.toBeUndefined();

    expect(buildCmekProviderRegistry).not.toHaveBeenCalled();
    expect(recordConfigurationState).toHaveBeenCalledWith({
      component: 'platform-keys',
      state: 'ok',
    });
  });

  it('leaves every platform secret resolvable, so nothing that reads one starts broken', async () => {
    vi.stubEnv(PLATFORM_KEY_PROVIDER_ENV, '');
    vi.stubEnv(TOTP_ENV, TOTP_KEY);

    const { register } = await loadInstrumentation();
    await register();

    const { platformSecret } = await import('@/lib/crypto/platform-keys');
    expect(platformSecret(TOTP_ENV)).toBe(TOTP_KEY);
  });
});

describe('startup under a key-management provider', () => {
  it('unseals the platform data key, so a secret that was ciphertext resolves', async () => {
    await sealedPlatform();

    const { register } = await loadInstrumentation();
    await register();

    const { platformSecret, platformKeyPosture } = await import('@/lib/crypto/platform-keys');
    expect(platformKeyPosture()).toMatchObject({ provider: 'local', ready: true });
    expect(platformSecret(TOTP_ENV)).toBe(TOTP_KEY);
    expect(recordConfigurationState).toHaveBeenCalledWith({
      component: 'platform-keys',
      state: 'ok',
    });
  });

  it('refuses to become ready when the key will not unseal, rather than failing each request', async () => {
    const { wrapped } = await sealedPlatform((sealed) => new Error(`kms denied ${sealed}`));

    const { register } = await loadInstrumentation();
    await expect(register()).rejects.toThrow(/refuses to become ready/i);

    expect(recordConfigurationState).toHaveBeenCalledWith({
      component: 'platform-keys',
      state: 'invalid',
    });
    expect(wrapped.length).toBeGreaterThan(32);
  });

  it('never repeats the wrapped key or the vendor message into the failure it raises', async () => {
    const { wrapped } = await sealedPlatform((sealed) => new Error(`kms denied ${sealed}`));

    const { register } = await loadInstrumentation();
    const raised = await register().then(
      () => null,
      (error: unknown) => error,
    );

    const rendered = `${String(raised)}\n${(raised as Error).stack ?? ''}\n${JSON.stringify(
      raised,
      Object.getOwnPropertyNames(raised as object),
    )}`;
    expect(rendered).not.toContain(wrapped);
    expect(rendered).not.toContain('kms denied');
    expect(rendered).toContain('local');
  });

  it('unseals once across a second register, which is what a hot reload does', async () => {
    const { tracked } = await sealedPlatform();

    const { register } = await loadInstrumentation();
    await register();
    await register();

    expect(tracked.unwraps()).toBe(1);
    expect(buildCmekProviderRegistry).toHaveBeenCalledTimes(1);
  });
});
