import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const ORG_ID = '44444444-4444-4444-8444-444444444444';

const { state } = vi.hoisted(() => ({
  state: {
    membershipRole: 'owner' as string,
    policyRow: null as Record<string, unknown> | null,
    auditRows: [] as Record<string, unknown>[],
    lastRange: null as [number, number] | null,
    lastFilters: [] as Array<{ op: string; column: string; value: unknown }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  },
}));

vi.mock('../../src/lib/neonClients', () => {
  function auditQuery() {
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        state.lastFilters.push({ op: 'eq', column, value });
        return q;
      },
      lte: (column: string, value: unknown) => {
        state.lastFilters.push({ op: 'lte', column, value });
        return q;
      },
      gte: (column: string, value: unknown) => {
        state.lastFilters.push({ op: 'gte', column, value });
        return q;
      },
      order: () => q,
      range: (from: number, to: number) => {
        state.lastRange = [from, to];
        const count = to - from + 1;
        return Promise.resolve({
          data: state.auditRows.slice(from, from + count),
          error: null,
        });
      },
    };
    return q;
  }

  function from(table: string) {
    if (table === 'organization_members') {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: { role: state.membershipRole }, error: null }),
      };
      return q;
    }
    if (table === 'organization_admin_policies') {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: state.policyRow, error: null }),
      };
      return q;
    }
    if (table === 'enterprise_audit_events') {
      return auditQuery();
    }
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { account_status: 'active' }, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    };
  }

  const client = {
    from: vi.fn(from),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: 'audit-event-id', error: null };
    }),
  };

  return {
    getUserScopedClient: vi.fn(() => client),
    getSystemClient: vi.fn(() => client),
  };
});

const { enterpriseRouter } = await import('../../src/routes/enterprise');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createToken(userId: string): string {
  return jwt.sign({ userId, email: 'ent@example.com' }, process.env['JWT_SECRET'] as string, {
    algorithm: 'HS256',
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/enterprise', enterpriseRouter);
  app.use(errorHandler);
  return app;
}

function auditRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-00000000000a',
    organization_id: ORG_ID,
    actor_user_id: 'user-admin',
    surface: 'web',
    action: 'member_role_changed',
    resource_type: 'organization_member',
    resource_id: 'user-target',
    outcome: 'success',
    severity: 'info',
    metadata: { role: 'admin' },
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ENT-004: enterprise audit export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.membershipRole = 'owner';
    state.policyRow = null;
    state.auditRows = [];
    state.lastRange = null;
    state.lastFilters = [];
    state.rpcCalls = [];
  });

  it('exports audit events as NDJSON when the org policy allows it', async () => {
    state.auditRows = [auditRow(), auditRow({ id: '00000000-0000-4000-8000-00000000000b' })];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export`)
      .set('Authorization', `Bearer ${createToken('user-export-1')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.jsonl"/);
    expect(res.headers['x-audit-export-row-count']).toBe('2');
    expect(res.headers['x-audit-export-next-offset']).toBeUndefined();

    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      organization_id: ORG_ID,
      action: 'member_role_changed',
      outcome: 'success',
    });

    expect(state.lastFilters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: ORG_ID,
    });
    expect(state.lastFilters.some((f) => f.op === 'lte' && f.column === 'created_at')).toBe(true);
  });

  it('refuses the export when audit_export_enabled is false', async () => {
    state.policyRow = {
      organization_id: ORG_ID,
      default_privacy_mode: 'local',
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
      updated_at: '2026-08-01T00:00:00.000Z',
    };
    state.auditRows = [auditRow()];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export`)
      .set('Authorization', `Bearer ${createToken('user-export-2')}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUDIT_EXPORT_DISABLED');
    expect(res.text).not.toMatch(/member_role_changed/);
  });

  it('requires an organization admin role', async () => {
    state.membershipRole = 'member';
    state.auditRows = [auditRow()];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export`)
      .set('Authorization', `Bearer ${createToken('user-export-3')}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Organization admin access required');
  });

  it('emits CSV with a header and neutralises spreadsheet formula injection', async () => {
    state.auditRows = [auditRow({ actor_user_id: '=cmd|/c calc', action: '+SUM(A1)' })];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export?format=csv`)
      .set('Authorization', `Bearer ${createToken('user-export-4')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header, row] = res.text.trim().split('\n');
    expect(header).toBe(
      'id,organization_id,actor_user_id,surface,action,resource_type,resource_id,outcome,severity,metadata,created_at',
    );
    expect(row).toContain(`"'=cmd|/c calc"`);
    expect(row).toContain(`"'+SUM(A1)"`);
    expect(row).not.toContain('"=cmd');
  });

  it('pages with a pinned window end and reports the next offset', async () => {
    state.auditRows = [
      auditRow({ id: '00000000-0000-4000-8000-00000000000a' }),
      auditRow({ id: '00000000-0000-4000-8000-00000000000b' }),
      auditRow({ id: '00000000-0000-4000-8000-00000000000c' }),
    ];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export?limit=2`)
      .set('Authorization', `Bearer ${createToken('user-export-5')}`);

    expect(res.status).toBe(200);
    expect(state.lastRange).toEqual([0, 2]);
    expect(res.headers['x-audit-export-row-count']).toBe('2');
    expect(res.headers['x-audit-export-next-offset']).toBe('2');
    expect(res.headers['x-audit-export-window-end']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(res.text.trim().split('\n')).toHaveLength(2);
  });

  it('applies the from bound and records the export as an audit event', async () => {
    state.auditRows = [auditRow()];

    const res = await request(createApp())
      .get(
        `/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export` +
          `?from=2026-07-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z`,
      )
      .set('Authorization', `Bearer ${createToken('user-export-6')}`);

    expect(res.status).toBe(200);
    expect(state.lastFilters).toContainEqual({
      op: 'gte',
      column: 'created_at',
      value: '2026-07-01T00:00:00.000Z',
    });
    expect(state.lastFilters).toContainEqual({
      op: 'lte',
      column: 'created_at',
      value: '2026-08-01T00:00:00.000Z',
    });
    expect(res.headers['x-audit-export-window-end']).toBe('2026-08-01T00:00:00.000Z');

    const call = state.rpcCalls.find((c) => c.name === 'record_enterprise_audit_event');
    expect(call).toBeDefined();
    expect(call?.args).toMatchObject({
      p_organization_id: ORG_ID,
      p_actor_user_id: 'user-export-6',
      p_action: 'data_exported',
      p_resource_type: 'enterprise_audit_events',
      p_outcome: 'success',
    });
  });

  it('rejects an out-of-range limit instead of exporting the whole table', async () => {
    state.auditRows = [auditRow()];

    const res = await request(createApp())
      .get(`/api/v1/enterprise/organizations/${ORG_ID}/audit-events/export?limit=100000`)
      .set('Authorization', `Bearer ${createToken('user-export-7')}`);

    expect(res.status).toBe(400);
    expect(state.lastRange).toBeNull();
  });
});
