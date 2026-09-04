import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

/**
 * The organization an enterprise contract actually funds: the org owned by
 * the caller (`organizations.owner_user_id`), or failing that, an
 * organization the caller holds a seat in. Deliberately independent of
 * `resolveActiveOrganizationId`, which honors the caller-supplied
 * `x-agi-organization-id` header (including the documented `personal`
 * value): a delinquent org's own owner or member can send that header to
 * pick which organization gets consulted, which must never be the mechanism
 * that decides whether a billing hold, entitlement check, or metered cost
 * event resolves against the right contract.
 */
export async function resolveEnterpriseFundingOrganizationId(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<string | null> {
  const [row] = await db.query<{ organization_id: string }>(
    `select organization_id
       from (
         select o.id as organization_id, 0 as priority
           from public.organizations o
          where o.owner_user_id = $1
         union all
         select m.organization_id, 1 as priority
           from public.organization_members m
          where m.user_id = $1
       ) funding
      order by priority asc
      limit 1`,
    [userId],
  );
  return row?.organization_id ?? null;
}
