import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb, mockRecordAuditEvent, mockRequireTeamAdminAccess } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockGetUserScopedDb: vi.fn(),
    mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
    mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { GET } from '../route';
import { GET as EXPORT } from '../export/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const POLICY_EXPORT_OFF = {
  organization_id: ORG,
  default_privacy_mode: 'byok',
  allowed_privacy_modes: ['local', 'byok'],
  allow_managed_compute: false,
  require_local_to_byok_preview: true,
  chat_sync_surfaces: ['web'],
  allow_cli_cloud_sync: false,
  allow_vscode_cloud_sync: false,
  allow_chrome_cloud_sync: false,
  audit_export_enabled: false,
  retention_days: 365,
  metadata: {},
  updated_at: '2026-08-23T00:00:00.000Z',
};

function auditRow() {
  return {
    id: EVENT_ID,
    organization_id: ORG,
    actor_user_id: 'user-1',
    surface: 'web',
    action: 'admin_policy_changed',
    resource_type: 'organization_admin_policy',
    resource_id: ORG,
    outcome: 'success',
    severity: 'info',
    metadata: {},
    created_at: '2026-08-23T00:00:00.000Z',
  };
}

interface Fixture {
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  policyRow?: Record<string, unknown> | null;
  events?: Record<string, unknown>[];
}

function bind({ role = 'admin', policyRow = null, events = [auditRow()] }: Fixture = {}): void {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/from public\.organization_admin_policies/i.test(text)) return policyRow ? [policyRow] : [];
    if (/from public\.enterprise_audit_events/i.test(text)) return events;
    return [];
  });
}

function req(path: string): Request {
  return new Request(`https://app.test${path}`);
}

async function readStream(res: Response): Promise<string> {
  return await res.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('GET /api/settings/organization/audit', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });

    const res = await GET(req('/api/settings/organization/audit') as never);

    expect(res.status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });

    expect((await GET(req('/api/settings/organization/audit') as never)).status).toBe(403);
  });

  it('returns events for an admin', async () => {
    bind({ role: 'admin' });

    const body = await (await GET(req('/api/settings/organization/audit') as never)).json();

    expect(body.organizationId).toBe(ORG);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe('admin_policy_changed');
  });

  it('rejects a range whose start is after its end', async () => {
    bind();

    const res = await GET(
      req(
        '/api/settings/organization/audit?from=2026-08-23T00:00:00Z&to=2026-08-01T00:00:00Z',
      ) as never,
    );

    expect(res.status).toBe(400);
  });

  it('rejects half a page cursor', async () => {
    bind();

    expect(
      (await GET(req('/api/settings/organization/audit?cursorAt=2026-08-23T00:00:00Z') as never))
        .status,
    ).toBe(400);
    expect(
      (await GET(req(`/api/settings/organization/audit?cursorId=${EVENT_ID}`) as never)).status,
    ).toBe(400);
  });

  it('rejects an unknown outcome instead of ignoring it', async () => {
    bind();

    expect(
      (await GET(req('/api/settings/organization/audit?outcome=whatever') as never)).status,
    ).toBe(400);
  });
});

describe('GET /api/settings/organization/audit/export', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });

    expect((await EXPORT(req('/api/settings/organization/audit/export') as never)).status).toBe(
      403,
    );
  });

  it('streams JSONL, one event per line', async () => {
    bind({ role: 'owner', events: [auditRow()] });

    const res = await EXPORT(req('/api/settings/organization/audit/export') as never);
    const text = await readStream(res);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(res.headers.get('Content-Disposition')).toContain('.jsonl');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).id).toBe(EVENT_ID);
  });

  it('honours a saved policy that switches export off', async () => {
    bind({ role: 'owner', policyRow: POLICY_EXPORT_OFF });

    const res = await EXPORT(req('/api/settings/organization/audit/export') as never);

    expect(res.status).toBe(403);
  });

  it('records the refusal, so a blocked export still leaves evidence', async () => {
    bind({ role: 'owner', policyRow: POLICY_EXPORT_OFF });

    await EXPORT(req('/api/settings/organization/audit/export') as never);

    const denied = mockRecordAuditEvent.mock.calls
      .map((c) => c[0] as { outcome?: string; eventType?: string })
      .find((e) => e.outcome === 'denied');
    expect(denied?.eventType).toBe('data_exported');
  });

  it('allows an unconfigured organization, matching every other policy-gated path', async () => {
    bind({ role: 'owner', policyRow: null });

    expect((await EXPORT(req('/api/settings/organization/audit/export') as never)).status).toBe(
      200,
    );
  });

  it('records the export itself as an audited act', async () => {
    bind({ role: 'owner' });

    await readStream(await EXPORT(req('/api/settings/organization/audit/export') as never));

    const success = mockRecordAuditEvent.mock.calls
      .map((c) => c[0] as { outcome?: string; eventType?: string; organizationId?: string })
      .find((e) => e.outcome === 'success');
    expect(success?.eventType).toBe('data_exported');
    expect(success?.organizationId).toBe(ORG);
  });
});
