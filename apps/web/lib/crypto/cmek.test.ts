import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  CmekProviderUnconfiguredError,
  CustomerKeyRevokedError,
  CustomerKeyUnavailableError,
  createCustomerKeyRingResolver,
  SupportAccessRequiredError,
  createLocalCmekProvider,
  platformTenantKeyRing,
  resolveOrganizationKeyRing,
  type CmekKeyDescriptor,
  type CmekProvider,
  type OrganizationKeyRecord,
} from './cmek';
import { openEnvelope, sealEnvelope } from './envelope';

const PLATFORM_KEY_ENV = 'TEST_PLATFORM_KEY';
const PLATFORM_ENV = { [PLATFORM_KEY_ENV]: 'ab'.repeat(32) };

const DESCRIPTOR: CmekKeyDescriptor = {
  provider: 'local',
  keyUri: 'local://org-a/kek',
  region: 'us-east-1',
};

function localProvider(failFor?: (keyUri: string) => Error | null): CmekProvider {
  return createLocalCmekProvider(
    randomBytes(32),
    failFor ? { nodeEnv: 'test', failFor } : { nodeEnv: 'test' },
  );
}

async function recordFor(
  provider: CmekProvider,
  organizationId = 'org-a',
): Promise<{ record: OrganizationKeyRecord; plaintext: Buffer }> {
  const { wrapped, plaintext } = await provider.generateDataKey(DESCRIPTOR);
  return {
    plaintext,
    record: {
      organizationId,
      descriptor: DESCRIPTOR,
      status: 'active',
      active: { version: '1', wrapped },
      retired: [],
    },
  };
}

describe('the local CMEK double', () => {
  it('refuses to exist in a production deployment, where the key must not be ours', () => {
    expect(() => createLocalCmekProvider(randomBytes(32), { nodeEnv: 'production' })).toThrow(
      /test double/i,
    );
  });

  it('round-trips a data key it wrapped', async () => {
    const provider = localProvider();
    const { wrapped, plaintext } = await provider.generateDataKey(DESCRIPTOR);
    const unwrapped = await provider.unwrapDataKey(DESCRIPTOR, wrapped);
    expect(unwrapped.equals(plaintext)).toBe(true);
  });

  it('will not unwrap a key wrapped under a different customer key', async () => {
    const provider = localProvider();
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    await expect(
      provider.unwrapDataKey({ ...DESCRIPTOR, keyUri: 'local://org-b/kek' }, wrapped),
    ).rejects.toThrow();
  });
});

