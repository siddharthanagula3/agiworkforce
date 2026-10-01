import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/security-audit');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
  getTeamAdminAccess: vi.fn(async () => ({ canManageTeam: true })),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: mocks.getTeamAdminAccess,
  requireTeamAdminAccess: vi.fn(),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import { hashAdminApiKey } from '../admin-api-keys';
import { resolveComplianceCaller } from '../compliance-caller';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = '33333333-3333-4333-8333-333333333333';
const KEY = `agiadm_AbCdEf12_${'x'.repeat(43)}`;

function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    organization_id: ORG,
    key_hash: hashAdminApiKey(KEY),
    scopes: ['audit.read'],
    service_principal_id: PRINCIPAL,
    principal_name: 'SIEM exporter',
    principal_max_scopes: ['audit.read'],
    principal_disabled_at: null,
    ...over,
  };
}

function policyRow(ipAllowList: string[]) {
  return {
    organization_id: ORG,
    default_privacy_mode: 'standard',
    allowed_privacy_modes: ['standard'],
    allow_managed_compute: true,
    require_local_to_byok_preview: false,
    chat_sync_surfaces: [],
    allow_cli_cloud_sync: true,
    allow_vscode_cloud_sync: true,
    allow_chrome_cloud_sync: true,
    audit_export_enabled: true,
    retention_days: null,
    retention_enforced: false,
    external_sharing_enabled: true,
    allow_memory: true,
    metadata: { ipAllowList },
    updated_at: '2026-09-20T00:00:00.000Z',
  };
}

function answer(keys: unknown[], policies: unknown[] = []) {
  mocks.query.mockImplementation(async (sql: string) =>
    String(sql).includes('from public.organization_admin_policies') ? policies : keys,
  );
}

function request(token: string, clientIp?: string) {
  return new Request('https://app.test/api/settings/organization/audit', {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(clientIp ? { 'x-real-ip': clientIp } : {}),
    },
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearIpAllowListCacheForTests();
  mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: true });
});

describe('workspace API key authentication', () => {
  it('authenticates a scoped key as a service principal without a user session', async () => {
    answer([keyRow()]);

    const caller = await resolveComplianceCaller(request(KEY), 'audit.read', 'denied');

    expect(caller).toMatchObject({
      kind: 'service_principal',
      organizationId: ORG,
      actorUserId: `service_principal:${PRINCIPAL}`,
      servicePrincipalId: PRINCIPAL,
      keyId: 'key-1',
      role: 'service_principal',
    });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([hashAdminApiKey(KEY)]);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/revoked_at is null/);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a key that is not scoped for the permission asked', async () => {
    answer([keyRow({ scopes: ['billing.read'], principal_max_scopes: ['billing.read'] })]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a scope the principal no longer allows, even when the key still carries it', async () => {
    answer([keyRow({ scopes: ['audit.read'], principal_max_scopes: ['billing.read'] })]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses every key issued to a disabled principal', async () => {
    answer([keyRow({ principal_disabled_at: '2026-09-18T00:00:00.000Z' })]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a revoked, expired or unknown key', async () => {
    answer([]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('never falls back to the interactive cookie when a bearer token is presented', async () => {
    answer([]);

    await expect(
      resolveComplianceCaller(request('not-a-workspace-key'), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a key for a workspace that lost its team entitlement', async () => {
    answer([keyRow()]);
    mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: false });

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('honours a legacy scope for the namespaced permission a route asks for', async () => {
    answer([keyRow()]);

    await expect(
      resolveComplianceCaller(request(KEY), 'admin.audit.view', 'denied'),
    ).resolves.toMatchObject({ kind: 'service_principal', keyId: 'key-1' });
  });

  it('refuses a key presented from outside the workspace IP allow list and records it', async () => {
    answer([keyRow()], [policyRow(['198.51.100.0/24'])]);

    await expect(
      resolveComplianceCaller(request(KEY, '203.0.113.9'), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ip_not_allowed',
        organizationId: ORG,
        userId: `service_principal:${PRINCIPAL}`,
        outcome: 'denied',
      }),
    );
  });

  it('admits a key presented from inside the workspace IP allow list', async () => {
    answer([keyRow()], [policyRow(['198.51.100.0/24'])]);

    await expect(
      resolveComplianceCaller(request(KEY, '198.51.100.7'), 'audit.read', 'denied'),
    ).resolves.toMatchObject({ kind: 'service_principal' });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a key when the workspace allow list cannot be read', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from public.organization_admin_policies')) {
        throw new Error('database unavailable');
      }
      return [keyRow()];
    });

    await expect(
      resolveComplianceCaller(request(KEY, '198.51.100.7'), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
