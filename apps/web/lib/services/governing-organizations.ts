import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

/**
 * Every organization that governs a caller, owned organizations first.
 *
 * Deliberately independent of `resolveActiveOrganizationId`, which honors the
 * caller-supplied `x-agi-organization-id` header (including the documented
 * `personal` value). An account-level control, meaning authentication strength,
 * network origin, data retention or secret handling, must never let the request
 * choose the scope it is evaluated against, and must bind against every
 * organization the caller belongs to rather than the one they selected.
 */
export async function resolveGoverningOrganizationIds(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<readonly string[]> {
  const rows = await db.query<{ organization_id: string }>(
    `select organization_id
       from (
         select o.id as organization_id, 0 as priority
           from public.organizations o
          where o.owner_user_id = $1
         union all
         select m.organization_id, 1 as priority
           from public.organization_members m
          where m.user_id = $1
       ) governing
      group by organization_id
      order by min(priority) asc, organization_id asc`,
    [userId],
  );
  return rows.map((row) => row.organization_id);
}
