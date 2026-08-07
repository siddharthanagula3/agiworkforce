/**
 * Project duplication.
 *
 * There was no way to branch a project: starting a variant meant recreating
 * instructions by hand and re-uploading every knowledge file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  authUser: vi.fn(async () => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (): Promise<Response | null> => null),
  getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: () => mocks.authUser() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: () => mocks.rateLimit() }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: () => mocks.getSubscription() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/projects', () => ({
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
};

describe('POST /api/projects/[id]/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
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
    // The tuned configuration is the point of duplicating.
    expect(insertCall?.[1]).toContain('Always cite sources.');
    expect(insertCall?.[1]).toContain('Q3 Analysis (copy)');
  });

  it('routes the insert through the same quota guard as create', async () => {
    // A duplicate that bypassed the project quota would be a trivial way around
    // a paid limit.
    mocks.query
      .mockResolvedValueOnce([SOURCE])
      .mockResolvedValueOnce([{ id: 'proj-2', name: 'Q3 Analysis (copy)' }])
      .mockResolvedValueOnce([]);

    await call();
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain('assert_user_resource_limit');
  });

  it('never copies conversations', async () => {
    // A conversation is a record of something that happened, not configuration;
    // copying it would fabricate history in the new project.
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
    // The project is real and usable; rolling back a successful create because
    // the file copy failed would be the worse outcome.
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
