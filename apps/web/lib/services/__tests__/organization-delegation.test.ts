import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ audit: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
}));

import {
  assertDelegatedScope,
  assertDelegationExpiry,
  assertGranterHoldsScopes,
  assertOwnerProtection,
  DELEGATABLE_PERMISSIONS,
  grantAdminDelegation,
  normalizeDelegationScopes,
  resolveDelegatedScopes,
  revokeAdminDelegation,
} from '../organization-delegation';

const organizationId = '11111111-1111-4111-8111-111111111111';
const query = vi.fn();
const db = { query } as never;

const FINANCE_SCOPES = ['admin.billing.view', 'admin.contracts.view'];
const SECURITY_SCOPES = ['admin.identity.manage', 'admin.audit.view'];

function delegationRow(scopes: string[]) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organization_id: organizationId,
    delegate_user_id: 'delegate-user',
    granted_by_user_id: 'owner-user',
    scopes,
    reason: null,
    expires_at: '2026-10-01T00:00:00.000Z',
    revoked_at: null,
    created_at: '2026-09-18T00:00:00.000Z',
  };
}

beforeEach(() => {
  mocks.audit.mockReset().mockResolvedValue(undefined);
  query.mockReset().mockResolvedValue([]);
});

describe('delegation scopes', () => {
  it('refuses a permission that belongs to the workspace owner', () => {
    for (const ownerOnly of [
      'admin.ownership.manage',
      'workspace.delete',
      'admin.contracts.manage',
    ]) {
      expect(() => normalizeDelegationScopes([ownerOnly])).toThrow(/cannot be delegated/);
    }
    expect(DELEGATABLE_PERMISSIONS).not.toContain('admin.ownership.manage');
  });

  it('refuses a key that is not a permission and an empty list', () => {
    expect(() => normalizeDelegationScopes(['admin.everything.manage'])).toThrow(
      /not a workspace permission/,
    );
    expect(() => normalizeDelegationScopes([])).toThrow(/at least one permission/);
  });

  it('canonicalizes, dedupes and sorts the legacy vocabulary', () => {
    expect(normalizeDelegationScopes(['billing.read', 'admin.billing.view'])).toEqual([
      'admin.billing.view',
    ]);
  });

  it('refuses to delegate a permission the granter does not hold', () => {
    expect(() =>
      assertGranterHoldsScopes(['admin.billing.view'], normalizeDelegationScopes(SECURITY_SCOPES)),
    ).toThrow(/your own role does not include it/);

    expect(() =>
      assertGranterHoldsScopes(
        ['admin.identity.manage', 'admin.audit.view'],
        normalizeDelegationScopes(SECURITY_SCOPES),
      ),
    ).not.toThrow();
  });
});

describe('delegation expiry', () => {
  const now = Date.parse('2026-09-18T12:00:00.000Z');

  it('refuses an expiry in the past and one beyond 90 days', () => {
    expect(() => assertDelegationExpiry('2026-09-18T11:00:00.000Z', now)).toThrow(
      /at least five minutes/,
    );
    expect(() => assertDelegationExpiry('2027-09-18T12:00:00.000Z', now)).toThrow(
      /longer than 90 days/,
    );
    expect(() => assertDelegationExpiry('not-a-date', now)).toThrow(/not a date/);
  });

  it('accepts a delegation inside the window', () => {
    expect(assertDelegationExpiry('2026-10-18T12:00:00.000Z', now).toISOString()).toBe(
      '2026-10-18T12:00:00.000Z',
    );
  });
});

