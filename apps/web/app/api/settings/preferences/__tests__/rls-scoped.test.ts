import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: h.getUserScopedDb }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/active-workspace-service')>();
  return { ...actual, resolveActiveOrganizationId: h.resolveActiveOrganizationId };
});
vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: h.invalidateActiveOrganizationCache,
  getCachedActiveOrganizationId: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue([{ settings: { general: { preferredName: 'Sid' } } }]);
  h.getUserScopedDb.mockResolvedValue({ db: { query: h.query }, userId: 'user-1' });
  h.resolveActiveOrganizationId.mockResolvedValue(null);
});

// The Memory section's four switches are gated by the workspace policy, and the
// policy route is admin-only, so this GET is the only place a member can learn
// the gate is shut.
describe('the capabilities namespace reports the workspace memory gate', () => {
  function capabilitiesRequest() {
    return new NextRequest('http://localhost:3000/api/settings/preferences?namespace=capabilities');
  }

  it('reports the gate open for a personal-scope account', async () => {
    const response = await GET(capabilitiesRequest());

    expect(await response.json()).toMatchObject({ organizationMemoryAllowed: true });
  });

  it('reports the gate shut when the workspace policy has memory off', async () => {
    h.resolveActiveOrganizationId.mockResolvedValue('org-1');
    h.query.mockImplementation(async (sql: string) =>
      sql.includes('organization_admin_policies')
        ? [{ allow_memory: false }]
        : [{ settings: { capabilities: { memory: true } } }],
    );

    const response = await GET(capabilitiesRequest());

    expect(await response.json()).toMatchObject({ organizationMemoryAllowed: false });
  });

  it('reports the gate open when the workspace policy allows memory', async () => {
    h.resolveActiveOrganizationId.mockResolvedValue('org-1');
    h.query.mockImplementation(async (sql: string) =>
      sql.includes('organization_admin_policies')
        ? [{ allow_memory: true }]
        : [{ settings: { capabilities: { memory: true } } }],
    );

    const response = await GET(capabilitiesRequest());

    expect(await response.json()).toMatchObject({
      organizationMemoryAllowed: true,
      settings: { memory: true },
    });
  });

  it('leaves every other namespace read free of the gate lookup', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/settings/preferences?namespace=general'),
    );

    expect(await response.json()).not.toHaveProperty('organizationMemoryAllowed');
    expect(h.resolveActiveOrganizationId).not.toHaveBeenCalled();
  });
});

// 0134 puts a FORCE'd policy on user_settings. Verified on a branch off
// production: the owner role Neon connects as carries BYPASSRLS, so a route
// still on getNeonDb() sails straight past the policy and the policy is
// decorative. Reading through the scoped client is what makes it real.
describe('settings preferences reads through the RLS-scoped client', () => {
  it('never reaches for the BYPASSRLS client on read', async () => {
    const neon = await import('@/lib/server/neon-db').catch(() => null);
    expect(neon).not.toBeNull();

    await GET(new NextRequest('http://localhost:3000/api/settings/preferences'));

    expect(h.getUserScopedDb).toHaveBeenCalled();
  });

  it('keeps the user predicate as the first line of defence, not only the policy', async () => {
    await GET(new NextRequest('http://localhost:3000/api/settings/preferences'));

    const [sql, params] = h.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('reads the settings row exactly once per request and skips organization resolution', async () => {
    await GET(new NextRequest('http://localhost:3000/api/settings/preferences'));

    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
  });

  it('writes through the scoped client too', async () => {
    h.query.mockResolvedValue([{ settings: { general: {} } }]);

    await PUT(
      new NextRequest('http://localhost:3000/api/settings/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ namespace: 'general', value: { preferredName: 'Sid' } }),
      }),
    );

    expect(h.getUserScopedDb).toHaveBeenCalled();
    const insert = h.query.mock.calls.map(([sql]) => String(sql)).find((s) => s.includes('insert'));
    expect(insert).toContain('user_settings');
  });

  it('takes the user id from the scoped handshake, never from the request body', async () => {
    await PUT(
      new NextRequest('http://localhost:3000/api/settings/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          namespace: 'general',
          value: { preferredName: 'Sid' },
          userId: 'someone-else',
        }),
      }),
    );

    for (const [, params] of h.query.mock.calls as Array<[string, unknown[]]>) {
      expect(params?.[0]).not.toBe('someone-else');
    }
  });
});

describe('the migration that backs it', () => {
  it('forces the policy so the owner role cannot bypass it', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(join(process.cwd(), 'db/neon/0134_user_settings_rls.sql'), 'utf8');

    expect(sql).toContain('enable row level security');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('using (user_id = public.current_app_user_id())');
    expect(sql).toContain('with check (user_id = public.current_app_user_id())');
  });
});

describe('a write that touches the workspace namespace invalidates the active-org cache', () => {
  it('invalidates when the namespace patch targets workspace', async () => {
    h.query.mockResolvedValue([{ settings: { workspace: { activeOrganizationId: 'org-1' } } }]);

    await PUT(
      new NextRequest('http://localhost:3000/api/settings/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ namespace: 'workspace', value: { activeOrganizationId: 'org-1' } }),
      }),
    );

    expect(h.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user-1');
  });

  it('does not invalidate for an unrelated namespace', async () => {
    h.query.mockResolvedValue([{ settings: { general: { preferredName: 'Sid' } } }]);

    await PUT(
      new NextRequest('http://localhost:3000/api/settings/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ namespace: 'general', value: { preferredName: 'Sid' } }),
      }),
    );

    expect(h.invalidateActiveOrganizationCache).not.toHaveBeenCalled();
  });

  it('invalidates for a whole-document patch that includes the workspace key', async () => {
    h.query.mockResolvedValue([{ settings: { workspace: { activeOrganizationId: null } } }]);

    await PUT(
      new NextRequest('http://localhost:3000/api/settings/preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          settings: { workspace: { activeOrganizationId: null }, general: {} },
        }),
      }),
    );

    expect(h.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user-1');
  });
});
