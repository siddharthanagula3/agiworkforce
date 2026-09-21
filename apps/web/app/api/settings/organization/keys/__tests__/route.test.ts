import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  role: 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  plan: 'enterprise' as string,
  held: false,
  record: null as unknown,
}));

const calls = vi.hoisted(() => ({
  provision: vi.fn(async () => ({ keyVersion: '1' })),
  rotate: vi.fn(async () => ({ keyVersion: '2', retiredVersions: ['1'] })),
  replace: vi.fn(async () => ({ keyVersion: '2', previousVersion: '1' })),
  revoke: vi.fn(async () => ({ revoked: true })),
  validate: vi.fn(async () => ({ ok: true, descriptor: {}, checks: [] })),
  status: vi.fn(async () => ({
    availability: { state: 'platform_derived', keyId: 'platform-1' },
    status: null,
    lastRotatedAt: null,
    revokedAt: null,
  })),
  rewrapRun: vi.fn(async () => null),
  stepUp: vi.fn(async () => ({ method: 'totp' })),
  audit: vi.fn(async () => undefined),
  hold: vi.fn(async () => ({ held: state.held, count: state.held ? 1 : 0 })),
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/server/admin-data-access', () => ({ logAdminDataAccess: vi.fn(async () => {}) }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => calls.audit(...(args as [])),
  logRateLimitExceeded: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(), execute: vi.fn() }),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(async () => []), execute: vi.fn(async () => undefined) },
    userId: 'user-1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ plan: state.plan, canManageTeam: true })),
}));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveOrganizationEntitlementPlan: vi.fn(async () => state.plan),
}));
vi.mock('@/lib/services/organization-membership-service', () => ({
  requireOrganizationOwner: vi.fn(async () => {
    if (state.role !== 'owner') {
      const { createError } = await import('@/lib/errors');
      throw createError.forbidden('Only the Primary Owner can do that').asUserSafe();
    }
    return { role: 'owner' };
  }),
}));
vi.mock('@/lib/server/step-up-auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireStepUp: (...args: unknown[]) => calls.stepUp(...(args as [])),
}));
vi.mock('@/lib/server/organization-erasure', () => ({
  isOrganizationUnderActiveLegalHold: (...args: unknown[]) => calls.hold(...(args as [])),
}));
vi.mock('@/lib/server/idempotency', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withIdempotentWrite: vi.fn(
    async (
      _db: unknown,
      _scope: unknown,
      write: () => Promise<{ status: number; body: unknown }>,
    ) => {
      const seen = idempotencyStore.get(JSON.stringify(_scope));
      if (seen) return { ...seen, replayed: true };
      const result = await write();
      idempotencyStore.set(JSON.stringify(_scope), result);
      return result;
    },
  ),
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  buildCmekProviderRegistry: () => ({
    local: { id: 'local', generateDataKey: vi.fn(), unwrapDataKey: vi.fn() },
  }),
  provisionOrganizationKey: (...args: unknown[]) => calls.provision(...(args as [])),
  rotateOrganizationKey: (...args: unknown[]) => calls.rotate(...(args as [])),
  replaceOrganizationKey: (...args: unknown[]) => calls.replace(...(args as [])),
  revokeOrganizationKey: (...args: unknown[]) => calls.revoke(...(args as [])),
  validateOrganizationKeySetup: (...args: unknown[]) => calls.validate(...(args as [])),
  readOrganizationKeyStatus: (...args: unknown[]) => calls.status(...(args as [])),
  readOrganizationKeyRecord: async () => state.record,
  readKeyRewrapRun: (...args: unknown[]) => calls.rewrapRun(...(args as [])),
}));

vi.mock('@/lib/services/organization-permission-service', async () => {
  const types = await import('@agiworkforce/types');
  const { createError } = await import('@/lib/errors');
  const held = () => {
    const definition = types.BUILT_IN_ORGANIZATION_ROLES[state.role];
    return types.expandOrganizationPermissions(definition?.permissions ?? []);
  };
  return {
    resolveOrganizationAccess: vi.fn(async (organizationId: string) => ({
      organizationId,
      role: state.role,
      permissions: held(),
    })),
    requirePermission: (_access: unknown, permission: string, deniedMessage: string) => {
      if (!held().has(permission)) throw createError.forbidden(deniedMessage).asUserSafe();
    },
  };
});

const idempotencyStore = new Map<string, { status: number; body: unknown }>();

import { StepUpRequiredError } from '@/lib/server/step-up-auth';
import { DELETE, GET, POST, PUT } from '../route';

function refuseStepUp() {
  calls.stepUp.mockImplementation(() => {
    throw new StepUpRequiredError('encryption_key.revoke', 'missing');
  });
}

const ORG = '11111111-1111-4111-8111-111111111111';
const DESCRIPTOR = { provider: 'local', keyUri: 'local://acme/kek', region: 'us-east-1' };

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization/keys', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function activeRecord() {
  return {
    organizationId: ORG,
    descriptor: DESCRIPTOR,
    status: 'active',
    active: { version: '1', wrapped: 'AAAA' },
    retired: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  idempotencyStore.clear();
  state.role = 'admin';
  state.plan = 'enterprise';
  state.held = false;
  state.record = null;
  calls.stepUp.mockImplementation(async () => ({ method: 'totp' }));
  calls.hold.mockImplementation(async () => ({ held: state.held, count: state.held ? 1 : 0 }));
});