describe('grantAdminDelegation', () => {
  it('records the grant with its scopes and expiry', async () => {
    query
      .mockResolvedValueOnce([{ role: 'member' }])
      .mockResolvedValueOnce([delegationRow(FINANCE_SCOPES)]);

    const delegation = await grantAdminDelegation(db, {
      organizationId,
      delegateUserId: 'delegate-user',
      grantedByUserId: 'owner-user',
      granterPermissions: FINANCE_SCOPES,
      scopes: FINANCE_SCOPES,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(delegation.scopes).toEqual(FINANCE_SCOPES);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin_delegation_granted',
        detail: expect.objectContaining({ targetUserId: 'delegate-user', scopes: FINANCE_SCOPES }),
      }),
    );
  });

  it('refuses a delegate who is not a member, and a self-delegation', async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      grantAdminDelegation(db, {
        organizationId,
        delegateUserId: 'stranger',
        grantedByUserId: 'owner-user',
        granterPermissions: FINANCE_SCOPES,
        scopes: FINANCE_SCOPES,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toThrow(/not a member/);

    await expect(
      grantAdminDelegation(db, {
        organizationId,
        delegateUserId: 'owner-user',
        grantedByUserId: 'owner-user',
        granterPermissions: FINANCE_SCOPES,
        scopes: FINANCE_SCOPES,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toThrow(/delegate permissions to yourself/);
  });

  it('audits a revocation and refuses one that is already gone', async () => {
    query.mockResolvedValueOnce([{ ...delegationRow(FINANCE_SCOPES), revoked_at: 'now' }]);
    await revokeAdminDelegation(db, {
      organizationId,
      delegationId: '22222222-2222-4222-8222-222222222222',
      revokedByUserId: 'owner-user',
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_delegation_revoked' }),
    );

    query.mockResolvedValueOnce([]);
    await expect(
      revokeAdminDelegation(db, {
        organizationId,
        delegationId: '22222222-2222-4222-8222-222222222222',
        revokedByUserId: 'owner-user',
      }),
    ).rejects.toThrow(/not live in this workspace/);
  });
});

describe('delegated scope enforcement', () => {
  it('reads only live delegations', async () => {
    query.mockResolvedValueOnce([{ scopes: FINANCE_SCOPES }]);
    await resolveDelegatedScopes(db, organizationId, 'delegate-user');
    const [sql] = query.mock.calls[0]!;
    expect(sql).toContain('revoked_at is null');
    expect(sql).toContain('expires_at > now()');
  });

  it('refuses a finance delegation that reaches for single sign-on', async () => {
    query.mockResolvedValueOnce([{ scopes: FINANCE_SCOPES }]);

    await expect(
      assertDelegatedScope(db, {
        organizationId,
        userId: 'finance-user',
        permission: 'admin.identity.manage',
      }),
    ).rejects.toThrow(/does not cover admin.identity.manage/);

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_delegation_refused', outcome: 'denied' }),
    );
  });

  it('refuses a security delegation that reaches for billing', async () => {
    query.mockResolvedValueOnce([{ scopes: SECURITY_SCOPES }]);

    await expect(
      assertDelegatedScope(db, {
        organizationId,
        userId: 'security-user',
        permission: 'admin.billing.manage',
      }),
    ).rejects.toThrow(/does not cover admin.billing.manage/);
  });

  it('refuses every mutation for a read-only delegation', async () => {
    for (const permission of [
      'admin.members.manage',
      'admin.policy.manage',
      'admin.roles.manage',
    ]) {
      query.mockResolvedValueOnce([{ scopes: ['admin.members.view'] }]);
      await expect(
        assertDelegatedScope(db, { organizationId, userId: 'read-only-user', permission }),
      ).rejects.toThrow(/does not cover/);
    }
  });

  it('allows the scope it was given, and the view level manage implies', async () => {
    query.mockResolvedValueOnce([{ scopes: SECURITY_SCOPES }]);
    await expect(
      assertDelegatedScope(db, {
        organizationId,
        userId: 'security-user',
        permission: 'admin.identity.manage',
      }),
    ).resolves.toBeUndefined();

    query.mockResolvedValueOnce([{ scopes: SECURITY_SCOPES }]);
    await expect(
      assertDelegatedScope(db, {
        organizationId,
        userId: 'security-user',
        permission: 'admin.identity.view',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('assertOwnerProtection', () => {
  it('lets an owner act on anyone who is not an owner', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      expect(() =>
        assertOwnerProtection({
          actorRole: 'admin',
          targetRole: 'member',
          ownerCount: 1,
          action,
        }),
      ).not.toThrow();
    }
  });

  it('never lets a delegated admin act on an owner', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      const error = (() => {
        try {
          assertOwnerProtection({
            actorRole: 'admin',
            targetRole: 'owner',
            ownerCount: 5,
            action,
          });
          return null;
        } catch (thrown) {
          return thrown as { statusCode: number; message: string };
        }
      })();
      expect(error?.statusCode).toBe(403);
      expect(error?.message).toContain('Only a workspace owner can');
    }
  });

  it('never lets the last owner be removed, demoted or transferred away', () => {
    for (const action of ['remove', 'demote', 'transfer'] as const) {
      const error = (() => {
        try {
          assertOwnerProtection({
            actorRole: 'owner',
            targetRole: 'owner',
            ownerCount: 1,
            action,
          });
          return null;
        } catch (thrown) {
          return thrown as { statusCode: number; message: string };
        }
      })();
      expect(error?.statusCode).toBe(409);
      expect(error?.message).toContain('cannot be recovered');
    }
  });

  it('lets an owner act on another owner once a second one exists', () => {
    expect(() =>
      assertOwnerProtection({
        actorRole: 'owner',
        targetRole: 'owner',
        ownerCount: 2,
        action: 'demote',
      }),
    ).not.toThrow();
  });
});
