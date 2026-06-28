/**
 * Settings Preferences API — lost-update regression
 *
 * PUT /api/settings/preferences must persist only the changed delta and merge
 * it atomically in SQL (`user_settings.settings || excluded.settings`). The
 * previous read-modify-write sent the whole read-merged doc, so a concurrent
 * writer's namespace was silently clobbered (lost update).
 */
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

import { PUT } from '@/app/api/settings/preferences/route';

// Simulated stored doc at read time — the "current" the request reads. A
// concurrent writer may change `theme` after this read; the fix must not let
// this stale value win.
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

describe('PUT /api/settings/preferences — lost-update fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // query #1 = readSettings (size guard); query #2 = upsert RETURNING.
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
    // Regression: the old code sent { theme:'dark', profile:{bio:'new'} } — the
    // stale `theme` would clobber a concurrent theme write. The fix sends only
    // the changed namespace.
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
    // Server returns the actual merged row (includes theme preserved by `||`).
    expect(json.settings).toEqual({ theme: 'dark', profile: { bio: 'new' } });
  });
});