describe('who may reach the workspace key at all', () => {
  it('refuses a plain member reading the key posture', async () => {
    state.role = 'member';
    expect((await GET(req('GET') as never)).status).toBe(403);
  });

  it('refuses a workspace without the enterprise entitlement', async () => {
    state.plan = 'team';
    const response = await GET(req('GET') as never);
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toMatch(/Enterprise plan/i);
  });

  it('lets an admin read it once the workspace is entitled', async () => {
    const response = await GET(req('GET') as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ organizationId: ORG, canRevoke: false });
  });

  it('tells an owner it may revoke and an admin it may not', async () => {
    state.role = 'owner';
    const owner = await (await GET(req('GET') as never)).json();
    state.role = 'admin';
    const admin = await (await GET(req('GET') as never)).json();
    expect(owner.canRevoke).toBe(true);
    expect(admin.canRevoke).toBe(false);
  });
});

describe('enrolling a key', () => {
  it('refuses to enrol over an association that already exists', async () => {
    state.record = activeRecord();
    const response = await POST(req('POST', DESCRIPTOR) as never);
    expect(response.status).toBe(409);
    expect(calls.provision).not.toHaveBeenCalled();
  });

  it('runs the customer key before anything is sealed under it', async () => {
    calls.validate.mockResolvedValueOnce({
      ok: false,
      descriptor: {},
      checks: [{ id: 'unwrap_data_key', state: 'fail', detail: 'the grant is missing' }],
    } as never);

    const response = await POST(req('POST', DESCRIPTOR) as never);
    expect(response.status).toBe(400);
    expect(calls.provision).not.toHaveBeenCalled();
  });

  it('enrols once the key answers', async () => {
    const response = await POST(req('POST', DESCRIPTOR) as never);
    expect(response.status).toBe(201);
    expect(calls.provision).toHaveBeenCalledTimes(1);
  });
});

describe('rotating and replacing', () => {
  it('refuses a rotation with no proof of a fresh second factor', async () => {
    state.record = activeRecord();
    refuseStepUp();

    const response = await PUT(req('PUT', { action: 'rotate' }) as never);

    expect(response.status).toBe(403);
    expect(calls.rotate).not.toHaveBeenCalled();
  });

  it('takes the proof for the version it is rotating off, not for the workspace at large', async () => {
    state.record = activeRecord();

    await PUT(req('PUT', { action: 'rotate' }) as never);

    const [requirement] = calls.stepUp.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(requirement['action']).toBe('encryption_key.rotate');
    expect(requirement['resourceId']).toBe('1');
  });

  it('asks for the replacement proof when the key resource itself is changing', async () => {
    state.record = activeRecord();

    await PUT(
      req('PUT', {
        action: 'replace',
        provider: 'local',
        keyUri: 'local://acme/kek-2',
        region: 'us-east-1',
      }) as never,
    );

    const [requirement] = calls.stepUp.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(requirement['action']).toBe('encryption_key.replace');
    expect(calls.replace).toHaveBeenCalledTimes(1);
  });

  it('never mints a second version for a retried rotation carrying the same key', async () => {
    state.record = activeRecord();
    const send = () =>
      PUT(
        new Request('https://app.test/api/settings/organization/keys', {
          method: 'PUT',
          body: JSON.stringify({ action: 'rotate' }),
          headers: { 'content-type': 'application/json', 'idempotency-key': 'rotate-once-01' },
        }) as never,
      );

    const first = await send();
    const second = await send();

    expect(first.status).toBe(200);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(calls.rotate).toHaveBeenCalledTimes(1);
  });

  it('refuses to change a workspace that manages no key of its own', async () => {
    const response = await PUT(req('PUT', { action: 'rotate' }) as never);
    expect(response.status).toBe(404);
    expect(calls.stepUp).not.toHaveBeenCalled();
  });
});

describe('revoking, which is the most destructive control the product has', () => {
  const body = { reason: 'grant withdrawn at the vendor' };

  it('refuses an admin who is not the Primary Owner', async () => {
    state.record = activeRecord();
    const response = await DELETE(req('DELETE', body) as never);
    expect(response.status).toBe(403);
    expect(calls.revoke).not.toHaveBeenCalled();
  });

  it('refuses while a legal hold covers the workspace, before it spends a factor', async () => {
    state.role = 'owner';
    state.record = activeRecord();
    state.held = true;
    const response = await DELETE(req('DELETE', body) as never);
    expect(response.status).toBe(409);
    expect(calls.revoke).not.toHaveBeenCalled();
    expect(calls.stepUp).not.toHaveBeenCalled();
  });

  it('refuses without proof of a fresh second factor even for the owner', async () => {
    state.role = 'owner';
    state.record = activeRecord();
    refuseStepUp();
    const response = await DELETE(req('DELETE', body) as never);
    expect(response.status).toBe(403);
    expect(calls.revoke).not.toHaveBeenCalled();
  });

  it('refuses a revocation with no reason for the trail', async () => {
    state.role = 'owner';
    state.record = activeRecord();
    const response = await DELETE(req('DELETE', {}) as never);
    expect(response.status).toBe(400);
    expect(calls.revoke).not.toHaveBeenCalled();
  });

  it('revokes for an owner with a fresh factor and no hold', async () => {
    state.role = 'owner';
    state.record = activeRecord();
    const response = await DELETE(req('DELETE', body) as never);
    expect(response.status).toBe(200);
    expect(calls.revoke).toHaveBeenCalledTimes(1);
    const [requirement] = calls.stepUp.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(requirement['action']).toBe('encryption_key.revoke');
  });
});
