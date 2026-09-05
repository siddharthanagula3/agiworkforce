import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));

const { mockLogSecurityEvent } = vi.hoisted(() => ({
  mockLogSecurityEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: (...args: unknown[]) => mockLogSecurityEvent(...(args as [])),
  getClientIp: () => '203.0.113.7',
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { authUser, assertAccountActive } = vi.hoisted(() => ({
  authUser: { current: { userId: 'admin-1' } as { userId: string } | null },
  assertAccountActive: vi.fn(async () => undefined),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: async () => {
    if (!authUser.current) throw new Error('unauthenticated');
    return authUser.current;
  },
  assertAccountActive: (...args: unknown[]) => assertAccountActive(...(args as [])),
}));

const { db } = vi.hoisted(() => ({ db: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db.current }));

import { NextRequest } from 'next/server';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { GET, POST } from '../route';

const OPEN_ID = '11111111-1111-4111-8111-111111111111';
const STALE_ID = '22222222-2222-4222-8222-222222222222';
const OPERATOR_ID = 'admin-1';
const ORG_OWNER_ID = 'org-owner-1';

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

afterEach(() => {
  if (originalAllowlist === undefined) {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
  } else {
    process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
  }
});

type Row = Record<string, unknown>;

function seed(): Row[] {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: OPEN_ID,
      client_report_id: 'rep-open',
      user_id: 'user-reporter',
      message_id: 'msg-1',
      conversation_id: 'conv-1',
      category: 'harmful',
      content_excerpt: 'model told me to do something dangerous',
      user_note: 'this should not be answerable',
      status: 'received',
      reviewer_id: null,
      reviewer_note: null,
      reviewed_at: null,
      created_at: hourAgo,
    },
    {
      id: STALE_ID,
      client_report_id: 'rep-stale',
      user_id: null,
      message_id: 'msg-2',
      conversation_id: 'conv-2',
      category: 'offensive',
      content_excerpt: 'slur in the answer',
      user_note: '',
      status: 'received',
      reviewer_id: null,
      reviewer_note: null,
      reviewed_at: null,
      created_at: threeDaysAgo,
    },
  ];
}

function fakeDb(rows: Row[]) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.trimStart();

      if (normalized.startsWith('update')) {
        const row = rows.find((candidate) => candidate['id'] === params[0]);
        if (!row) return [];
        row['status'] = params[1];
        row['reviewer_id'] = params[2];
        row['reviewer_note'] = params[3];
        if (params[4]) row['reviewed_at'] = new Date().toISOString();
        return [row];
      }

      if (normalized.includes('group by status')) {
        const slaHours = Number(params[0]);
        const cutoff = Date.now() - slaHours * 60 * 60 * 1000;
        const grouped = new Map<string, Row[]>();
        for (const row of rows) {
          const status = String(row['status']);
          grouped.set(status, [...(grouped.get(status) ?? []), row]);
        }
        return Array.from(grouped.entries()).map(([status, group]) => ({
          status,
          report_count: group.length,
          oldest_at: group
            .map((row) => String(row['created_at']))
            .sort()
            .at(0),
          overdue_count: group.filter(
            (row) => new Date(String(row['created_at'])).getTime() < cutoff,
          ).length,
        }));
      }

      const statuses = params[0] as string[];
      return rows
        .filter((row) => statuses.includes(String(row['status'])))
        .sort(
          (a, b) =>
            new Date(String(a['created_at'])).getTime() -
            new Date(String(b['created_at'])).getTime(),
        );
    }),
    execute: vi.fn(async () => 0),
  };
}

function queueRequest(query = '?status=received,in_review') {
  return new NextRequest(`https://app.test/api/admin/content-reports${query}`);
}

function reviewRequest(body: unknown) {
  return new NextRequest('https://app.test/api/admin/content-reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/admin/content-reports', () => {
  let rows: Row[];
  let store: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    rows = seed();
    store = fakeDb(rows);
    db.current = store;
    process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
    authUser.current = { userId: OPERATOR_ID };
    mockLogSecurityEvent.mockClear();
    assertAccountActive.mockClear();
  });

  it('hands a reviewer the open queue oldest-first with SLA state', async () => {
    const response = await GET(queueRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      reports: Array<{ id: string; overdue: boolean; dueAt: string }>;
      counts: { received: number; overdue: number; slaHours: number };
    };

    expect(body.reports.map((report) => report.id)).toEqual([STALE_ID, OPEN_ID]);
    expect(body.reports[0]?.overdue).toBe(true);
    expect(body.reports[1]?.overdue).toBe(false);
    expect(body.counts).toMatchObject({ received: 2, overdue: 1, slaHours: 24 });
  });

  it('refuses an org admin who is not a platform operator', async () => {
    authUser.current = { userId: ORG_OWNER_ID };

    expect((await GET(queueRequest())).status).toBe(404);
    expect(store.query).not.toHaveBeenCalled();
  });

  it('refuses everyone when no operator allowlist is configured', async () => {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];

    expect((await GET(queueRequest())).status).toBe(404);
    expect(store.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/content-reports', () => {
  let rows: Row[];
  let store: ReturnType<typeof fakeDb>;

  beforeEach(() => {
    rows = seed();
    store = fakeDb(rows);
    db.current = store;
    process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
    authUser.current = { userId: OPERATOR_ID };
    mockLogSecurityEvent.mockClear();
    assertAccountActive.mockClear();
  });

  it('records a disposition and drops the report out of the open queue', async () => {
    const response = await POST(
      reviewRequest({
        reportId: OPEN_ID,
        status: 'actioned',
        reviewerNote: 'answer removed and model guardrail filed',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      report: { id: OPEN_ID, status: 'actioned', reviewerId: 'admin-1' },
    });

    const queue = (await (await GET(queueRequest())).json()) as { reports: Array<{ id: string }> };
    expect(queue.reports.map((report) => report.id)).toEqual([STALE_ID]);
  });

  it('audits who resolved the report and why', async () => {
    await POST(
      reviewRequest({
        reportId: OPEN_ID,
        status: 'dismissed',
        reviewerNote: 'not a policy breach',
      }),
    );

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        eventType: 'admin_action',
        details: expect.objectContaining({
          action: 'content_report_review',
          reportId: OPEN_ID,
          status: 'dismissed',
          reviewerNote: 'not a policy breach',
        }),
      }),
    );
  });

  it('refuses to resolve a report without a reviewer note', async () => {
    const response = await POST(reviewRequest({ reportId: OPEN_ID, status: 'dismissed' }));

    expect(response.status).toBe(400);
    expect(rows[0]?.['status']).toBe('received');
  });

  it('refuses an org admin who is not a platform operator and leaves the report unreviewed', async () => {
    authUser.current = { userId: ORG_OWNER_ID };

    const response = await POST(
      reviewRequest({ reportId: OPEN_ID, status: 'actioned', reviewerNote: 'malicious' }),
    );

    expect(response.status).toBe(404);
    expect(rows[0]?.['status']).toBe('received');
    expect(store.query).not.toHaveBeenCalled();
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  it('404s on a report id that does not exist', async () => {
    const response = await POST(
      reviewRequest({
        reportId: '33333333-3333-4333-8333-333333333333',
        status: 'actioned',
        reviewerNote: 'x',
      }),
    );

    expect(response.status).toBe(404);
  });
});
