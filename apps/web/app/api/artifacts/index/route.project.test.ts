import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  scopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mocks.scopedDb(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET } = await import('./route');

const PROJECT = '44444444-4444-4444-8444-444444444444';

function call(query = '') {
  return GET(new NextRequest(`https://agiworkforce.com/api/artifacts/index${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue(null);
  mocks.query.mockResolvedValue([
    {
      id: '55555555-5555-4555-8555-555555555555',
      conversation_id: '66666666-6666-4666-8666-666666666666',
      message_id: '77777777-7777-4777-8777-777777777777',
      title: 'Quarterly plan',
      artifact_type: 'document',
      language: 'md',
      project_id: PROJECT,
      created_at: '2026-09-13T00:00:00.000Z',
    },
  ]);
  mocks.scopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/artifacts/index', () => {
  it('derives the project from the source conversation rather than a column on the row', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { artifacts: { projectId: string | null }[] };
    expect(body.artifacts[0]?.projectId).toBe(PROJECT);

    const [sql] = mocks.query.mock.calls[0]!;
    expect(String(sql)).toContain('join web_conversations conversations');
    expect(String(sql)).toContain('conversations.project_id');
  });

  it('scopes to one project when asked, still bound to the caller', async () => {
    await call(`?projectId=${PROJECT}`);

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(String(sql)).toContain('conversations.project_id = $3::uuid');
    expect(params).toEqual(['user-1', 200, PROJECT]);
  });

  it('passes a null project filter when none is asked for', async () => {
    await call();
    expect(mocks.query.mock.calls[0]![1]).toEqual(['user-1', 200, null]);
  });

  it('skips deleted conversations so a removed chat takes its artifacts out of the list', async () => {
    await call();
    expect(String(mocks.query.mock.calls[0]![0])).toContain('conversations.deleted_at is null');
  });

  it('rejects a project id that is not a uuid', async () => {
    const response = await call('?projectId=not-a-uuid');
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