describe('resolving a customer-managed ring', () => {
  it('seals and opens under the data key the customer’s KEK wraps', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const resolve = createCustomerKeyRingResolver({ local: provider });

    const ring = await resolve(record);
    const sealed = sealEnvelope(ring, 'workspace secret', 'hex-triple');
    expect(openEnvelope(await resolve(record), sealed, 'hex-triple').plaintext).toBe(
      'workspace secret',
    );
  });

  it('opens a ciphertext sealed under the previous data key after a rotation', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const resolve = createCustomerKeyRingResolver({ local: provider });
    const sealedUnderV1 = sealEnvelope(await resolve(record), 'older secret', 'hex-triple');

    const rotated = await provider.generateDataKey(DESCRIPTOR);
    const rotatedRecord: OrganizationKeyRecord = {
      ...record,
      active: { version: '2', wrapped: rotated.wrapped },
      retired: [record.active],
    };

    expect(openEnvelope(await resolve(rotatedRecord), sealedUnderV1, 'hex-triple').plaintext).toBe(
      'older secret',
    );
  });

  it('refuses a revoked association without calling the customer’s KMS at all', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    const resolve = createCustomerKeyRingResolver({ local: provider });

    await expect(resolve({ ...record, status: 'revoked' })).rejects.toBeInstanceOf(
      CustomerKeyRevokedError,
    );
    expect(unwrap).not.toHaveBeenCalled();
  });

  it('fails closed when the customer’s KMS will not answer, naming no key material', async () => {
    const provider = localProvider((keyUri) =>
      keyUri === DESCRIPTOR.keyUri ? new Error('AccessDeniedException: grant revoked') : null,
    );
    const reachable = localProvider();
    const { record } = await recordFor(reachable);
    const resolve = createCustomerKeyRingResolver({ local: provider });

    const error = await resolve(record).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomerKeyUnavailableError);
    expect((error as CustomerKeyUnavailableError).organizationId).toBe('org-a');
    expect(String(error)).not.toContain(record.active.wrapped);
    expect(String(error)).toMatch(/refused rather than served with a platform key/);
  });

  it('refuses a provider this deployment has no client for, rather than substituting one', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const resolve = createCustomerKeyRingResolver({});

    await expect(resolve(record)).rejects.toBeInstanceOf(CmekProviderUnconfiguredError);
    await expect(
      resolve({ ...record, descriptor: { ...DESCRIPTOR, provider: 'aws_kms' } }),
    ).rejects.toThrow(/aws_kms/);
  });

  it('keeps two organizations on their own key even under one provider client', async () => {
    const provider = localProvider();
    const a = await recordFor(provider, 'org-a');
    const b = await recordFor(provider, 'org-b');
    const resolve = createCustomerKeyRingResolver({ local: provider });

    const sealedForA = sealEnvelope(await resolve(a.record), 'a only', 'hex-triple');
    await expect(
      resolve(b.record).then((ring) => openEnvelope(ring, sealedForA, 'hex-triple')),
    ).rejects.toThrow();
  });

  it('unwraps once for repeated resolutions inside the cache window', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    const resolve = createCustomerKeyRingResolver({ local: provider }, { cacheTtlMs: 60_000 });

    await resolve(record);
    await resolve(record);

    expect(unwrap).toHaveBeenCalledTimes(1);
  });

  it('reaches the customer again once the cache window passes, so a revocation lands', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    let clock = 0;
    const resolve = createCustomerKeyRingResolver(
      { local: provider },
      { cacheTtlMs: 1_000, now: () => clock },
    );

    await resolve(record);
    clock = 1_001;
    await resolve(record);

    expect(unwrap).toHaveBeenCalledTimes(2);
  });
});

describe('which ring an organization gets', () => {
  it('derives from the platform root for a tenant that brought no key of its own', async () => {
    const resolved = await resolveOrganizationKeyRing('org-a', {
      loadRecord: async () => null,
      resolveCustomerRing: async () => {
        throw new Error('must not be reached');
      },
      platformEnvName: PLATFORM_KEY_ENV,
      env: PLATFORM_ENV,
    });

    expect(resolved.source).toBe('platform_derived');
    expect(resolved.descriptor).toBeNull();
    const direct = platformTenantKeyRing(PLATFORM_KEY_ENV, 'org-a', { env: PLATFORM_ENV });
    expect(resolved.ring.active.material.equals(direct.active.material)).toBe(true);
  });

  it('keeps two platform tenants apart, which is what the derivation is for', async () => {
    const a = platformTenantKeyRing(PLATFORM_KEY_ENV, 'org-a', { env: PLATFORM_ENV });
    const b = platformTenantKeyRing(PLATFORM_KEY_ENV, 'org-b', { env: PLATFORM_ENV });
    const sealed = sealEnvelope(a, 'a only', 'hex-triple');

    expect(openEnvelope(a, sealed, 'hex-triple').plaintext).toBe('a only');
    expect(() => openEnvelope(b, sealed, 'hex-triple')).toThrow();
  });

  it('uses the customer key and reports it, once the association exists', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);
    const resolveCustomerRing = createCustomerKeyRingResolver({ local: provider });

    const resolved = await resolveOrganizationKeyRing('org-a', {
      loadRecord: async () => record,
      resolveCustomerRing,
      platformEnvName: PLATFORM_KEY_ENV,
      env: PLATFORM_ENV,
    });

    expect(resolved.source).toBe('customer_managed');
    expect(resolved.descriptor).toEqual(DESCRIPTOR);
    expect(resolved.keyVersion).toBe('1');
  });

  it('does not fall back to the platform root when the customer key is gone', async () => {
    const provider = localProvider(() => new Error('NotFoundException'));
    const reachable = localProvider();
    const { record } = await recordFor(reachable);

    await expect(
      resolveOrganizationKeyRing('org-a', {
        loadRecord: async () => record,
        resolveCustomerRing: createCustomerKeyRingResolver({ local: provider }),
        platformEnvName: PLATFORM_KEY_ENV,
        env: PLATFORM_ENV,
      }),
    ).rejects.toBeInstanceOf(CustomerKeyUnavailableError);
  });
});

