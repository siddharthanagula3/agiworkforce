import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ recordAuditEvent: vi.fn(async () => undefined) }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...(args as [])),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createLocalCmekProvider, type CmekKeyDescriptor } from '@/lib/crypto/cmek';
import { WORKSPACE_SEALED_STORES } from '@/lib/crypto/connector-secret-reseal';
import {
  buildCmekProviderRegistry,
  countPlatformSealedRows,
  provisionOrganizationKey,
  readKeyRewrapRun,
  readOrganizationKeyRecord,
  readOrganizationKeyStatus,
  replaceOrganizationKey,
  retireOrganizationKeyVersion,
  revokeOrganizationKey,
  rotateOrganizationKey,
  runOrganizationKeyRewrap,
  validateOrganizationKeySetup,
} from './organization-encryption-keys';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'user_abc';
const DESCRIPTOR: CmekKeyDescriptor = {
  provider: 'local',
  keyUri: 'local://acme/kek',
  region: 'us-east-1',
};

// The home region must resolve and must declare which KMS regions it admits, or
// every activation below is refused before it reaches the provider.
const REGION_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
  AGI_DATA_REGION_US_KMS_REGION: 'us-east-1',
  // The platform ring every workspace without a key of its own is derived from.
  CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY: 'cd'.repeat(32),
};

function row(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    provider: 'local',
    key_uri: DESCRIPTOR.keyUri,
    key_region: DESCRIPTOR.region,
    status: 'active',
    key_version: '1',
    wrapped_data_key: 'AAAABBBB',
    retired_keys: [],
    last_rotated_at: null,
    revoked_at: null,
    ...over,
  };
}

function harness(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => rows);
  const execute = vi.fn(async () => undefined);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

const EVERY_SEALED_STORE = WORKSPACE_SEALED_STORES.map((store) => `${store.table}.${store.column}`);

function rewrapRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    from_key_version: '1',
    to_key_version: '2',
    state: 'complete',
    scanned: 4,
    resealed: 4,
    remaining: 0,
    failure_count: 0,
    covered_stores: EVERY_SEALED_STORE,
    last_error: null,
    started_at: '2026-09-17T00:00:00.000Z',
    completed_at: '2026-09-17T00:05:00.000Z',
    ...over,
  };
}

/** Routes by statement, because the lifecycle calls read three tables. */
function routed(opts: {
  keyRow?: Record<string, unknown> | null;
  rewrap?: Record<string, unknown> | null;
  dataRegion?: string | null;
}) {
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (/from public\.organizations\b/i.test(text)) {
      return [
        {
          data_region: opts.dataRegion ?? null,
          data_region_requested: null,
          data_region_requested_at: null,
        },
      ];
    }
    if (/from public\.organization_key_rewrap_runs/i.test(text)) {
      return opts.rewrap ? [opts.rewrap] : [];
    }
    if (/from public\.organization_encryption_keys/i.test(text)) {
      return opts.keyRow === null ? [] : [opts.keyRow ?? row()];
    }
    return [];
  });
  const execute = vi.fn(async (sql: string, params?: unknown[]) => {
    executed.push({ sql: String(sql), params: params ?? [] });
  });
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute, executed };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('reading a key association', () => {
  it('returns null for a workspace that never brought a key', async () => {
    const h = harness([]);
    await expect(readOrganizationKeyRecord(h.db, ORG)).resolves.toBeNull();
  });

  it('refuses a row naming a provider this build cannot resolve', async () => {
    const h = harness([row({ provider: 'hsm_from_the_future' })]);
    await expect(readOrganizationKeyRecord(h.db, ORG)).rejects.toThrow(
      /cannot resolve|hsm_from_the_future/,
    );
  });

  it('reads retired versions whether the driver hands back jsonb or a string', async () => {
    const parsed = await readOrganizationKeyRecord(
      harness([row({ retired_keys: [{ version: '1', wrapped: 'CCCC' }] })]).db,
      ORG,
    );
    const asText = await readOrganizationKeyRecord(
      harness([row({ retired_keys: '[{"version":"1","wrapped":"CCCC"}]' })]).db,
      ORG,
    );
    expect(parsed?.retired).toEqual([{ version: '1', wrapped: 'CCCC' }]);
    expect(asText?.retired).toEqual(parsed?.retired);
  });
});

