import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { organizationCanShareArtifacts } from '@/lib/services/org-entitlements';

export async function describePublishedArtifactWorkspace(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<{ memberCount: number } | null> {
  if (!organizationId || !(await organizationCanShareArtifacts(organizationId))) return null;
  const [row] = await db.query<{ member_count: number | string | null }>(
    `select count(*) as member_count
       from public.organization_members
      where organization_id = $1`,
    [organizationId],
  );
  const parsed = Number(row?.member_count ?? 0);
  return { memberCount: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0 };
}
