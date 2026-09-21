import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createCustomerKeyRingResolver,
  createLocalCmekProvider,
  type CmekKeyDescriptor,
  type CmekProvider,
  type OrganizationKeyRecord,
} from './cmek';
import {
  CmekNoSealedStoreError,
  CmekRewrapIncompleteError,
  assertRewrapComplete,
  runKeyRewrap,
  validateCmekKeyUri,
  validateCmekSetup,
  type RewrapEntry,
  type RewrapStore,
} from './cmek-lifecycle';
import { openEnvelope, sealEnvelope, type KeyRing } from './envelope';

const DESCRIPTOR: CmekKeyDescriptor = {
  provider: 'local',
  keyUri: 'local://acme/kek',
  region: 'us-east-1',
};

function localProvider(failFor?: (keyUri: string) => Error | null): CmekProvider {
  return createLocalCmekProvider(
    randomBytes(32),
    failFor ? { nodeEnv: 'test', failFor } : { nodeEnv: 'test' },
  );
}

function stateOf(
  validation: Awaited<ReturnType<typeof validateCmekSetup>>,
  id: string,
): string | undefined {
  return validation.checks.find((check) => check.id === id)?.state;
}

describe('the key name a customer types', () => {
  it('accepts an AWS key ARN whose region matches the association', () => {
    expect(
      validateCmekKeyUri({
        provider: 'aws_kms',
        keyUri: 'arn:aws:kms:us-east-1:123456789012:key/2f1c-aaaa',
        region: 'us-east-1',
      }).ok,
    ).toBe(true);
  });

  it('refuses an ARN whose region contradicts the association, which would sign for the wrong host', () => {
    const result = validateCmekKeyUri({
      provider: 'aws_kms',
      keyUri: 'arn:aws:kms:eu-west-1:123456789012:key/2f1c-aaaa',
      region: 'us-east-1',
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/eu-west-1/);
  });

  it('accepts a GCP crypto key path and refuses anything shorter', () => {
    expect(
      validateCmekKeyUri({
        provider: 'gcp_kms',
        keyUri: 'projects/p/locations/us-east-1/keyRings/r/cryptoKeys/k',
        region: 'us-east-1',
      }).ok,
    ).toBe(true);
    expect(
      validateCmekKeyUri({
        provider: 'gcp_kms',
        keyUri: 'projects/p/locations/us-east-1/keyRings/r',
        region: 'us-east-1',
      }).ok,
    ).toBe(false);
  });

  it('refuses a Key Vault URL carrying a query string, which the adapter appends its own', () => {
    const result = validateCmekKeyUri({
      provider: 'azure_key_vault',
      keyUri: 'https://acme.vault.azure.net/keys/main?api-version=7.3',
      region: 'eastus',
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/query string/);
  });

  it('refuses a Key Vault key addressed over plain http', () => {
    expect(
      validateCmekKeyUri({
        provider: 'azure_key_vault',
        keyUri: 'http://acme.vault.azure.net/keys/main',
        region: 'eastus',
      }).ok,
    ).toBe(false);
  });
});

describe('validating a customer key before anything is sealed under it', () => {
  it('passes every check against a key the customer can actually use', async () => {
    const validation = await validateCmekSetup({
      descriptor: DESCRIPTOR,
      registry: { local: localProvider() },
      admittedRegions: ['us-east-1'],
    });

    expect(validation.ok).toBe(true);
    expect(validation.checks.every((check) => check.state === 'pass')).toBe(true);
  });

  it('fails on the region a residency pin does not admit, without calling the KMS', async () => {
    const provider = localProvider();
    const generate = vi.spyOn(provider, 'generateDataKey');

    const validation = await validateCmekSetup({
      descriptor: DESCRIPTOR,
      registry: { local: provider },
      admittedRegions: ['eu-central-1'],
    });

    expect(validation.ok).toBe(false);
    expect(stateOf(validation, 'key_region')).toBe('fail');
    expect(stateOf(validation, 'generate_data_key')).toBe('skipped');
    expect(generate).not.toHaveBeenCalled();
  });

  it('fails on a provider this deployment holds no credentials for', async () => {
    const validation = await validateCmekSetup({ descriptor: DESCRIPTOR, registry: {} });

    expect(validation.ok).toBe(false);
    expect(stateOf(validation, 'provider_client')).toBe('fail');
    expect(stateOf(validation, 'key_uri')).toBe('skipped');
  });

  it('reports the grant failure as a check rather than throwing at a setup screen', async () => {
    const validation = await validateCmekSetup({
      descriptor: DESCRIPTOR,
      registry: {
        local: localProvider(() => new Error('AccessDeniedException: no grant on the key')),
      },
      admittedRegions: ['us-east-1'],
    });

    expect(validation.ok).toBe(false);
    expect(stateOf(validation, 'generate_data_key')).toBe('fail');
    expect(validation.checks.find((check) => check.id === 'generate_data_key')?.detail).toMatch(
      /AccessDeniedException/,
    );
  });

  it('never repeats key material back into a check detail', async () => {
    const provider = localProvider();
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const validation = await validateCmekSetup({
      descriptor: DESCRIPTOR,
      registry: { local: provider },
      admittedRegions: ['us-east-1'],
    });

    expect(JSON.stringify(validation)).not.toContain(wrapped);
  });
});

function ringPair(): { current: KeyRing; previous: KeyRing } {
  const older = { id: '1', material: randomBytes(32) };
  const newer = { id: '2', material: randomBytes(32) };
  return {
    current: { active: newer, retired: [older] },
    previous: { active: older, retired: [] },
  };
}

function memoryStore(name: string, entries: RewrapEntry[]): RewrapStore & { rows: RewrapEntry[] } {
  const rows = entries.map((entry) => ({ ...entry }));
  return {
    name,
    rows,
    async countSealedUnder(keyVersion) {
      return rows.filter((row) => row.sealed.startsWith(`v1.${keyVersion}.`)).length;
    },
    async readSealedUnder(keyVersion, limit) {
      return rows.filter((row) => row.sealed.startsWith(`v1.${keyVersion}.`)).slice(0, limit);
    },
    async writeResealed(next) {
      for (const entry of next) {
        const target = rows.find((row) => row.id === entry.id);
        if (target) target.sealed = entry.sealed;
      }
    },
  };
}

describe('moving ciphertext off a key version before it is disabled', () => {
  it('reseals every row under the active key and reports nothing left', async () => {
    const { current, previous } = ringPair();
    const store = memoryStore('secrets', [
      { id: 'a', sealed: sealEnvelope(previous, 'first') },
      { id: 'b', sealed: sealEnvelope(previous, 'second') },
    ]);

    const outcome = await runKeyRewrap({ ring: current, fromVersion: '1', stores: [store] });

    expect(outcome.resealed).toBe(2);
    expect(outcome.remaining).toBe(0);
    expect(outcome.complete).toBe(true);
    expect(store.rows.every((row) => row.sealed.startsWith('v1.2.'))).toBe(true);
    expect(() => assertRewrapComplete(outcome)).not.toThrow();
  });

  it('binds a row sealed before its context existed, so it stops opening under any other', async () => {
    const { current, previous } = ringPair();
    const store = memoryStore('secrets', [
      { id: 'a', sealed: sealEnvelope(previous, 'legacy secret'), context: 'tenant:a' },
    ]);

    await runKeyRewrap({ ring: current, fromVersion: '1', stores: [store] });

    const sealed = store.rows[0]?.sealed ?? '';
    const bound = { value: 'tenant:a', acceptUnbound: false };
    expect(openEnvelope(current, sealed, 'hex-triple', bound)).toMatchObject({
      plaintext: 'legacy secret',
      contextBound: true,
    });
    expect(() =>
      openEnvelope(current, sealed, 'hex-triple', { value: 'tenant:b', acceptUnbound: true }),
    ).toThrow();
  });

  it('carries the plaintext across unchanged, which is the only thing that matters', async () => {
    const { current, previous } = ringPair();
    const store = memoryStore('secrets', [{ id: 'a', sealed: sealEnvelope(previous, 'a secret') }]);

    await runKeyRewrap({ ring: current, fromVersion: '1', stores: [store] });

    expect(
      openEnvelope(current, (store.rows[0] as RewrapEntry).sealed, 'hex-triple').plaintext,
    ).toBe('a secret');
  });

  it('records a row it cannot open instead of stopping, and refuses to call the run complete', async () => {
    const { current, previous } = ringPair();
    const store = memoryStore('secrets', [
      { id: 'a', sealed: sealEnvelope(previous, 'fine') },
      { id: 'corrupt', sealed: 'v1.1.AAAA.BBBB.CCCC' },
    ]);

    const outcome = await runKeyRewrap({ ring: current, fromVersion: '1', stores: [store] });

    expect(outcome.resealed).toBe(1);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]?.id).toBe('corrupt');
    expect(outcome.complete).toBe(false);
    expect(() => assertRewrapComplete(outcome)).toThrow(CmekRewrapIncompleteError);
  });

  it('refuses a run with no store declared rather than reporting a completion it never made', async () => {
    await expect(
      runKeyRewrap({ ring: ringPair().current, fromVersion: '1', stores: [] }),
    ).rejects.toBeInstanceOf(CmekNoSealedStoreError);
  });

  it('refuses to rewrap a version onto itself', async () => {
    const store = memoryStore('secrets', []);
    await expect(
      runKeyRewrap({ ring: ringPair().current, fromVersion: '2', stores: [store] }),
    ).rejects.toThrow(/source and destination/i);
  });

  it('names the remainder in the refusal, so an operator knows what disabling the key would cost', () => {
    const error = new CmekRewrapIncompleteError({
      fromVersion: '1',
      toVersion: '2',
      scanned: 10,
      resealed: 7,
      remaining: 3,
      complete: false,
      failures: [],
    });
    expect(error.message).toMatch(/3 row\(s\)/);
    expect(error.message).toMatch(/unreadable/);
  });
});

