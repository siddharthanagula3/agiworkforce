import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { IdentityProvider } from '@agiworkforce/identity';

import { logger } from '@/lib/logger';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import { deprovisionMember } from '@/lib/services/deprovision-service';

/**
 * Deleting a `directory_sync_connections` row cascades the SCIM resources
 * (tokens, provisioned users, groups, events) and stops there. The access those
 * resources GRANTED lives in `organization_members`, which has no foreign key
 * to the connection, so a workspace that disconnects its directory keeps every
 * member the directory put there, with live sessions and keys. That is the
 * offboarding hole this closes.
 *
 * Scope is deliberately narrow. Only a membership whose `provisioning_source`
 * is `scim` was granted by a directory, only a member linked to THIS connection
 * is affected, and a member another live connection still provisions keeps
 * their seat. Owners are never removed here for the same reason the per-user
 * SCIM path never removes them: an IdP must not be able to orphan a workspace.
 */

export const DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING = 200;

export interface DirectorySyncRevocationInput {
  organizationId: string;
  connectionId: string;
}

export interface DirectorySyncRevocationResult {
  organizationId: string;
  connectionId: string;
  membershipsRevoked: number;
  membersDeprovisioned: number;
  credentialsNotRevoked: number;
  ownersRetained: number;
  errors: string[];
}

type SessionRevoker = Pick<IdentityProvider, 'listUserSessions' | 'revokeSession'>;

const REVOKE_MEMBERSHIPS_SQL = `delete from public.organization_members m
       where m.organization_id = $1
         and m.provisioning_source = 'scim'
         and m.role <> 'owner'
         and exists (
           select 1
             from public.scim_provisioned_users u
            where u.connection_id = $2
              and u.organization_id = m.organization_id
              and u.linked_user_id = m.user_id
         )
         and not exists (
           select 1
             from public.scim_provisioned_users o
             join public.directory_sync_connections c on c.id = o.connection_id
            where o.organization_id = m.organization_id
              and o.linked_user_id = m.user_id
              and o.connection_id <> $2
              and o.active
              and c.is_active
         )
   returning m.user_id`;

const RETAINED_OWNERS_SQL = `select count(*)::text as count
       from public.organization_members m
      where m.organization_id = $1
        and m.role = 'owner'
        and exists (
          select 1
            from public.scim_provisioned_users u
           where u.connection_id = $2
             and u.organization_id = m.organization_id
             and u.linked_user_id = m.user_id
        )`;

export async function revokeDirectorySyncGrants(
  db: DatabaseAdapter,
  identity: SessionRevoker,
  input: DirectorySyncRevocationInput,
): Promise<DirectorySyncRevocationResult> {
  const { organizationId, connectionId } = input;
  const errors: string[] = [];

  const revokedRows = await db.query<{ user_id: string }>(REVOKE_MEMBERSHIPS_SQL, [
    organizationId,
    connectionId,
  ]);
  const revokedUserIds = revokedRows.map((row) => row.user_id);

  let ownersRetained = 0;
  try {
    const [ownerRow] = await db.query<{ count: string }>(RETAINED_OWNERS_SQL, [
      organizationId,
      connectionId,
    ]);
    ownersRetained = Number(ownerRow?.count ?? 0);
  } catch (error) {
    errors.push(
      `Owners this connection provisioned could not be counted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  for (const userId of revokedUserIds) {
    try {
      await invalidateActiveOrganizationCache(userId);
    } catch (error) {
      errors.push(
        `${userId}: cached workspace was not dropped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const toDeprovision = revokedUserIds.slice(0, DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING);
  const credentialsNotRevoked = revokedUserIds.length - toDeprovision.length;

  let membersDeprovisioned = 0;
  for (const userId of toDeprovision) {
    try {
      const result = await deprovisionMember(db, identity, { userId, organizationId });
      membersDeprovisioned += 1;
      for (const message of result.errors) errors.push(`${userId}: ${message}`);
    } catch (error) {
      errors.push(
        `${userId}: credentials were not revoked: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (credentialsNotRevoked > 0) {
    errors.push(
      `${credentialsNotRevoked} member(s) lost their membership but keep live sessions and keys, because credential revocation stops at ${DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING} members per request. Remove them from Team settings to revoke the rest.`,
    );
  }

  const result: DirectorySyncRevocationResult = {
    organizationId,
    connectionId,
    membershipsRevoked: revokedUserIds.length,
    membersDeprovisioned,
    credentialsNotRevoked,
    ownersRetained,
    errors,
  };

  if (errors.length > 0) {
    logger.error({ ...result }, '[directory-sync] connection revoked with unreached access');
  } else {
    logger.info({ ...result }, '[directory-sync] connection grants revoked');
  }

  return result;
}