describe('the provider registry this deployment can build', () => {
  it('has no client for either real KMS, because it holds no customer credentials', () => {
    const registry = buildCmekProviderRegistry({ NODE_ENV: 'development' });
    expect(registry.aws_kms).toBeUndefined();
    expect(registry.gcp_kms).toBeUndefined();
  });

  it('will not build even the local double for a production deployment', () => {
    const registry = buildCmekProviderRegistry({
      NODE_ENV: 'production',
      AGI_CMEK_LOCAL_ROOT: '11'.repeat(32),
    });
    expect(registry.local).toBeUndefined();
  });
});

describe('status, without throwing at an administrator', () => {
  it('reports the platform path, having actually derived that workspace’s own ring', async () => {
    const h = harness([]);
    const status = await readOrganizationKeyStatus(h.db, ORG, {
      env: { CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) },
    });
    expect(status.availability).toEqual({ state: 'platform_derived', keyId: '1' });
    expect(status.status).toBeNull();
  });

  it('reports a deployment with no platform key ring as unconfigured, not as derived', async () => {
    const h = harness([]);
    const status = await readOrganizationKeyStatus(h.db, ORG, { env: {} });
    expect(status.availability).toEqual({ state: 'platform_unconfigured' });
  });

  it('reports a revoked association as revoked', async () => {
    const h = harness([row({ status: 'revoked', revoked_at: '2026-09-16T00:00:00.000Z' })]);
    const status = await readOrganizationKeyStatus(h.db, ORG, { registry: {} });
    expect(status.availability.state).toBe('revoked');
    expect(status.revokedAt).toBe('2026-09-16T00:00:00.000Z');
  });

  it('reports an unconfigured provider as unavailable rather than as the platform key', async () => {
    const h = harness([row()]);
    const status = await readOrganizationKeyStatus(h.db, ORG, { registry: {} });
    expect(status.availability.state).toBe('unavailable');
  });

  it('reports a reachable customer key with its version and region', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const h = harness([row({ wrapped_data_key: wrapped })]);

    const status = await readOrganizationKeyStatus(h.db, ORG, { registry: { local: provider } });

    expect(status.availability).toEqual({
      state: 'customer_managed',
      descriptor: DESCRIPTOR,
      keyVersion: '1',
    });
  });
});