describe('an operator has no standing of its own', () => {
  const gateError = new Error('no approved, unexpired grant covers it');

  it('refuses a support principal outright when no gate is wired', async () => {
    await expect(
      resolveOrganizationKeyRing(
        'org-a',
        {
          loadRecord: async () => null,
          resolveCustomerRing: createCustomerKeyRingResolver({}),
          platformEnvName: PLATFORM_KEY_ENV,
          env: PLATFORM_ENV,
        },
        { kind: 'support', userId: 'user_support_a', scope: 'conversations' },
      ),
    ).rejects.toBeInstanceOf(SupportAccessRequiredError);
  });

  it('closes the platform-key bypass: a non-CMEK tenant is unreadable without a grant', async () => {
    const deps = {
      loadRecord: async () => null,
      resolveCustomerRing: createCustomerKeyRingResolver({}),
      platformEnvName: PLATFORM_KEY_ENV,
      env: PLATFORM_ENV,
      assertSupportAccess: async () => {
        throw gateError;
      },
    };

    const tenantRing = await resolveOrganizationKeyRing('org-a', deps);
    expect(tenantRing.source).toBe('platform_derived');
    const sealed = sealEnvelope(tenantRing.ring, 'the tenant plaintext');

    await expect(
      resolveOrganizationKeyRing('org-a', deps, {
        kind: 'support',
        userId: 'user_support_a',
        scope: 'conversations',
      }),
    ).rejects.toBe(gateError);
    expect(sealed).not.toContain('the tenant plaintext');
  });

  it('gates the customer-managed path on the same grant', async () => {
    const provider = localProvider();
    const { record } = await recordFor(provider);

    await expect(
      resolveOrganizationKeyRing(
        'org-a',
        {
          loadRecord: async () => record,
          resolveCustomerRing: createCustomerKeyRingResolver({ local: provider }),
          platformEnvName: PLATFORM_KEY_ENV,
          env: PLATFORM_ENV,
          assertSupportAccess: async () => {
            throw gateError;
          },
        },
        { kind: 'support', userId: 'user_support_a', scope: 'conversations' },
      ),
    ).rejects.toBe(gateError);
  });

  it('serves a support principal the grant covers, and says which key source it used', async () => {
    const seen: Array<{ organizationId: string; scope: string }> = [];
    const resolved = await resolveOrganizationKeyRing(
      'org-a',
      {
        loadRecord: async () => null,
        resolveCustomerRing: createCustomerKeyRingResolver({}),
        platformEnvName: PLATFORM_KEY_ENV,
        env: PLATFORM_ENV,
        assertSupportAccess: async (organizationId, principal) => {
          seen.push({ organizationId, scope: principal.scope });
        },
      },
      { kind: 'support', userId: 'user_support_a', scope: 'conversations' },
    );

    expect(resolved.source).toBe('platform_derived');
    expect(seen).toEqual([{ organizationId: 'org-a', scope: 'conversations' }]);
  });
});
