import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canonicalOrganizationPermission,
  expandOrganizationPermissions,
  GRANTABLE_CANONICAL_PERMISSIONS,
  type CanonicalOrganizationPermission,
  type OrganizationRole,
} from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';

/** Long enough for a quarter-end handover, short enough to notice it lapse. */
export const DELEGATION_MAX_DURATION_MS = 90 * 24 * 60 * 60_000;
export const DELEGATION_MIN_DURATION_MS = 5 * 60_000;
const MAX_SCOPES = 32;
const MAX_REASON_CHARS = 500;

/**
 * Primary Owner permissions are answered by the membership row, so they are
 * absent from the grantable set and can never be delegated.
 */
export const DELEGATABLE_PERMISSIONS: readonly CanonicalOrganizationPermission[] =
  GRANTABLE_CANONICAL_PERMISSIONS;

export interface AdminDelegation {
  id: string;
  organizationId: string;
  delegateUserId: string;
  grantedByUserId: string;
  scopes: CanonicalOrganizationPermission[];
  reason: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface DelegationRow {
  id: string;
  organization_id: string;
  delegate_user_id: string;
  granted_by_user_id: string;
  scopes: unknown;
  reason: string | null;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  created_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDelegation(row: DelegationRow): AdminDelegation {
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  return {
    id: row.id,
    organizationId: row.organization_id,
    delegateUserId: row.delegate_user_id,
    grantedByUserId: row.granted_by_user_id,
    scopes: scopes
      .map((scope) => (typeof scope === 'string' ? canonicalOrganizationPermission(scope) : null))
      .filter((scope): scope is CanonicalOrganizationPermission => scope !== null),
    reason: row.reason,
    expiresAt: iso(row.expires_at),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
    createdAt: iso(row.created_at),
  };
}

export function normalizeDelegationScopes(
  requested: readonly string[],
): CanonicalOrganizationPermission[] {
  const canonical = new Set<CanonicalOrganizationPermission>();
  for (const entry of requested) {
    const key = canonicalOrganizationPermission(entry);
    if (!key) {
      throw createError.validation(`"${entry}" is not a workspace permission.`);
    }
    if (!DELEGATABLE_PERMISSIONS.includes(key)) {
      throw createError
        .forbidden(`${key} belongs to the workspace owner and cannot be delegated.`)
        .asUserSafe();
    }
    canonical.add(key);
  }
  if (canonical.size === 0) {
    throw createError.validation('A delegation has to name at least one permission.');
  }
  if (canonical.size > MAX_SCOPES) {
    throw createError.validation(`A delegation cannot name more than ${MAX_SCOPES} permissions.`);
  }
  return [...canonical].sort();
}

export function assertDelegationExpiry(expiresAt: string, now = Date.now()): Date {
  const expiry = new Date(expiresAt);
  const at = expiry.getTime();
  if (Number.isNaN(at)) {
    throw createError.validation('The delegation expiry is not a date.');
  }
  if (at - now < DELEGATION_MIN_DURATION_MS) {
    throw createError.validation('A delegation has to last at least five minutes.');
  }
  if (at - now > DELEGATION_MAX_DURATION_MS) {
    throw createError.validation('A delegation cannot last longer than 90 days.');
  }
  return expiry;
}

/**
 * Nobody hands over what they do not hold: delegating a permission the granter
 * lacks would turn any admin into every admin in two steps.
 */
export function assertGranterHoldsScopes(
  granted: Iterable<string>,
  scopes: readonly CanonicalOrganizationPermission[],
): void {
  const held = expandOrganizationPermissions(granted);
  const missing = scopes.filter((scope) => !held.has(scope));
  if (missing.length > 0) {
    throw createError
      .forbidden(
        `You cannot delegate ${missing.join(', ')} because your own role does not include it.`,
      )
      .asUserSafe();
  }
}

export interface GrantDelegationInput {
  organizationId: string;
  delegateUserId: string;
  grantedByUserId: string;
  granterPermissions: Iterable<string>;
  scopes: readonly string[];
  expiresAt: string;
  reason?: string | null;
  request?: Request;
}

export async function grantAdminDelegation(
  db: DatabaseAdapter,
  input: GrantDelegationInput,
): Promise<AdminDelegation> {
  if (input.delegateUserId === input.grantedByUserId) {
    throw createError.validation('You cannot delegate permissions to yourself.');
  }
  const scopes = normalizeDelegationScopes(input.scopes);
  assertGranterHoldsScopes(input.granterPermissions, scopes);
  const expiry = assertDelegationExpiry(input.expiresAt);

  const [member] = await db.query<{ role: OrganizationRole }>(
    `select role from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [input.organizationId, input.delegateUserId],
  );
  if (!member) {
    throw createError.notFound('That person is not a member of this workspace.');
  }

  const [row] = await db.query<DelegationRow>(
    `insert into public.organization_admin_delegations
       (organization_id, delegate_user_id, granted_by_user_id, scopes, reason, expires_at)
     values ($1, $2, $3, $4::text[], $5, $6)
     returning id, organization_id, delegate_user_id, granted_by_user_id, scopes, reason,
               expires_at, revoked_at, created_at`,
    [
      input.organizationId,
      input.delegateUserId,
      input.grantedByUserId,
      scopes,
      input.reason?.trim().slice(0, MAX_REASON_CHARS) || null,
      expiry.toISOString(),
    ],
  );
  if (!row) {
    throw createError.conflict('The delegation could not be recorded.');
  }

  const delegation = toDelegation(row);
  await recordAuditEvent({
    userId: input.grantedByUserId,
    organizationId: input.organizationId,
    eventType: 'admin_delegation_granted',
    request: input.request,
    severity: 'warning',
    detail: {
      resourceType: 'admin_delegation',
      resourceId: delegation.id,
      targetUserId: input.delegateUserId,
      scopes: delegation.scopes,
      status: delegation.expiresAt,
    },
  });
  return delegation;
}

export interface RevokeDelegationInput {
  organizationId: string;
  delegationId: string;
  revokedByUserId: string;
  request?: Request;
}

export async function revokeAdminDelegation(
  db: DatabaseAdapter,
  input: RevokeDelegationInput,
): Promise<AdminDelegation> {
  const [row] = await db.query<DelegationRow>(
    `update public.organization_admin_delegations
        set revoked_at = now(), revoked_by_user_id = $3
      where id = $1 and organization_id = $2 and revoked_at is null
      returning id, organization_id, delegate_user_id, granted_by_user_id, scopes, reason,
                expires_at, revoked_at, created_at`,
    [input.delegationId, input.organizationId, input.revokedByUserId],
  );
  if (!row) {
    throw createError.notFound('That delegation is not live in this workspace.');
  }

  const delegation = toDelegation(row);
  await recordAuditEvent({
    userId: input.revokedByUserId,
    organizationId: input.organizationId,
    eventType: 'admin_delegation_revoked',
    request: input.request,
    severity: 'warning',
    detail: {
      resourceType: 'admin_delegation',
      resourceId: delegation.id,
      targetUserId: delegation.delegateUserId,
      scopes: delegation.scopes,
    },
  });
  return delegation;
}

export async function listAdminDelegations(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<AdminDelegation[]> {
  const rows = await db.query<DelegationRow>(
    `select id, organization_id, delegate_user_id, granted_by_user_id, scopes, reason,
            expires_at, revoked_at, created_at
       from public.organization_admin_delegations
      where organization_id = $1
      order by created_at desc
      limit 200`,
    [organizationId],
  );
  return rows.map(toDelegation);
}

export async function resolveDelegatedScopes(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<Set<CanonicalOrganizationPermission>> {
  const rows = await db.query<{ scopes: unknown }>(
    `select scopes
       from public.organization_admin_delegations
      where organization_id = $1
        and delegate_user_id = $2
        and revoked_at is null
        and expires_at > now()`,
    [organizationId, userId],
  );
  const scopes = new Set<CanonicalOrganizationPermission>();
  for (const row of rows) {
    if (!Array.isArray(row.scopes)) continue;
    for (const entry of row.scopes) {
      const key = typeof entry === 'string' ? canonicalOrganizationPermission(entry) : null;
      if (key) scopes.add(key);
    }
  }
  return scopes;
}

export interface DelegatedScopeCheck {
  organizationId: string;
  userId: string;
  permission: string;
  request?: Request;
}

/**
 * A delegation grants exactly its scopes: a finance delegation asked to change
 * single sign-on is refused here, and the refusal is audited, because an
 * attempt to leave a scope is what an auditor looks for.
 */
export async function assertDelegatedScope(
  db: DatabaseAdapter,
  input: DelegatedScopeCheck,
): Promise<void> {
  const wanted = canonicalOrganizationPermission(input.permission);
  const scopes = await resolveDelegatedScopes(db, input.organizationId, input.userId);
  if (wanted && expandOrganizationPermissions(scopes).has(wanted)) return;

  await recordAuditEvent({
    userId: input.userId,
    organizationId: input.organizationId,
    eventType: 'admin_delegation_refused',
    request: input.request,
    outcome: 'denied',
    severity: 'warning',
    detail: {
      resourceType: 'admin_delegation',
      resourceId: input.permission,
      scopes: [...scopes],
    },
  });
  throw createError
    .forbidden(`Your delegation does not cover ${input.permission}. Ask a workspace owner for it.`)
    .asUserSafe();
}

export type OwnerAction = 'remove' | 'demote' | 'transfer';

export interface OwnerProtectionInput {
  actorRole: OrganizationRole;
  targetRole: OrganizationRole;
  ownerCount: number;
  action: OwnerAction;
}

const OWNER_ACTION_VERB: Readonly<Record<OwnerAction, string>> = {
  remove: 'remove',
  demote: 'change the role of',
  transfer: 'transfer ownership away from',
};

/**
 * The invariant every owner-touching flow shares: the workspace never ends up
 * with no owner, and an admin who reaches the flow through a delegation never
 * acts on an owner at all, however many owners there are.
 */
export function assertOwnerProtection(input: OwnerProtectionInput): void {
  if (input.targetRole !== 'owner') return;

  if (input.actorRole !== 'owner') {
    throw createError
      .forbidden(`Only a workspace owner can ${OWNER_ACTION_VERB[input.action]} another owner.`)
      .asUserSafe();
  }
  if (input.ownerCount <= 1) {
    throw createError.conflict(
      'Assign another owner before removing or changing the last owner. A workspace without an owner cannot be recovered.',
    );
  }
}
