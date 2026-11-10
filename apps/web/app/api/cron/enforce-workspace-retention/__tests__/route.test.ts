import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockVerifyCron, mockRecordAuditEvent } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockVerifyCron: vi.fn(() => true),
  mockRecordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockRecordAuditEvent }));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function bind({
  policies = [{ organization_id: ORG, retention_days: 90, retention_enforced: true }],
  enforced = true,
  holdsThrow = false,
  holds = [] as Record<string, unknown>[],
  deleted = [{ id: 'c1' }],
  listThrows = false,
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.organization_admin_policies/i.test(text)) {
      if (/left join lateral/i.test(text)) {
        if (listThrows) throw new Error('connection refused');
        return policies;
      }
      const [own] = policies;
      return [{ retention_days: own?.retention_days ?? 90, retention_enforced: enforced }];
    }
    if (/^\s*select count/i.test(text) && /from public\.legal_holds/i.test(text)) {
      if (holdsThrow) throw new Error('connection reset');
      return [
        {
          count: /h\.scope = \$3/.test(text)
            ? holds.filter((entry) => entry['scope'] === 'organization').length
            : holds.length,
        },
      ];
    }
    if (/custodian_user_ids/.test(text)) {
      if (holdsThrow) throw new Error('connection reset');
      return holds;
    }
    if (/insert into public\.organization_retention_sweeps/i.test(text)) return [];
    if (/delete from public\.web_conversations/i.test(text)) return deleted;
    if (/count\(\*\)/i.test(text)) return [{ count: 0 }];
    return [];
  });
}

function req(query = ''): Request {
  return new Request(`https://app.test/api/cron/enforce-workspace-retention${query}`);
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/enforce-workspace-retention', () => {
  it('refuses an unauthenticated caller', async () => {
    mockVerifyCron.mockReturnValueOnce(false);
    bind();
    expect((await GET(req() as never)).status).toBe(401);
  });

  it('sweeps an organization with a window and enforcement on', async () => {
    bind();
    const body = (await (await GET(req() as never)).json()) as {
      organizationsSwept: number;
      conversationsDeleted: number;
    };

    expect(body.organizationsSwept).toBe(1);
    expect(body.conversationsDeleted).toBe(1);
  });

  it('sweeps nothing for an organization with a window and enforcement off', async () => {
    bind({
      policies: [{ organization_id: ORG, retention_days: 90, retention_enforced: false }],
      enforced: false,
    });
    const body = (await (await GET(req() as never)).json()) as {
      organizationsConsidered: number;
      organizationsSwept: number;
      conversationsDeleted: number;
    };

    expect(body.organizationsConsidered).toBe(0);
    expect(body.organizationsSwept).toBe(0);
    expect(body.conversationsDeleted).toBe(0);
    expect(
      mockQuery.mock.calls.some((c) => /delete from public\.web_conversations/i.test(String(c[0]))),
    ).toBe(false);
    expect(
      mockQuery.mock.calls.some((c) =>
        /insert into public\.organization_retention_sweeps/i.test(String(c[0])),
      ),
    ).toBe(false);
  });

  it('never deletes for an organization the sweep itself finds not enforced', async () => {
    bind({
      policies: [{ organization_id: ORG, retention_days: 90, retention_enforced: true }],
      enforced: false,
    });
    const body = (await (await GET(req() as never)).json()) as { conversationsDeleted: number };

    expect(body.conversationsDeleted).toBe(0);
    expect(
      mockQuery.mock.calls.some((c) => /delete from public\.web_conversations/i.test(String(c[0]))),
    ).toBe(false);
  });

  it('deletes nothing anywhere when the organization list cannot be read', async () => {
    bind({ listThrows: true });
    const res = await GET(req() as never);

    expect(res.status).toBe(503);
    expect(
      mockQuery.mock.calls.some((c) => /delete from public\.web_conversations/i.test(String(c[0]))),
    ).toBe(false);
  });

  it('reports what it deleted', async () => {
    bind({ deleted: [{ id: 'c1' }, { id: 'c2' }] });
    const body = (await (await GET(req() as never)).json()) as { conversationsDeleted: number };
    expect(body.conversationsDeleted).toBe(2);
  });

  it('a dry run deletes nothing', async () => {
    bind();
    const body = (await (await GET(req('?dryRun=1') as never)).json()) as {
      dryRun: boolean;
      conversationsDeleted: number;
    };

    expect(body.dryRun).toBe(true);
    expect(body.conversationsDeleted).toBe(0);
    expect(
      mockQuery.mock.calls.some((c) => /delete from public\.web_conversations/i.test(String(c[0]))),
    ).toBe(false);
  });

  it('surfaces an abort rather than reporting a clean run', async () => {
    bind({ holdsThrow: true });
    const body = (await (await GET(req() as never)).json()) as {
      aborted: number;
      conversationsDeleted: number;
    };

    expect(body.aborted).toBe(1);
    expect(body.conversationsDeleted).toBe(0);
  });

  it('writes an audit event for a sweep that deleted something', async () => {
    bind();
    await GET(req() as never);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'retention_sweep_completed', organizationId: ORG }),
    );
  });

  it('does not audit a run that had nothing to do', async () => {
    // A nightly no-op event per workspace would bury the events that matter.
    bind({ deleted: [] });
    await GET(req() as never);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps going when one organization fails', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    let seen = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/left join lateral/i.test(text)) {
        return [
          { organization_id: ORG, retention_days: 90, retention_enforced: true },
          { organization_id: other, retention_days: 90, retention_enforced: true },
        ];
      }
      if (/from public\.organization_admin_policies/i.test(text)) {
        seen += 1;
        if (seen === 1) throw new Error('boom');
        return [{ retention_days: 90, retention_enforced: true }];
      }
      if (/^\s*select count/i.test(text) && /from public\.legal_holds/i.test(text)) {
        return [{ count: 0 }];
      }
      if (/delete from public\.web_conversations/i.test(text)) return [{ id: 'c1' }];
      if (/count\(\*\)/i.test(text)) return [{ count: 0 }];
      return [];
    });

    const body = (await (await GET(req() as never)).json()) as {
      failed: number;
      conversationsDeleted: number;
    };
    expect(body.failed).toBe(1);
    expect(body.conversationsDeleted).toBe(1);
  });
});
