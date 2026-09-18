import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  isOrganizationPermission,
  type OrganizationPermission,
} from '@agiworkforce/types';

import { createError } from '@/lib/errors';

export const SERVICE_PRINCIPAL_ACTOR_PREFIX = 'service_principal:';

export interface ServicePrincipal {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  maxScopes: OrganizationPermission[];
  createdByUserId: string | null;
  createdAt: string;
  disabledAt: string | null;
}

/**
 * A non-interactive workspace actor. It has no user id, no session and no
 * personal data, so it can never stand in for a member: every capability it
 * holds is a workspace permission it was explicitly granted.
 */
export interface ServicePrincipalIdentity {
  kind: 'service_principal';
  principalId: string;
  keyId: string;
  organizationId: string;
  name: string;
  scopes: ReadonlySet<OrganizationPermission>;
}

interface ServicePrincipalRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  max_scopes: string[];
  created_by_user_id: string | null;
  created_at: string | Date;
  disabled_at: string | Date | null;
}

const PRINCIPAL_COLUMNS =
  'id, organization_id, name, description, max_scopes, created_by_user_id, created_at, disabled_at';

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function present(row: ServicePrincipalRow): ServicePrincipal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    maxScopes: row.max_scopes.filter(isOrganizationPermission).sort(),
    createdByUserId: row.created_by_user_id,
    createdAt: toIso(row.created_at) ?? '',
    disabledAt: toIso(row.disabled_at),
  };
}

export function servicePrincipalActorId(principalId: string): string {
  return `${SERVICE_PRINCIPAL_ACTOR_PREFIX}${principalId}`;
}

export function isServicePrincipalActor(actorId: string | null | undefined): boolean {
  return typeof actorId === 'string' && actorId.startsWith(SERVICE_PRINCIPAL_ACTOR_PREFIX);
}

/**
 * Refuses an automation on a capability that belongs to a person. A service
 * principal has no inbox, no memory, no personal files and no consent to give,
 * so a route that acts on behalf of an individual must call this rather than
 * treat the principal's actor id as a user id.
 */
export function assertInteractiveMemberActor(actorId: string, capability: string): void {
  if (isServicePrincipalActor(actorId)) {
    throw createError
      .forbidden(
        `${capability} acts on behalf of a person. A workspace service principal cannot perform it.`,
      )
      .asUserSafe();
  }
}

export function assertServicePrincipalScope(
  identity: ServicePrincipalIdentity,
  permission: OrganizationPermission,
): void {
  if (!identity.scopes.has(permission)) {
    throw createError
      .forbidden(`This workspace API key is not scoped for ${permission}.`)
      .asUserSafe();
  }
}

export function boundedPrincipalScopes(
  requested: readonly OrganizationPermission[],
  maxScopes: readonly OrganizationPermission[],
): { scopes: OrganizationPermission[]; refused: OrganizationPermission[] } {
  const ceiling = new Set(maxScopes);
  const scopes: OrganizationPermission[] = [];
  const refused: OrganizationPermission[] = [];
  for (const scope of new Set(requested)) {
    if (ceiling.has(scope)) scopes.push(scope);
    else refused.push(scope);
  }
  return { scopes: scopes.sort(), refused: refused.sort() };
}

export async function createServicePrincipal(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    name: string;
    description?: string | null;
    maxScopes: readonly OrganizationPermission[];
    createdByUserId: string;
  },
): Promise<ServicePrincipal> {
  const grantable = input.maxScopes.filter((scope) =>
    GRANTABLE_ORGANIZATION_PERMISSIONS.includes(scope),
  );
  if (grantable.length === 0) {
    throw createError
      .validation('A service principal needs at least one workspace permission.')
      .asUserSafe();
  }
  const [row] = await db.query<ServicePrincipalRow>(
    `insert into public.organization_service_principals
       (organization_id, name, description, max_scopes, created_by_user_id)
     values ($1, $2, $3, $4::text[], $5)
     returning ${PRINCIPAL_COLUMNS}`,
    [
      input.organizationId,
      input.name,
      input.description ?? null,
      [...new Set(grantable)].sort(),
      input.createdByUserId,
    ],
  );
  if (!row) throw new Error('The service principal was not stored.');
  return present(row);
}

export async function listServicePrincipals(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<ServicePrincipal[]> {
  const rows = await db.query<ServicePrincipalRow>(
    `select ${PRINCIPAL_COLUMNS}
       from public.organization_service_principals
      where organization_id = $1
      order by created_at desc`,
    [organizationId],
  );
  return rows.map(present);
}

export async function readServicePrincipal(
  db: DatabaseAdapter,
  organizationId: string,
  principalId: string,
): Promise<ServicePrincipal | null> {
  const [row] = await db.query<ServicePrincipalRow>(
    `select ${PRINCIPAL_COLUMNS}
       from public.organization_service_principals
      where organization_id = $1 and id = $2`,
    [organizationId, principalId],
  );
  return row ? present(row) : null;
}

/**
 * Disabling stops every key issued to the principal at once, which is the only
 * way to stop an automation whose keys are spread across several systems.
 */
export async function setServicePrincipalDisabled(
  db: DatabaseAdapter,
  input: {
    organizationId: string;
    principalId: string;
    disabled: boolean;
    actorUserId: string;
  },
): Promise<ServicePrincipal | null> {
  const [row] = await db.query<ServicePrincipalRow>(
    `update public.organization_service_principals
        set disabled_at = case when $3 then now() else null end,
            disabled_by_user_id = case when $3 then $4 else null end
      where organization_id = $1 and id = $2
      returning ${PRINCIPAL_COLUMNS}`,
    [input.organizationId, input.principalId, input.disabled, input.actorUserId],
  );
  return row ? present(row) : null;
}
