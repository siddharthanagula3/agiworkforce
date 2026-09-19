import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import type { ScimProvisionedUserRow } from '@/lib/server/neon-types';
import { listVerifiedDomains, ownsEmailDomain } from '@/lib/services/organization-verified-domains';
import { reconcileMembership, SCIM_USER_SELECT_COLUMNS } from './scim-provisioning-service';

interface PendingScimUser {
  id: string;
  connection_id: string;
  organization_id: string;
}

export interface ScimSignInLinkResult {
  linked: number;
  failed: number;
}

export async function linkPendingScimUsersAtSignIn(
  db: DatabaseAdapter,
  userId: string,
  email: string,
): Promise<ScimSignInLinkResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { linked: 0, failed: 0 };

  const candidates = await db.query<PendingScimUser>(
    `select id, connection_id, organization_id
       from public.scim_provisioned_users
      where linked_user_id is null
        and active = true
        and lower(email) = $1
      order by created_at asc`,
    [normalizedEmail],
  );

  let linked = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const granted = await db.transaction(async (tx) => {
        const [row] = await tx.query<ScimProvisionedUserRow>(
          `select ${SCIM_USER_SELECT_COLUMNS}
             from public.scim_provisioned_users
            where id = $1
              and connection_id = $2
              and organization_id = $3
              and linked_user_id is null
              and active = true
              and lower(email) = $4
            for update`,
          [candidate.id, candidate.connection_id, candidate.organization_id, normalizedEmail],
        );
        if (!row) return false;

        const domains = await listVerifiedDomains(tx, candidate.organization_id);
        if (!ownsEmailDomain(normalizedEmail, domains)) return false;

        const updated = await tx.execute(
          `update public.scim_provisioned_users
              set linked_user_id = $1, linked_at = now()
            where id = $2
              and connection_id = $3
              and organization_id = $4
              and linked_user_id is null`,
          [userId, candidate.id, candidate.connection_id, candidate.organization_id],
        );
        if (updated === 0) return false;

        row.linked_user_id = userId;
        const outcome = await reconcileMembership(
          tx,
          {
            connectionId: candidate.connection_id,
            organizationId: candidate.organization_id,
          },
          row,
        );
        return outcome.membershipGranted;
      });
      if (granted) linked += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        {
          error,
          userId,
          scimUserId: candidate.id,
          organizationId: candidate.organization_id,
        },
        'Pending directory membership could not be linked at sign-in',
      );
    }
  }

  return { linked, failed };
}