describe('a revocation does not wait for the cache window', () => {
  it('forgets the unwrapped material on demand, so the next open goes back to the KMS', async () => {
    const provider = localProvider();
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const record: OrganizationKeyRecord = {
      organizationId: 'org-a',
      descriptor: DESCRIPTOR,
      status: 'active',
      active: { version: '1', wrapped },
      retired: [],
    };
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    const resolve = createCustomerKeyRingResolver({ local: provider }, { cacheTtlMs: 600_000 });

    await resolve(record);
    await resolve(record);
    expect(unwrap).toHaveBeenCalledTimes(1);

    resolve.invalidate(record);
    await resolve(record);

    expect(unwrap).toHaveBeenCalledTimes(2);
  });

  it('forgets retired versions too, or a rotation would leave older material live', async () => {
    const provider = localProvider();
    const first = await provider.generateDataKey(DESCRIPTOR);
    const second = await provider.generateDataKey(DESCRIPTOR);
    const record: OrganizationKeyRecord = {
      organizationId: 'org-a',
      descriptor: DESCRIPTOR,
      status: 'active',
      active: { version: '2', wrapped: second.wrapped },
      retired: [{ version: '1', wrapped: first.wrapped }],
    };
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    const resolve = createCustomerKeyRingResolver({ local: provider }, { cacheTtlMs: 600_000 });

    await resolve(record);
    expect(unwrap).toHaveBeenCalledTimes(2);

    resolve.invalidate(record);
    await resolve(record);

    expect(unwrap).toHaveBeenCalledTimes(4);
  });
});
