import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionRows: vi.fn(),
  decisionRows: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));

const { readOrganizationActivityDays } = await import('../organization-activity-service');

const ORG = '11111111-1111-4111-8111-111111111111';
const WINDOW = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' };
const scopedDb = { query: (...args: unknown[]) => mocks.query(...args) } as never;

function statement(fragment: string): [string, unknown[]] {
  const call = mocks.query.mock.calls.find(([sql]) => String(sql).includes(fragment));
  if (!call) throw new Error(`no statement containing ${fragment}`);
  return call as [string, unknown[]];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionRows.mockReturnValue([]);
  mocks.decisionRows.mockReturnValue([]);
  mocks.query.mockImplementation(async (sql: string) =>
    String(sql).includes('app_org_code_tool_decision_days')
      ? mocks.decisionRows()
      : mocks.sessionRows(),
  );
});

describe('readOrganizationActivityDays', () => {
  it('merges code sessions and tool decisions into one row per day', async () => {
    mocks.sessionRows.mockReturnValue([
      { day: new Date('2026-10-20T00:00:00.000Z'), sessions: 4 },
      { day: '2026-10-21T00:00:00.000Z', sessions: '2' },
    ]);
    mocks.decisionRows.mockReturnValue([
      { day: '2026-10-19T00:00:00.000Z', accepted: 1, rejected: 0 },
      { day: new Date('2026-10-20T00:00:00.000Z'), accepted: '3', rejected: '1' },
    ]);

    await expect(readOrganizationActivityDays(scopedDb, ORG, WINDOW)).resolves.toEqual([
      {
        day: '2026-10-19T00:00:00.000Z',
        codeSessions: 0,
        toolDecisions: { accepted: 1, rejected: 0 },
        toolAcceptanceRate: 1,
      },
      {
        day: '2026-10-20T00:00:00.000Z',
        codeSessions: 4,
        toolDecisions: { accepted: 3, rejected: 1 },
        toolAcceptanceRate: 0.75,
      },
      {
        day: '2026-10-21T00:00:00.000Z',
        codeSessions: 2,
        toolDecisions: { accepted: 0, rejected: 0 },
        toolAcceptanceRate: null,
      },
    ]);
  });

  it('returns no rows rather than zero-filled days when nothing was recorded', async () => {
    await expect(readOrganizationActivityDays(scopedDb, ORG, WINDOW)).resolves.toEqual([]);
  });

  it('counts the workspace’s code sessions through the permission-checked database function', async () => {
    await readOrganizationActivityDays(scopedDb, ORG, WINDOW);

    const [sql, params] = statement('app_org_code_session_days');
    expect(sql).toContain(
      'public.app_org_code_session_days($1::uuid, $2::timestamptz, $3::timestamptz)',
    );
    expect(sql).not.toMatch(/managed_usage_requests/);
    expect(params).toEqual([ORG, WINDOW.from, WINDOW.to]);
  });

  it('reads tool decisions through the permission-checked database function', async () => {
    await readOrganizationActivityDays(scopedDb, ORG, WINDOW);

    const [sql, params] = statement('app_org_code_tool_decision_days');
    expect(sql).toContain(
      'public.app_org_code_tool_decision_days($1::uuid, $2::timestamptz, $3::timestamptz)',
    );
    expect(sql).not.toMatch(/cloud_code_agent/);
    expect(params).toEqual([ORG, WINDOW.from, WINDOW.to]);
  });
});
