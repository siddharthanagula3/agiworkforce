import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-123' })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.fn();
const mockExecute = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mockQuery, execute: mockExecute }),
}));
// The route moved from getNeonDb() to getUserScopedDb() when 0134 put a FORCE'd
// RLS policy on user_settings, the owner role has BYPASSRLS, so staying on the
// unscoped client would have made the policy decorative. Same fake db, reached
// the way the route now reaches it.
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mockQuery, execute: mockExecute },
    userId: 'user-123',
    organizationId: null,
  })),
}));

import { PUT } from '@/app/api/settings/preferences/route';

const STORED = { theme: 'dark', profile: { bio: 'old' } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getUpsert(): { sql: string; params: unknown[] } {
  const call = mockQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('insert into public.user_settings'),
  );
  expect(call, 'expected an upsert into public.user_settings').toBeDefined();
  return { sql: call![0] as string, params: (call![1] as unknown[]) ?? [] };
}

describe('PUT /api/settings/preferences, lost-update fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery
      .mockResolvedValueOnce([{ settings: STORED }])
      .mockResolvedValueOnce([{ settings: { ...STORED, profile: { bio: 'new' } } }]);
  });

  it('merges atomically in SQL (user_settings.settings || excluded.settings)', async () => {
    const res = await PUT(makeRequest({ namespace: 'profile', value: { bio: 'new' } }));
    expect(res.status).toBe(200);

    const { sql } = getUpsert();
    const normalized = sql.toLowerCase().replace(/\s+/g, ' ');
    expect(normalized).toContain('user_settings.settings || excluded.settings');
  });

  it('persists ONLY the delta namespace, not the stale read-merged doc', async () => {
    await PUT(makeRequest({ namespace: 'profile', value: { bio: 'new' } }));

    const { params } = getUpsert();
    const persisted = JSON.parse(params[1] as string);
    expect(persisted).toEqual({ profile: { bio: 'new' } });
    expect(persisted).not.toHaveProperty('theme');
  });

  it('persists only the incoming flat keys for a settings-branch patch', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce([{ settings: STORED }])
      .mockResolvedValueOnce([{ settings: { ...STORED, weekly_reports: true } }]);

    await PUT(makeRequest({ settings: { weekly_reports: true } }));

    const { params } = getUpsert();
    const persisted = JSON.parse(params[1] as string);
    expect(persisted).toEqual({ weekly_reports: true });
    expect(persisted).not.toHaveProperty('theme');
  });

  it('returns the true post-merge doc from RETURNING', async () => {
    const res = await PUT(makeRequest({ namespace: 'profile', value: { bio: 'new' } }));
    const json = await res.json();
    expect(json.settings).toEqual({ theme: 'dark', profile: { bio: 'new' } });
  });
});
