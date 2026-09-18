import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createLocalCmekProvider } from './cmek';
import { openEnvelope, sealEnvelope, type KeyRing } from './envelope';
import { PlatformKeyProviderUnavailableError, createPlatformKeyService } from './platform-keys';

const TOTP_ENV = 'TOTP_ENCRYPTION_KEY';
const TOTP_KEY = 'ab'.repeat(32);
const PLATFORM_SECRET_CONTEXT = 'agi:platform-secret';
const DESCRIPTOR = {
  provider: 'local' as const,
  keyUri: 'local://platform/root',
  region: 'us-east-1',
};

async function sealedEnvironment() {
  const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
  const { wrapped, plaintext } = await provider.generateDataKey(DESCRIPTOR);
  const unsealingRing: KeyRing = { active: { id: '1', material: plaintext }, retired: [] };
  return {
    provider,
    unsealingRing,
    env: {
      AGI_PLATFORM_KEY_PROVIDER: 'local',
      AGI_PLATFORM_KMS_KEY_URI: DESCRIPTOR.keyUri,
      AGI_PLATFORM_KMS_REGION: DESCRIPTOR.region,
      AGI_PLATFORM_DATA_KEY: wrapped,
      AGI_PLATFORM_DATA_KEY_ID: '1',
      [TOTP_ENV]: sealEnvelope(unsealingRing, TOTP_KEY, 'b64-iv-ct-tag', PLATFORM_SECRET_CONTEXT),
      JWT_SECRET: sealEnvelope(
        unsealingRing,
        'the signing secret',
        'b64-iv-ct-tag',
        PLATFORM_SECRET_CONTEXT,
      ),
    } as Record<string, string | undefined>,
  };
}

describe('with no provider configured', () => {
  it('reports the environment as the posture rather than implying a KMS', () => {
    const service = createPlatformKeyService({ env: { [TOTP_ENV]: TOTP_KEY } });
    expect(service.providerId()).toBe('env');
    expect(service.posture()).toMatchObject({ provider: 'env', ready: true });
  });

  it('resolves the key ring exactly as the environment-backed provider always has', () => {
    const service = createPlatformKeyService({ env: { [TOTP_ENV]: TOTP_KEY } });
    const ring = service.keyRing(TOTP_ENV, { encoding: 'utf8' });
    const sealed = sealEnvelope(ring, 'secret', 'b64-iv-ct-tag');
    expect(openEnvelope(ring, sealed, 'b64-iv-ct-tag').plaintext).toBe('secret');
  });

  it('refuses a provider id this build does not have', () => {
    const service = createPlatformKeyService({ env: { AGI_PLATFORM_KEY_PROVIDER: 'hsm' } });
    expect(() => service.providerId()).toThrow(PlatformKeyProviderUnavailableError);
  });
});

describe('with a key-management provider configured', () => {
  it('holds only ciphertext in the environment', async () => {
    const { env } = await sealedEnvironment();
    expect(env[TOTP_ENV]).not.toBe(TOTP_KEY);
    expect(env['JWT_SECRET']).not.toContain('the signing secret');
  });

  it('refuses to resolve anything before the data key has been unsealed', async () => {
    const { env, provider } = await sealedEnvironment();
    const service = createPlatformKeyService({ env, registry: { local: provider } });

    expect(service.posture().ready).toBe(false);
    expect(() => service.secret('JWT_SECRET')).toThrow(PlatformKeyProviderUnavailableError);
    expect(() => service.keyRing(TOTP_ENV, { encoding: 'utf8' })).toThrow(/has not unsealed it/i);
  });

  it('unseals once at startup and then resolves every platform secret', async () => {
    const { env, provider } = await sealedEnvironment();
    const service = createPlatformKeyService({ env, registry: { local: provider } });

    const posture = await service.preload();
    expect(posture).toMatchObject({ provider: 'local', ready: true });
    expect(service.secret('JWT_SECRET')).toBe('the signing secret');
    expect(service.keyRing(TOTP_ENV, { encoding: 'utf8' }).active.material).toEqual(
      Buffer.from(TOTP_KEY.slice(0, 32), 'utf8'),
    );
    expect(service.posture().resolved).toContain('JWT_SECRET');
  });

  it('refuses when the deployment holds no client for the named provider', async () => {
    const { env } = await sealedEnvironment();
    const service = createPlatformKeyService({ env, registry: {} });
    await expect(service.preload()).rejects.toBeInstanceOf(PlatformKeyProviderUnavailableError);
  });

  it('refuses when the key that wraps the platform data key is unnamed', async () => {
    const { env, provider } = await sealedEnvironment();
    const service = createPlatformKeyService({
      env: { ...env, AGI_PLATFORM_KMS_KEY_URI: undefined },
      registry: { local: provider },
    });
    await expect(service.preload()).rejects.toThrow(/AGI_PLATFORM_KMS_KEY_URI/);
  });

  it('unseals retired versions too, so a rotation window still opens old ciphertext', async () => {
    const { env, provider, unsealingRing } = await sealedEnvironment();
    const older = 'cd'.repeat(32);
    const service = createPlatformKeyService({
      env: {
        ...env,
        [`${TOTP_ENV}_ID`]: '2',
        [`${TOTP_ENV}_RETIRED`]: `1:${sealEnvelope(
          unsealingRing,
          older,
          'b64-iv-ct-tag',
          PLATFORM_SECRET_CONTEXT,
        )}`,
      },
      registry: { local: provider },
    });
    await service.preload();

    const ring = service.keyRing(TOTP_ENV, { encoding: 'utf8' });
    expect(ring.retired).toHaveLength(1);
    expect(ring.retired[0]).toMatchObject({ id: '1' });
    expect(ring.retired[0]?.material).toEqual(Buffer.from(older.slice(0, 32), 'utf8'));
  });

  it('does not open a secret sealed under a different context', async () => {
    const { env, provider, unsealingRing } = await sealedEnvironment();
    const service = createPlatformKeyService({
      env: {
        ...env,
        JWT_SECRET: sealEnvelope(unsealingRing, 'elsewhere', 'b64-iv-ct-tag', 'other'),
      },
      registry: { local: provider },
    });
    await service.preload();
    expect(() => service.secret('JWT_SECRET')).toThrow();
  });
});
