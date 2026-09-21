import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  role: 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  plan: 'enterprise' as string,
  record: null as unknown,
  complete: true,
}));

const calls = vi.hoisted(() => ({
  rewrap: vi.fn(),
  retire: vi.fn(async () => ({ retainedVersions: [] })),
  stepUp: vi.fn(async () => ({ method: 'totp' })),
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
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
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
  requireOrganizationOwner: vi.fn(async () => ({ role: 'owner' })),
}));
vi.mock('@/lib/server/step-up-auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireStepUp: (...args: unknown[]) => calls.stepUp(...(args as [])),
}));
vi.mock('@/lib/server/organization-erasure', () => ({
  isOrganizationUnderActiveLegalHold: vi.fn(async () => ({ held: false, count: 0 })),
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  buildCmekProviderRegistry: () => ({}),
  readOrganizationKeyRecord: async () => state.record,
  runOrganizationKeyRewrap: (...args: unknown[]) => calls.rewrap(...(args as [])),
  retireOrganizationKeyVersion: (...args: unknown[]) => calls.retire(...(args as [])),
}));
vi.mock('@/lib/services/organization-permission-service', async () => {
  const types = await import('@agiworkforce/types');
  const { createError } = await import('@/lib/errors');
  const held = () =>
    types.expandOrganizationPermissions(
      types.BUILT_IN_ORGANIZATION_ROLES[state.role]?.permissions ?? [],
    );
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

import { StepUpRequiredError } from '@/lib/server/step-up-auth';
import { POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function outcome(over: Record<string, unknown> = {}) {
  return {
    fromVersion: '1',
    toVersion: '2',
    scanned: 4,
    resealed: 4,
    remaining: 0,
    complete: state.complete,
    failures: [],
    ...over,
  };
}

function req(body: unknown): Request {
  return new Request('https://app.test/api/settings/organization/keys/rewrap', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'admin';
  state.plan = 'enterprise';
  state.complete = true;
  state.record = {
    organizationId: ORG,
    descriptor: { provider: 'local', keyUri: 'local://acme/kek', region: 'us-east-1' },
    status: 'active',
    active: { version: '2', wrapped: 'BBBB' },
    retired: [{ version: '1', wrapped: 'AAAA' }],
  };
  calls.rewrap.mockImplementation(async () => outcome());
  calls.stepUp.mockImplementation(async () => ({ method: 'totp' }));
});

describe('running the rewrap over a workspace key version', () => {
  it('refuses a plain member', async () => {
    state.role = 'member';
    expect((await POST(req({ fromVersion: '1' }) as never)).status).toBe(403);
  });

  it('refuses a version that is not in the ring, so nothing is walked for nothing', async () => {
    const response = await POST(req({ fromVersion: '9' }) as never);
    expect(response.status).toBe(400);
    expect(calls.rewrap).not.toHaveBeenCalled();
  });

  it('walks every registered store, because it names none itself', async () => {
    await POST(req({ fromVersion: '1' }) as never);
    const [input] = calls.rewrap.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input['stores']).toBeUndefined();
    expect(input['fromVersion']).toBe('1');
  });

  it('re-seals without retiring when no retirement was asked for', async () => {
    const response = await POST(req({ fromVersion: '1' }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ retired: false, retainedVersions: null });
    expect(calls.retire).not.toHaveBeenCalled();
  });

  it('leaves the version in the ring when the run did not finish', async () => {
    state.complete = false;
    const response = await POST(
      req({
        fromVersion: '1',
        retire: true,
        reason: 'rotation',
      }) as never,
    );
    expect(await response.json()).toMatchObject({ retired: false });
    expect(calls.retire).not.toHaveBeenCalled();
  });

  it('refuses a retirement with no proof of a fresh second factor, before it walks anything', async () => {
    calls.stepUp.mockImplementation(() => {
      throw new StepUpRequiredError('encryption_key.retire', 'missing');
    });

    const response = await POST(
      req({ fromVersion: '1', retire: true, reason: 'rotation' }) as never,
    );

    expect(response.status).toBe(403);
    expect(calls.rewrap).not.toHaveBeenCalled();
    expect(calls.retire).not.toHaveBeenCalled();
  });

  it('asks for no factor when it is only re-sealing', async () => {
    await POST(req({ fromVersion: '1' }) as never);
    expect(calls.stepUp).not.toHaveBeenCalled();
    expect(calls.rewrap).toHaveBeenCalledTimes(1);
  });

  it('binds the retirement proof to the version being dropped', async () => {
    await POST(req({ fromVersion: '1', retire: true, reason: 'rotation' }) as never);

    const [requirement] = calls.stepUp.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(requirement['action']).toBe('encryption_key.retire');
    expect(requirement['resourceId']).toBe('1');
  });

  it('refuses a retirement with no reason for the trail', async () => {
    const response = await POST(req({ fromVersion: '1', retire: true }) as never);
    expect(response.status).toBe(400);
    expect(calls.rewrap).not.toHaveBeenCalled();
  });

  it('retires the version once the run says every store moved', async () => {
    const response = await POST(
      req({
        fromVersion: '1',
        retire: true,
        reason: 'rotation',
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ retired: true, retainedVersions: [] });
    expect(calls.retire).toHaveBeenCalledTimes(1);
  });
});
