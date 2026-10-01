import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MICROUSD_PER_CREDIT, type OrganizationRole } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/security-audit');
type ScanModule3 = typeof import('@/lib/server/neon-db');
type ScanModule4 = typeof import('@/lib/server/rls-db');
type ScanModule5 = typeof import('@/lib/server/request-context-cache');
type ScanModule6 = typeof import('@/lib/services/organization-permission-service');

vi.mock('server-only', () => ({}));

const session = vi.hoisted(() => ({ userId: 'user-admin', role: 'admin' as OrganizationRole }));
const state = vi.hoisted(() => ({ db: null as unknown }));
const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  teamAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getNeonDb: () => state.db,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  ...(await import('../../__tests__/workspace-admin-api-world')).permissionServiceMock(session),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: mocks.teamAccess,
  requireTeamAdminAccess: mocks.teamAccess,
}));

import { createError } from '@/lib/errors';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import { USAGE_MAX_WINDOW_DAYS } from '@/lib/services/usage-aggregation';
import {
  KEY_ACTOR,
  ORG,
  createWorkspaceAdminDb,
  defaultWorld,
  keyHeaders,
  type WorkspaceAdminWorld,
} from '../../__tests__/workspace-admin-api-world';
import { GET } from '../route';

const URL_BASE = 'https://app.test/api/settings/organization/usage-report';

let world: WorkspaceAdminWorld;

interface ReportPage {
  data: Array<{
    startingAt: string;
    endingAt: string;
    results: Array<{
      userId: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      credits: number;
    }>;
  }>;
  hasMore: boolean;
  nextPage: string | null;
}

function get(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${URL_BASE}${query}`, { headers });
}

function dataAccessEvents() {
  return mocks.recordAuditEvent.mock.calls
    .map(([event]) => event as Record<string, unknown>)
    .filter((event) => event['eventType'] === 'data_accessed');
}

function usageQuery() {
  const db = state.db as { query: { mock: { calls: Array<[string, unknown[]]> } } };
  return db.query.mock.calls.find(([sql]) => sql.includes('from public.managed_usage_requests'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  clearIpAllowListCacheForTests();
  session.userId = 'user-admin';
  session.role = 'admin';
  world = defaultWorld();
  world.usageRows = [
    {
      day: '2026-09-21',
      user_id: 'user-member',
      requests: 3,
      input_tokens: '1200',
      output_tokens: '300',
      cost_microusd: String(2.5 * MICROUSD_PER_CREDIT),
    },
    {
      day: '2026-09-21',
      user_id: 'user-viewer',
      requests: 1,
      input_tokens: '90',
      output_tokens: '10',
      cost_microusd: '7550',
    },
  ];
  state.db = createWorkspaceAdminDb(world);
  mocks.getUserScopedDb.mockImplementation(async () => ({
    db: state.db,
    userId: session.userId,
    organizationId: ORG,
  }));
  mocks.teamAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/settings/organization/usage-report', () => {
  it('refuses a caller with neither a session nor a workspace API key', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    expect((await GET(get('?from=2026-09-20'))).status).toBe(401);
  });

  it('reports each member per day in credits from the exact settled microUSD', async () => {
    const response = await GET(get('?from=2026-09-20'));

    expect(response.status).toBe(200);
    const page = (await response.json()) as ReportPage;
    const day = page.data.find((bucket) => bucket.startingAt === '2026-09-21T00:00:00.000Z');
    expect(day?.endingAt).toBe('2026-09-22T00:00:00.000Z');
    expect(day?.results).toEqual([
      {
        userId: 'user-member',
        requests: 3,
        inputTokens: 1200,
        outputTokens: 300,
        credits: 2.5,
      },
      {
        userId: 'user-viewer',
        requests: 1,
        inputTokens: 90,
        outputTokens: 10,
        credits: 7550 / MICROUSD_PER_CREDIT,
      },
    ]);
    expect(JSON.stringify(page)).not.toMatch(/cost|cents|usd|\$/i);
  });

  it('pages by day buckets and hands back the next page until the window ends', async () => {
    const first = (await (await GET(get('?from=2026-09-20'))).json()) as ReportPage;

    expect(first.data.map((bucket) => bucket.startingAt.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ]);
    expect(first).toMatchObject({ hasMore: true, nextPage: '2026-09-27T00:00:00.000Z' });
    expect(usageQuery()?.[1]).toEqual([
      ORG,
      '2026-09-20T00:00:00.000Z',
      '2026-09-27T00:00:00.000Z',
    ]);

    const second = (await (
      await GET(get(`?from=2026-09-20&page=${encodeURIComponent(first.nextPage!)}`))
    ).json()) as ReportPage;
    expect(second.data.map((bucket) => bucket.startingAt.slice(0, 10))).toEqual(['2026-09-27']);
    expect(second).toMatchObject({ hasMore: false, nextPage: null });
  });

  it('treats to as an exclusive end', async () => {
    const page = (await (
      await GET(get('?from=2026-09-20&to=2026-09-24T00:00:00.000Z'))
    ).json()) as ReportPage;

    expect(page.data.map((bucket) => bucket.startingAt.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(page.hasMore).toBe(false);
  });

  it('records a data access event for every page it serves', async () => {
    await GET(get('?from=2026-09-20'));
    await GET(get('?from=2026-09-20&page=2026-09-27T00:00:00.000Z'));

    const events = dataAccessEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      userId: 'user-admin',
      organizationId: ORG,
      detail: expect.objectContaining({ resourceType: 'organization_usage_report' }),
    });
  });

  it('serves a workspace API key scoped for billing and records the key as the reader', async () => {
    const response = await GET(get('?from=2026-09-20', keyHeaders()));

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(dataAccessEvents()[0]).toMatchObject({ userId: KEY_ACTOR });
  });

  it('refuses a workspace API key scoped only for members', async () => {
    world.keyScopes = ['admin.members.manage'];

    const response = await GET(get('?from=2026-09-20', keyHeaders()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('not scoped for admin.billing.view');
    expect(usageQuery()).toBeUndefined();
  });

  it('refuses a member whose role cannot view billing', async () => {
    session.userId = 'user-member';
    session.role = 'member';

    const response = await GET(get('?from=2026-09-20'));

    expect(response.status).toBe(403);
    expect(usageQuery()).toBeUndefined();
  });

  it.each([
    ['without from', ''],
    ['with an unreadable from', '?from=yesterday'],
    ['with from after to', '?from=2026-09-25&to=2026-09-21'],
    ['with a page that is not a bucket boundary', '?from=2026-09-20&page=2026-09-22T06:00:00.000Z'],
    ['with a page outside the window', '?from=2026-09-20&page=2026-09-10T00:00:00.000Z'],
    ['with too many buckets per page', '?from=2026-09-20&limit=32'],
    ['with an unknown parameter', '?from=2026-09-20&member=user-member'],
  ])('rejects a report request %s', async (_label, query) => {
    const response = await GET(get(query));

    expect(response.status).toBe(400);
    expect(usageQuery()).toBeUndefined();
  });

  it('refuses a window wider than the published maximum', async () => {
    const to = '2026-09-27T00:00:00.000Z';
    const from = new Date(Date.parse(to) - (USAGE_MAX_WINDOW_DAYS + 1) * 86_400_000).toISOString();

    const response = await GET(
      get(`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(`at most ${USAGE_MAX_WINDOW_DAYS} days`);
    expect(usageQuery()).toBeUndefined();
  });
});
