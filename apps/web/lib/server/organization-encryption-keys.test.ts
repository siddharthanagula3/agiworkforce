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
import {
  buildCmekProviderRegistry,
  provisionOrganizationKey,
  readOrganizationKeyRecord,
  readOrganizationKeyStatus,
  revokeOrganizationKey,
  rotateOrganizationKey,
} from './organization-encryption-keys';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'user_abc';
const DESCRIPTOR: CmekKeyDescriptor = {
  provider: 'local',
  keyUri: 'local://acme/kek',
  region: 'us-east-1',
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
    const h = harness([]);

    await provisionOrganizationKey({
      db: h.db,
      organizationId: ORG,
      actorUserId: ACTOR,
      descriptor: DESCRIPTOR,
      provider,
      keyVersion: '1',
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
