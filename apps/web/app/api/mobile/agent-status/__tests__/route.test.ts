import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequireCurrentUserId, mockNeonQuery } = vi.hoisted(() => ({
  mockRequireCurrentUserId: vi.fn(),
  mockNeonQuery: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/neon-chat', () => ({
  requireCurrentUserId: mockRequireCurrentUserId,
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockNeonQuery(...args) },
    userId: await mockRequireCurrentUserId(),
    organizationId: null,
  })),
}));

import { GET } from '../route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const CHECKPOINT_ID = '0190a000-0000-7000-8000-000000000002';

function makeRequest() {
  return new Request('http://localhost:3000/api/mobile/agent-status', {
    method: 'GET',
  }) as never;
}

function pauseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHECKPOINT_ID,
    run_id: RUN_ID,
    checkpoint_kind: 'approval',
    pending_tool_calls: [{ id: 'call-1', qualifiedName: 'mcp__github__read_file', args: {} }],
    created_at: '2026-07-17T20:00:01.000Z',
    model: 'claude-test',
    ...overrides,
  };
}

/** The route issues the pause query first, then the running-run count. */
function respondWith(pauses: unknown[], running: number) {
  mockNeonQuery.mockImplementation((sql: string) =>
    /cloud_agent_approval_checkpoints/i.test(sql)
      ? Promise.resolve(pauses)
      : Promise.resolve([{ running }]),
  );
}

describe('GET /api/mobile/agent-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUserId.mockResolvedValue('user-1');
  });

  it('scopes both the checkpoint and the run it is joined to the caller', async () => {
    respondWith([pauseRow()], 2);

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);

    const [sql, params] = mockNeonQuery.mock.calls.find(([statement]) =>
      /cloud_agent_approval_checkpoints/i.test(statement as string),
    ) as [string, unknown[]];

    expect(sql).toMatch(/checkpoint\.user_id = \$1/i);
    expect(sql).toMatch(/runs\.user_id = \$1/i);
    expect(sql).toMatch(/runs\.user_id = checkpoint\.user_id/i);
    expect(sql).toMatch(/checkpoint\.state = 'pending'/i);
    expect(params[0]).toBe('user-1');

    const countCall = mockNeonQuery.mock.calls.find(
      ([statement]) => !/cloud_agent_approval_checkpoints/i.test(statement as string),
    ) as [string, unknown[]];
    expect(countCall[0]).toMatch(/user_id = \$1/i);
    expect(countCall[1][0]).toBe('user-1');
  });

  it('returns the caller pauses in the shape the background task reads', async () => {
    respondWith([pauseRow(), pauseRow({ id: RUN_ID, checkpoint_kind: 'input' })], 3);

    const response = await GET(makeRequest());
    const body = (await response.json()) as {
      pendingApprovals: Array<Record<string, unknown>>;
      runningAgents: number;
    };

    expect(body.runningAgents).toBe(3);
    expect(body.pendingApprovals).toEqual([
      {
        id: CHECKPOINT_ID,
        runId: RUN_ID,
        kind: 'approval',
        toolName: 'mcp__github__read_file',
        toolCount: 1,
        model: 'claude-test',
        requestedAt: '2026-07-17T20:00:01.000Z',
      },
      {
        id: RUN_ID,
        runId: RUN_ID,
        kind: 'input',
        toolName: 'mcp__github__read_file',
        toolCount: 1,
        model: 'claude-test',
        requestedAt: '2026-07-17T20:00:01.000Z',
      },
    ]);
  });

  it('reports an empty status rather than inventing one when nothing is paused', async () => {
    respondWith([], 0);

    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toEqual({ pendingApprovals: [], runningAgents: 0 });
  });

  it('refuses an unauthenticated caller before touching the database', async () => {
    mockRequireCurrentUserId.mockRejectedValue(new Error('Unauthorized'));

    await GET(makeRequest());

    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('does not leak a database failure to the caller', async () => {
    mockNeonQuery.mockRejectedValue(new Error('neon down'));

    const response = await GET(makeRequest());

    expect(response.status).toBeGreaterThanOrEqual(500);
    await expect(response.text()).resolves.not.toMatch(/neon down/i);
  });
});
