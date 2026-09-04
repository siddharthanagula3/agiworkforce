import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetNeonDb } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetNeonDb: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';

const ORG = '11111111-1111-4111-8111-111111111111';

function policyRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: false,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    retention_enforced: false,
    external_sharing_enabled: true,
    ip_allow_list: [],
    metadata: {},
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  organizationId = ORG as string | null,
  policy = policyRow() as Record<string, unknown> | null,
  policyThrows = false,
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) {
      return organizationId ? [{ organization_id: organizationId }] : [];
    }
    if (/from public\.organization_admin_policies/i.test(text)) {
      if (policyThrows) throw new Error('connection reset');
      return policy ? [policy] : [];
    }
    return [];
  });
  mockGetNeonDb.mockReturnValue({ query: (...args: unknown[]) => mockQuery(...args) });
}

const req = () => new Request('https://app.test/api/share', { method: 'POST' }) as never;

beforeEach(() => vi.clearAllMocks());

describe('buildExternalSharingGateResponse', () => {
  it('allows a personal-scope caller, who has no workspace to be governed by', async () => {
    bind({ organizationId: null });
    expect(await buildExternalSharingGateResponse('user-1', req())).toBeNull();
  });

  it('allows a workspace that has not saved a policy', async () => {
    bind({ policy: null });
    expect(await buildExternalSharingGateResponse('user-1', req())).toBeNull();
  });

  it('allows a workspace that permits sharing', async () => {
    bind({ policy: policyRow({ external_sharing_enabled: true }) });
    expect(await buildExternalSharingGateResponse('user-1', req())).toBeNull();
  });

  it('refuses a workspace that has switched sharing off', async () => {
    bind({ policy: policyRow({ external_sharing_enabled: false }) });
    const res = await buildExternalSharingGateResponse('user-1', req());

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = (await res?.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('external_sharing_disabled');
    expect(body.error.message).toMatch(/already created are unaffected/i);
  });

  it('does not turn a policy read failure into a refusal', async () => {
    // An infrastructure fault is not an administrator's decision. Refusing here
    // would break sharing for everyone the moment the policy table blips.
    bind({ policyThrows: true });
    expect(await buildExternalSharingGateResponse('user-1', req())).toBeNull();
  });

  it('does not throw when the database is unconfigured', async () => {
    mockGetNeonDb.mockImplementation(() => {
      throw new Error('AGI_DATABASE_URL is not set');
    });
    expect(await buildExternalSharingGateResponse('user-1', req())).toBeNull();
  });
});
