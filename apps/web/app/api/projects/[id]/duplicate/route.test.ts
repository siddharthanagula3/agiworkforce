import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  authUser: vi.fn(async () => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (): Promise<Response | null> => null),
  getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })),
  resolveActiveOrganizationId: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: () => mocks.rateLimit() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: (await mocks.authUser()).userId,
    organizationId: await mocks.resolveActiveOrganizationId(),
  }),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: () => mocks.getSubscription() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/projects', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mapProjectRow: (row: Record<string, unknown>) => ({ id: row['id'], name: row['name'] }),
}));

const { POST } = await import('./route');

const call = () =>
  POST(
    new NextRequest('https://agiworkforce.com/api/projects/proj-1/duplicate', { method: 'POST' }),
    { params: Promise.resolve({ id: 'proj-1' }) },
  );

const SOURCE = {
  id: 'proj-1',
  name: 'Q3 Analysis',
  description: 'desc',
  instructions: 'Always cite sources.',
  color: '#3b82f6',
  icon_emoji: 'chart',
  accent_color: 'violet',
  default_privacy_mode: 'managed',
  default_provider_mode: 'ManagedNative',
  allowed_surfaces: ['web', 'desktop'],
  default_model_id: 'some-configured-model',
  imported_from: 'claude',
  uses_global_memory: false,
};

describe('POST /api/projects/[id]/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
    mocks.resolveActiveOrganizationId.mockResolvedValue(null);
  });

  it('copies settings and knowledge files, and names the copy distinctly', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([{ id: 'kb-1' }, { id: 'kb-2' }]);

    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { copiedKnowledgeFiles?: number };
    expect(body.copiedKnowledgeFiles).toBe(2);

    const insertCall = mocks.query.mock.calls[1];
    expect(String(insertCall?.[0])).toContain('insert into user_projects');
    expect(insertCall?.[1]).toContain('Always cite sources.');
    expect(insertCall?.[1]).toContain('Q3 Analysis (copy)');
  });

  it('carries every persisted setting the source had, not just the four it used to', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([]);

    await call();

    const [insertSql, insertParams] = mocks.query.mock.calls[1] as [string, unknown[]];
    for (const column of [
      'icon_emoji',
      'accent_color',
      'default_provider_mode',
      'allowed_surfaces',
      'default_model_id',
      'imported_from',
      'uses_global_memory',
      'default_privacy_mode',
    ]) {
      expect(insertSql, `the duplicate drops ${column}`).toContain(column);
    }
    expect(insertParams).toContain('chart');
    expect(insertParams).toContain('violet');
    expect(insertParams).toContain('ManagedNative');
    expect(insertParams).toContain('some-configured-model');
    expect(insertParams).toContain('claude');
    expect(insertParams).toContainEqual(['web', 'desktop']);
    expect(insertParams).toContain(false);
  });

  it('never re-enables global memory on a project that had it off', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2' }])
      .mockResolvedValueOnce([]);

    await call();

    const [insertSql, insertParams] = mocks.query.mock.calls[1] as [string, unknown[]];
    const columns = /insert into user_projects\s*\(([^)]+)\)/i.exec(insertSql)?.[1] ?? '';
    const index = columns.split(',').findIndex((name) => name.trim() === 'uses_global_memory');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(insertParams[index]).toBe(false);
  });

  it('falls back to the base columns on a database that predates them', async () => {
    const undefinedColumn = Object.assign(new Error('column does not exist'), { code: '42703' });
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockRejectedValueOnce(undefinedColumn)
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([]);

    const res = await call();

    expect(res.status).toBe(200);
    const [retrySql] = mocks.query.mock.calls[2] as [string, unknown[]];
    expect(retrySql).toContain('insert into user_projects');
    expect(retrySql).not.toContain('icon_emoji');
  });

  it('authorizes the source and binds the copy to the active workspace', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    mocks.resolveActiveOrganizationId.mockResolvedValue(organizationId);
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([]);

    const res = await call();

    expect(res.status).toBe(200);
    const [sourceSql, sourceParams] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sourceSql).toMatch(/organization_id is not distinct from \$3::uuid/i);
    expect(sourceParams[2]).toBe(organizationId);
    const [insertSql, insertParams] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(insertSql).toMatch(/user_id, organization_id, name/i);
    expect(insertParams[1]).toBe(organizationId);
  });

  it('routes the insert through the same quota guard as create', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([]);

    await call();
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain('assert_user_resource_limit');
  });

  it('never copies conversations', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'x' }])
      .mockResolvedValueOnce([]);

    await call();
    const allSql = mocks.query.mock.calls.map((c) => String(c?.[0] ?? '')).join('\n');
    expect(allSql).not.toContain('web_conversations');
  });

  it('increments an existing copy suffix instead of stacking them', async () => {
    mocks.query
      .mockResolvedValueOnce([{ ...SOURCE, name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([{ id: 'proj-3', name: 'Q3 Analysis (copy 2)' }])
      .mockResolvedValueOnce([]);

    await call();
    expect(mocks.query.mock.calls[1]?.[1]).toContain('Q3 Analysis (copy 2)');
  });

  it('is owner-only', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('refuses when the plan allows no projects', async () => {
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'unknown-tier' });
    mocks.query.mockResolvedValueOnce([SOURCE]);

    const res = await call();
    expect(res.status).toBe(400);
  });

  it('still returns the project when the file copy fails', async () => {
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'x' }])
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));

    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { copiedKnowledgeFiles?: number };
    expect(body.copiedKnowledgeFiles).toBe(0);
  });
});
