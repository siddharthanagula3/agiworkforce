import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { WorkspacePolicyOverrideSubject } from '@agiworkforce/types';
import { policySubjectExists } from '@/lib/services/organization-policy-override-service';

// A project or device layer must name one belonging to a member of this
// workspace, so a layer can never be written against another workspace's id.
export async function policyScopeSubjectExists(
  db: DatabaseAdapter,
  organizationId: string,
  subjectType: WorkspacePolicyOverrideSubject,
  subjectId: string,
): Promise<boolean> {
  if (subjectType === 'project') {
    const rows = await db.query<Record<string, unknown>>(
      `select 1
         from public.user_projects p
         join public.organization_members m on m.user_id = p.user_id
        where p.id::text = $2 and m.organization_id = $1
        limit 1`,
      [organizationId, subjectId],
    );
    return rows.length > 0;
  }

  if (subjectType === 'device') {
    const rows = await db.query<Record<string, unknown>>(
      `select 1
         from public.device_installations i
         join public.organization_members m on m.user_id = i.account_id
        where i.device_id = $2 and m.organization_id = $1
        limit 1`,
      [organizationId, subjectId],
    );
    return rows.length > 0;
  }

  return policySubjectExists(db, organizationId, subjectType, subjectId);
}
