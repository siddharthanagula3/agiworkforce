import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb, mockRequireTeamAdminAccess, mockRecordAuditEvent } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockGetUserScopedDb: vi.fn(),
    mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
    mockRecordAuditEvent: vi.fn(async () => undefined),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { listCanonicalModels } from '@agiworkforce/types';
import { GET, PUT } from '../route';
import type { ModelPolicyResponse } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

// Taken from the catalog at run time. Writing a literal id here would violate
// the repo rule that model ids live only in the registry, and would rot.
const SAMPLE = listCanonicalModels()[0]!;

function policyRow(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    allowed_providers: [],
    blocked_providers: [],
    allowed_models: [],
    blocked_models: [],
    updated_by_user_id: 'user-1',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  existing = null as Record<string, unknown> | null,
  written = policyRow(),
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/insert into public\.organization_model_policies/i.test(text)) return [written];
    if (/from public\.organization_model_policies/i.test(text)) return existing ? [existing] : [];
    return [];
  });
}

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization/model-policy', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

const EMPTY = {
  allowedProviders: [],
  blockedProviders: [],
  allowedModels: [],
  blockedModels: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('GET /api/settings/organization/model-policy', () => {
  it('serves a plain member, who needs it to know why a model is unavailable', async () => {
    // Withholding this produces a picker that silently omits models with no
    // reason given, which reads as a broken product rather than as governance.
    bind({ role: 'member' });
    const res = await GET(req('GET') as never);

    expect(res.status).toBe(200);
    const body = (await res.json()) as ModelPolicyResponse;
    expect(body.canManagePolicy).toBe(false);
  });

  it('tells an admin they may change it', async () => {
    bind({ role: 'admin' });
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(body.canManagePolicy).toBe(true);
  });

  it('distinguishes no policy row from an empty policy', async () => {
    bind({ existing: null });
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(body.configured).toBe(false);

    bind({ existing: policyRow() });
    const withRow = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;
    expect(withRow.configured).toBe(true);
  });

  it('serves the catalog so no model id has to be typed by hand', async () => {
    bind();
    const body = (await (await GET(req('GET') as never)).json()) as ModelPolicyResponse;

    expect(body.catalog.models.length).toBeGreaterThan(0);
    expect(body.catalog.providers.length).toBeGreaterThan(0);
    expect(body.catalog.models.some((m) => m.id === SAMPLE.id)).toBe(true);
  });
});

describe('PUT /api/settings/organization/model-policy', () => {
  it('refuses a plain member', async () => {
    bind({ role: 'member' });
    expect((await PUT(req('PUT', EMPTY) as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await PUT(req('PUT', EMPTY) as never)).status).toBe(403);
  });

  it('saves a block an admin made', async () => {
    bind({
      role: 'admin',
      written: policyRow({ blocked_models: [SAMPLE.id.toLowerCase()] }),
    });
    const res = await PUT(req('PUT', { ...EMPTY, blockedModels: [SAMPLE.id] }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin_policy_changed',
        detail: expect.objectContaining({ resourceType: 'organization_model_policy' }),
      }),
    );
  });

  it('refuses a model that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, allowedModels: [SAMPLE.id], blockedModels: [SAMPLE.id] }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/both approved and blocked/i);
  });

  it('refuses a provider that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const provider = String(SAMPLE.provider);
    const res = await PUT(
      req('PUT', {
        ...EMPTY,
        allowedProviders: [provider],
        blockedProviders: [provider],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('refuses a model id the catalog does not know', async () => {
    // A rule naming an unknown id governs nothing, so accepting it would leave
    // an administrator believing they had restricted something.
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, blockedModels: ['definitely-not-a-catalog-model'] }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/not in the catalog/i);
  });

  it('refuses a provider the catalog does not know', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', { ...EMPTY, blockedProviders: ['not-a-real-provider'] }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a list beyond the table ceiling instead of failing in the database', async () => {
    bind({ role: 'admin' });
    const tooMany = Array.from({ length: 513 }, (_, i) => `model-${i}`);
    const res = await PUT(req('PUT', { ...EMPTY, blockedModels: tooMany }) as never);
    expect(res.status).toBe(400);
  });

  it('writes the whole policy rather than a partial patch', async () => {
    bind({ role: 'admin' });
    await PUT(req('PUT', { ...EMPTY, blockedModels: [SAMPLE.id] }) as never);

    const insert = mockQuery.mock.calls.find((call) =>
      /insert into public\.organization_model_policies/i.test(String(call[0])),
    );
    const params = insert?.[1] as unknown[];
    expect(params).toHaveLength(6);
    expect(params[0]).toBe(ORG);
  });
});
