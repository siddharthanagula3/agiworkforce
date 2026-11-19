import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type EntitlementModule = typeof import('@/lib/services/entitlement-resolution');
type ManagedComputeAccessModule = typeof import('@/lib/services/managed-compute-access');
type EditServiceModule = typeof import('@/lib/services/project-memory-edit-service');
type MemoryContextModule = typeof import('@/lib/services/managed-memory-context-service');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  planTier: vi.fn(),
  access: vi.fn(),
  policy: vi.fn(),
  run: vi.fn(),
  route: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  }),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementModule>()),
  resolveEntitledPlanTier: mocks.planTier,
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => ({
  ...(await importOriginal<ManagedComputeAccessModule>()),
  evaluateManagedComputeWorkspaceAccess: mocks.access,
}));
vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<MemoryContextModule>()),
  loadManagedMemoryPolicy: mocks.policy,
}));
vi.mock('@/lib/services/project-memory-edit-service', async (importOriginal) => ({
  ...(await importOriginal<EditServiceModule>()),
  runProjectMemoryEdit: mocks.run,
  resolveProjectMemoryEditRoute: mocks.route,
}));

const { GET, POST } = await import('./route');
const { PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS } = await import('@agiworkforce/cloud-contracts');
const { ProjectMemoryEditUnavailableError } =
  await import('@/lib/services/project-memory-edit-service');

const PROJECT_ID = '0195f2a8-7c1d-7e3a-9b4f-2a6c8d0e1f23';
const RESULT = {
  changed: [{ id: 'memory-new', action: 'added', content: 'Deadline is March' }],
  removals: [],
  reply: 'Added: deadline is March',
};

function context(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(method: 'GET' | 'POST', body?: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/memory/edit`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', 'x-agi-surface': 'mobile' },
  });
}

describe('/api/projects/[id]/memory/edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue([{ id: PROJECT_ID }]);
    mocks.planTier.mockResolvedValue('free');
    mocks.policy.mockResolvedValue({ enabled: true });
    mocks.access.mockResolvedValue({
      allowed: true,
      code: 'allowed',
      reason: 'allowed',
      organizationId: null,
    });
    mocks.run.mockResolvedValue(RESULT);
    mocks.route.mockResolvedValue({ status: 'selected', provider: 'routed', routeId: 'route' });
  });

  it('GET tells the phone the route is live and how long a message may be', async () => {
    const response = await GET(request('GET'), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      maxMessageChars: PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS,
    });
  });

  it('GET answers 404 when no model can change memory for this person', async () => {
    mocks.route.mockResolvedValue(null);

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(404);
    expect(mocks.route).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('GET refuses when the workspace has no managed compute access', async () => {
    mocks.access.mockResolvedValue({
      allowed: false,
      code: 'subscription_inactive',
      reason: 'Subscription is canceled. Please update your payment method.',
      organizationId: null,
    });

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(403);
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it('GET answers 404 for a project the caller does not own', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(404);
  });

  it('POST runs the edit inside the owned project and returns its result', async () => {
    const response = await POST(request('POST', { message: '  Change the deadline  ' }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESULT);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        userId: 'user-1',
        message: 'Change the deadline',
        source: 'mobile',
        planTier: 'free',
      }),
    );
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'llm-completion',
      'user:user-1',
    );
  });

  it('POST stops at the CSRF check', async () => {
    mocks.csrf.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request('POST', { message: 'x' }), context());

    expect(response.status).toBe(403);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('POST refuses an empty or too long message', async () => {
    const empty = await POST(request('POST', { message: '   ' }), context());
    const long = await POST(
      request('POST', { message: 'x'.repeat(PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS + 1) }),
      context(),
    );

    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('POST refuses a project that is not the caller’s, and a malformed id', async () => {
    mocks.query.mockResolvedValue([]);
    const missing = await POST(request('POST', { message: 'x' }), context());
    const malformed = await POST(request('POST', { message: 'x' }), context('not-a-uuid'));

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('POST says memory is off without calling a model', async () => {
    mocks.policy.mockResolvedValue({ enabled: false });

    const response = await POST(request('POST', { message: 'x' }), context());

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(
      'Memory is turned off in your settings.',
    );
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('POST reports that nothing was changed when no model can run', async () => {
    mocks.run.mockRejectedValue(new ProjectMemoryEditUnavailableError());

    const response = await POST(request('POST', { message: 'x' }), context());

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).toContain('Nothing was changed.');
  });
});
