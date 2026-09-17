import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createKmsKeyProvider,
  envKeyProvider,
  loadKeyRing,
  openEnvelope,
  resolveTenantKeyRing,
  resolveTenantKeyRingAsync,
  sealEnvelope,
  type KeyProvider,
} from './envelope';

const KEY_ONE = '11'.repeat(32);
const KEY_TWO = '22'.repeat(32);

async function fakeUnwrap(wrapped: string): Promise<Buffer> {
  return createHash('sha256').update(wrapped).digest();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('default env provider parity', () => {
  it('produces the same active/retired shape loadKeyRing has always returned', () => {
    const env = { TEST_KEY: KEY_ONE, TEST_KEY_RETIRED: `9:${KEY_TWO}` };

    const viaLoadKeyRing = loadKeyRing('TEST_KEY', { env });
    const viaProvider = envKeyProvider.resolveKeyRing('TEST_KEY', { env });

    expect(viaProvider.provider).toBe('env');
    expect(viaLoadKeyRing).toEqual({ active: viaProvider.active, retired: viaProvider.retired });
    expect(Object.keys(viaLoadKeyRing).sort()).toEqual(['active', 'retired']);
  });

  it('round-trips a secret exactly as before the provider seam existed', () => {
    const ring = loadKeyRing('TEST_KEY', { env: { TEST_KEY: KEY_ONE } });
    const sealed = sealEnvelope(ring, 'plaintext');
    expect(openEnvelope(ring, sealed, 'hex-triple').plaintext).toBe('plaintext');
  });

  it('rejects a non-env provider name instead of silently using env bytes', () => {
    expect(() =>
      loadKeyRing('TEST_KEY', { env: { TEST_KEY: KEY_ONE, AGI_KEY_PROVIDER: 'kms' } }),
    ).toThrow(/AGI_KEY_PROVIDER=kms/);
  });
});

describe('KMS-backed provider stub', () => {
  it('round-trips a secret through an injected unwrap function', async () => {
    const provider = createKmsKeyProvider(fakeUnwrap);
    const env = { WRAPPED_KEY: 'arn:aws:kms:key/active' };

    const ring = await provider.resolveKeyRing('WRAPPED_KEY', { env });

    expect(ring.provider).toBe('kms');
    expect(ring.active.material).toHaveLength(32);
    const sealed = sealEnvelope(ring, 'kms secret', 'hex-triple');
    expect(openEnvelope(ring, sealed, 'hex-triple').plaintext).toBe('kms secret');
  });

  it('resolves retired entries through the same unwrap function and stays ring-aware', async () => {
    const provider = createKmsKeyProvider(fakeUnwrap);
    const oldRing = await provider.resolveKeyRing('WRAPPED_KEY', {
      env: { WRAPPED_KEY: 'arn:key/v1' },
    });
    const sealedUnderOld = sealEnvelope(oldRing, 'still readable', 'hex-triple');

    const rotatedRing = await provider.resolveKeyRing('WRAPPED_KEY', {
      env: {
        WRAPPED_KEY: 'arn:key/v2',
        WRAPPED_KEY_ID: '2',
        WRAPPED_KEY_RETIRED: '1:arn:key/v1',
      },
    });

    expect(openEnvelope(rotatedRing, sealedUnderOld, 'hex-triple').plaintext).toBe(
      'still readable',
    );
  });

  it('refuses an unwrap result of the wrong length instead of building a broken key', async () => {
    const provider = createKmsKeyProvider(async () => Buffer.from('too-short'));
    await expect(
      provider.resolveKeyRing('WRAPPED_KEY', { env: { WRAPPED_KEY: 'arn:key/v1' } }),
    ).rejects.toThrow(/unwrap must yield 32 bytes/);
  });

  it('calls the customer KMS once per wrapped key inside the cache window', async () => {
    let calls = 0;
    let clock = 0;
    const provider = createKmsKeyProvider(
      async (wrapped) => {
        calls += 1;
        return createHash('sha256').update(wrapped).digest();
      },
      { cacheTtlMs: 1_000, now: () => clock },
    );
    const env = { WRAPPED_KEY: 'arn:key/v1' };

    await provider.resolveKeyRing('WRAPPED_KEY', { env });
    await provider.resolveKeyRing('WRAPPED_KEY', { env });
    expect(calls).toBe(1);

    clock = 1_001;
    await provider.resolveKeyRing('WRAPPED_KEY', { env });
    expect(calls).toBe(2);
  });

  it('shares one unwrap between concurrent resolutions instead of racing the KMS', async () => {
    let calls = 0;
    const provider = createKmsKeyProvider(async (wrapped) => {
      calls += 1;
      await Promise.resolve();
      return createHash('sha256').update(wrapped).digest();
    });
    const env = { WRAPPED_KEY: 'arn:key/v1' };

    await Promise.all([
      provider.resolveKeyRing('WRAPPED_KEY', { env }),
      provider.resolveKeyRing('WRAPPED_KEY', { env }),
      provider.resolveKeyRing('WRAPPED_KEY', { env }),
    ]);

    expect(calls).toBe(1);
  });

  it('does not cache a KMS failure: the next call reaches the customer again', async () => {
    let calls = 0;
    const provider = createKmsKeyProvider(async (wrapped) => {
      calls += 1;
      if (calls === 1) throw new Error('kms unreachable');
      return createHash('sha256').update(wrapped).digest();
    });
    const env = { WRAPPED_KEY: 'arn:key/v1' };

    await expect(provider.resolveKeyRing('WRAPPED_KEY', { env })).rejects.toThrow(
      /kms unreachable/,
    );
    const ring = await provider.resolveKeyRing('WRAPPED_KEY', { env });
    expect(ring.active.material).toHaveLength(32);
    expect(calls).toBe(2);
  });

  it('derives a per-tenant ring from the unwrapped key without a second unwrap', async () => {
    let calls = 0;
    const provider = createKmsKeyProvider(async (wrapped) => {
      calls += 1;
      return createHash('sha256').update(wrapped).digest();
    });
    const env = { WRAPPED_KEY: 'arn:key/v1' };

    const orgA = await resolveTenantKeyRingAsync(provider, 'WRAPPED_KEY', 'org-a', { env });
    const orgB = await resolveTenantKeyRingAsync(provider, 'WRAPPED_KEY', 'org-b', { env });

    expect(calls).toBe(1);
    expect(orgA.active.material.equals(orgB.active.material)).toBe(false);
    const sealed = sealEnvelope(orgA, 'org-a secret', 'hex-triple');
    expect(openEnvelope(orgA, sealed, 'hex-triple').plaintext).toBe('org-a secret');
    expect(() => openEnvelope(orgB, sealed, 'hex-triple')).toThrow();
  });
});

describe('per-tenant key derivation', () => {
  it('derives different key material for different organizations', () => {
    const ring = envKeyProvider.resolveKeyRing('TEST_KEY', { env: { TEST_KEY: KEY_ONE } });

    const tenantA = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-a', {
      env: { TEST_KEY: KEY_ONE },
    });
    const tenantB = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-b', {
      env: { TEST_KEY: KEY_ONE },
    });

    expect(tenantA.active.material.equals(tenantB.active.material)).toBe(false);
    expect(tenantA.active.material.equals(ring.active.material)).toBe(false);
    expect(tenantA.active.id).toBe(ring.active.id);
  });

  it('isolates tenants: a secret sealed for one organization will not open for another', () => {
    const env = { TEST_KEY: KEY_ONE };
    const tenantA = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-a', { env });
    const tenantB = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-b', { env });

    const sealed = sealEnvelope(tenantA, 'org-a secret', 'hex-triple');

    expect(openEnvelope(tenantA, sealed, 'hex-triple').plaintext).toBe('org-a secret');
    expect(() => openEnvelope(tenantB, sealed, 'hex-triple')).toThrow();
  });

  it('derives a consistent key for the same organization across calls', () => {
    const env = { TEST_KEY: KEY_ONE };
    const first = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-a', { env });
    const second = resolveTenantKeyRing(envKeyProvider, 'TEST_KEY', 'org-a', { env });

    expect(first.active.material.equals(second.active.material)).toBe(true);
  });

  it('is off by default: a provider without deriveTenantKey refuses rather than falling back to the shared ring', () => {
    const bareProvider: KeyProvider = {
      name: 'bare',
      resolveKeyRing: (envName, options = {}) =>
        envKeyProvider.resolveKeyRing(envName, options) as ReturnType<
          typeof envKeyProvider.resolveKeyRing
        >,
    };

    expect(() =>
      resolveTenantKeyRing(bareProvider, 'TEST_KEY', 'org-a', { env: { TEST_KEY: KEY_ONE } }),
    ).toThrow(/does not support per-tenant derivation/);
  });
});
