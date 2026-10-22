import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: h.getUserScopedDb }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: vi.fn(),
  getCachedActiveOrganizationId: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { PUT } from '../route';

function put(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function writeCalls() {
  return h.query.mock.calls.filter((call) =>
    String(call[0]).includes('insert into public.user_settings'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserScopedDb.mockResolvedValue({ db: { query: h.query }, userId: 'user-1' });
  h.query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    if (String(sql).includes('insert into public.user_settings')) {
      return [{ settings: JSON.parse(String(params?.[1])), version: 'v2' }];
    }
    return [{ settings: {}, version: 'v1' }];
  });
});

describe('the preferences PUT leaves skill installs to the skills endpoint', () => {
  it.each([
    ['a namespace value', { namespace: 'skills', value: { installs: { junk: true } } }],
    ['a namespace patch', { namespace: 'skills', patch: { installs: { junk: true } } }],
    ['a whole-document write', { settings: { skills: { installs: { junk: true } } } }],
    [
      'a whole-document write beside other namespaces',
      { settings: { general: { theme: 'dark' }, skills: { installs: { junk: true } } } },
    ],
  ])('refuses %s that targets the skills namespace and writes nothing', async (_label, body) => {
    const response = await PUT(put(body));
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: { message?: string } };
    expect(JSON.stringify(payload)).toContain('skills');
    expect(h.query).not.toHaveBeenCalled();
    expect(writeCalls()).toHaveLength(0);
  });

  it('still saves other namespaces', async () => {
    const response = await PUT(put({ namespace: 'general', patch: { theme: 'dark' } }));
    expect(response.status).toBe(200);
    expect(writeCalls()).toHaveLength(1);
  });
});