describe('provisioning, rotation and revocation are audited', () => {
  it('records the provider and version on provisioning, never the key material', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({ keyRow: null });

    await provisionOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      descriptor: DESCRIPTOR,
      provider,
      keyVersion: '1',
      env: REGION_ENV,
    });

    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('encryption_key_provisioned');
    expect(event['organizationId']).toBe(ORG);
    const detail = event['detail'] as Record<string, unknown>;
    expect(detail['keyProvider']).toBe('local');
    expect(detail['keyVersion']).toBe('1');
    const wrapped = (h.execute.mock.calls[0] as unknown as [string, unknown[]])[1][5];
    expect(JSON.stringify(event)).not.toContain(String(wrapped));
  });

  it('refuses enrolment while rows are still sealed under the platform ring', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const query = vi.fn(async (sql: string) => {
      const text = String(sql);
      if (/from public\.organizations\b/i.test(text)) {
        return [{ data_region: null, data_region_requested: null, data_region_requested_at: null }];
      }
      if (/count\(\*\)::int as sealed/i.test(text)) return [{ sealed: 3 }];
      return [];
    });
    const execute = vi.fn(async () => undefined);
    const db = { query, execute } as unknown as DatabaseAdapter;

    await expect(
      provisionOrganizationKey({
        db,
        organizationId: ORG,
        actorUserId: ACTOR,
        descriptor: DESCRIPTOR,
        provider,
        keyVersion: '1',
        env: REGION_ENV,
      }),
    ).rejects.toThrow(/3 row\(s\) in .* sealed under the platform key/);
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('counts nothing to strand for a workspace that has sealed nothing yet', async () => {
    const h = routed({ keyRow: null });
    await expect(countPlatformSealedRows(h.db, ORG, REGION_ENV)).resolves.toEqual([]);
  });

  it('retires the previous version on rotation so older ciphertext still opens', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = harness([]);
    const record = {
      organizationId: ORG,
      descriptor: DESCRIPTOR,
      status: 'active' as const,
      active: { version: '1', wrapped: 'AAAA' },
      retired: [{ version: '0', wrapped: 'ZZZZ' }],
    };

    const result = await rotateOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      descriptor: DESCRIPTOR,
      provider,
      keyVersion: '2',
      record,
      env: REGION_ENV,
    });

    expect(result.retiredVersions).toEqual(['1', '0']);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('encryption_key_rotated');
  });

  it('refuses to rotate a revoked association', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = harness([]);

    await expect(
      rotateOrganizationKey({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        descriptor: DESCRIPTOR,
        provider,
        keyVersion: '2',
        record: {
          organizationId: ORG,
          descriptor: DESCRIPTOR,
          status: 'revoked',
          active: { version: '1', wrapped: 'AAAA' },
          retired: [],
        },
      }),
    ).rejects.toThrow(/revoked/i);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('records a revocation as critical, naming the version it ended', async () => {
    const h = harness([{ key_version: '3' }]);

    const result = await revokeOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      reason: 'customer withdrew the grant',
    });

    expect(result.revoked).toBe(true);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('encryption_key_revoked');
    expect(event['severity']).toBe('critical');
    expect((event['detail'] as Record<string, unknown>)['keyVersion']).toBe('3');
  });

  it('still revokes when the association row is one this build cannot parse', async () => {
    // The pre-read exists only to purge cached material precisely. A revocation
    // that a malformed row could block would be the worst possible failure.
    const h = harness([row({ provider: 'hsm_from_the_future', key_version: '3' })]);

    const result = await revokeOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      reason: 'customer withdrew the grant',
    });

    expect(result.revoked).toBe(true);
  });

  it('writes no audit row when there was nothing to revoke', async () => {
    const h = harness([]);
    const result = await revokeOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      reason: 'already revoked',
    });
    expect(result.revoked).toBe(false);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('the key region a workspace admits', () => {
  it('refuses to provision a key outside the regions the workspace is pinned to', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});

    await expect(
      provisionOrganizationKey({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        descriptor: { ...DESCRIPTOR, region: 'eu-central-1' },
        provider,
        keyVersion: '1',
        env: REGION_ENV,
      }),
    ).rejects.toThrow(/eu-central-1|region/i);
    expect(h.execute).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses when the deployment has declared no key-management region at all', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});

    await expect(
      provisionOrganizationKey({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        descriptor: DESCRIPTOR,
        provider,
        keyVersion: '1',
        env: { DATABASE_URL: REGION_ENV.DATABASE_URL },
      }),
    ).rejects.toThrow();
    expect(h.execute).not.toHaveBeenCalled();
  });
});

describe('the registry reaches the vendors this deployment holds credentials for', () => {
  it('builds an AWS client once its credentials are present', () => {
    const registry = buildCmekProviderRegistry({
      NODE_ENV: 'development',
      AGI_KMS_AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      AGI_KMS_AWS_SECRET_ACCESS_KEY: 'secret-material-not-a-key',
    });
    expect(registry.aws_kms?.id).toBe('aws_kms');
    expect(registry.gcp_kms).toBeUndefined();
  });
});

describe('validating a customer key before activation', () => {
  it('passes for a reachable key in an admitted region', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});

    const validation = await validateOrganizationKeySetup(h.db, ORG, DESCRIPTOR, {
      registry: { local: provider },
      env: REGION_ENV,
    });

    expect(validation.ok).toBe(true);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('fails on the region the workspace does not admit, and writes nothing', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});

    const validation = await validateOrganizationKeySetup(
      h.db,
      ORG,
      { ...DESCRIPTOR, region: 'eu-central-1' },
      { registry: { local: provider }, env: REGION_ENV },
    );

    expect(validation.ok).toBe(false);
    expect(validation.checks.find((check) => check.id === 'key_region')?.state).toBe('fail');
  });
});

describe('a key version cannot be dropped out of the ring on an assurance', () => {
  const ringRow = row({
    key_version: '2',
    retired_keys: [{ version: '1', wrapped: 'AAAA' }],
  });

  it('refuses when no rewrap has ever moved the data off it', async () => {
    const h = routed({ keyRow: ringRow, rewrap: null });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '1',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(/No rewrap has moved/i);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('refuses while rows are still sealed under it', async () => {
    const h = routed({
      keyRow: ringRow,
      rewrap: rewrapRow({ state: 'failed', remaining: 12, completed_at: null }),
    });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '1',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(/12 row\(s\)/);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('refuses a rewrap that targeted a key version the workspace has since rotated off', async () => {
    const h = routed({ keyRow: ringRow, rewrap: rewrapRow({ to_key_version: '1b' }) });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '1',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(/Rewrap onto the current key/i);
  });

  it('refuses to drop the active version, which would leave nothing to seal with', async () => {
    const h = routed({ keyRow: ringRow, rewrap: rewrapRow() });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '2',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(/is the active one/i);
  });

  it('refuses a run that walked only some of the stores sealed under the version', async () => {
    const h = routed({
      keyRow: ringRow,
      rewrap: rewrapRow({ covered_stores: ['public.other.col'] }),
    });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '1',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(new RegExp(`never walked ${EVERY_SEALED_STORE[0]?.replace(/\./g, '\\.')}`));
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('refuses a run filed before the store it never knew about was declared', async () => {
    const h = routed({ keyRow: ringRow, rewrap: rewrapRow({ covered_stores: [] }) });

    await expect(
      retireOrganizationKeyVersion({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        keyVersion: '1',
        reason: 'housekeeping',
      }),
    ).rejects.toThrow(/unreadable for good/);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('drops it once a complete rewrap onto the current key says so, and records it as critical', async () => {
    const h = routed({ keyRow: ringRow, rewrap: rewrapRow() });

    const result = await retireOrganizationKeyVersion({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      keyVersion: '1',
      reason: 'grant withdrawn at the vendor',
    });

    expect(result.retainedVersions).toEqual([]);
    const write = h.executed[0];
    expect(write?.sql).toMatch(/update public\.organization_encryption_keys/i);
    expect(write?.params[1]).toBe('[]');
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['severity']).toBe('critical');
    expect((event['detail'] as Record<string, unknown>)['status']).toBe('retired');
  });
});

describe('running the rewrap', () => {
  it('opens the run, closes it complete, and never claims a version it did not reach', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const h = routed({
      keyRow: row({ key_version: '2', wrapped_data_key: wrapped, retired_keys: [] }),
    });
    const store = {
      name: 'secrets',
      countSealedUnder: async () => 0,
      readSealedUnder: async () => [],
      writeResealed: async () => undefined,
    };

    const outcome = await runOrganizationKeyRewrap({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      fromVersion: '1',
      stores: [store],
      registry: { local: provider },
      env: REGION_ENV,
    });

    expect(outcome.complete).toBe(true);
    expect(outcome.toVersion).toBe('2');
    expect(h.executed[0]?.sql).toMatch(/insert into public\.organization_key_rewrap_runs/i);
    expect(h.executed[0]?.params[3]).toBe(ACTOR);
    expect(h.executed[1]?.sql).toMatch(/update public\.organization_key_rewrap_runs/i);
    expect(h.executed[1]?.params[3]).toBe('complete');
  });

  it('refuses to rewrap for a workspace whose association is revoked', async () => {
    const h = routed({
      keyRow: row({ status: 'revoked', revoked_at: '2026-09-17T00:00:00.000Z' }),
    });

    await expect(
      runOrganizationKeyRewrap({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        fromVersion: '1',
        stores: [
          {
            name: 'secrets',
            countSealedUnder: async () => 0,
            readSealedUnder: async () => [],
            writeResealed: async () => undefined,
          },
        ],
        registry: {},
      }),
    ).rejects.toThrow(/revoked/i);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('reads back the run a retirement will be gated on', async () => {
    const h = routed({ rewrap: rewrapRow() });
    const run = await readKeyRewrapRun(h.db, ORG, '1');
    expect(run).toMatchObject({
      fromVersion: '1',
      toVersion: '2',
      state: 'complete',
      remaining: 0,
    });
  });
});

describe('replacing the key resource, which rotation does not do', () => {
  const record = {
    organizationId: ORG,
    descriptor: DESCRIPTOR,
    status: 'active' as const,
    active: { version: '1', wrapped: 'AAAA' },
    retired: [],
  };

  it('refuses a replacement that names the key the workspace already uses', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});

    await expect(
      replaceOrganizationKey({
        db: h.db,
        organizationId: ORG,
        actorUserId: ACTOR,
        descriptor: DESCRIPTOR,
        provider,
        keyVersion: '2',
        record,
        env: REGION_ENV,
      }),
    ).rejects.toThrow(/Rotate it instead/i);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('moves the association onto the new key and keeps the previous version readable', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const h = routed({});
    const next = { ...DESCRIPTOR, keyUri: 'local://acme/kek-2' };

    const result = await replaceOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      descriptor: next,
      provider,
      keyVersion: '2',
      record,
      env: REGION_ENV,
    });

    expect(result).toEqual({ keyVersion: '2', previousVersion: '1' });
    const write = h.executed[0];
    expect(write?.sql).toMatch(/set\s+provider = \$2/i);
    expect(write?.params[2]).toBe('local://acme/kek-2');
    expect(JSON.parse(String(write?.params[6]))).toEqual([{ version: '1', wrapped: 'AAAA' }]);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect((event['detail'] as Record<string, unknown>)['status']).toBe('replaced');
  });
});

describe('a customer-side revocation is not hidden by the ring cache', () => {
  it('asks the KMS on every status read rather than trusting cached material', async () => {
    const provider = createLocalCmekProvider(randomBytes(32), { nodeEnv: 'test' });
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const unwrap = vi.spyOn(provider, 'unwrapDataKey');
    const h = routed({ keyRow: row({ wrapped_data_key: wrapped }) });

    await readOrganizationKeyStatus(h.db, ORG, { registry: { local: provider } });
    await readOrganizationKeyStatus(h.db, ORG, { registry: { local: provider } });

    expect(unwrap).toHaveBeenCalledTimes(2);
  });

  it('reports the key as unavailable the moment the customer pulls the grant', async () => {
    let reachable = true;
    const provider = createLocalCmekProvider(randomBytes(32), {
      nodeEnv: 'test',
      failFor: () => (reachable ? null : new Error('AccessDeniedException: grant revoked')),
    });
    const { wrapped } = await provider.generateDataKey(DESCRIPTOR);
    const h = routed({ keyRow: row({ wrapped_data_key: wrapped }) });

    const before = await readOrganizationKeyStatus(h.db, ORG, { registry: { local: provider } });
    reachable = false;
    const after = await readOrganizationKeyStatus(h.db, ORG, { registry: { local: provider } });

    expect(before.availability.state).toBe('customer_managed');
    expect(after.availability.state).toBe('unavailable');
  });
});
