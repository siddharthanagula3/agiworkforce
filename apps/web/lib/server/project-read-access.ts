import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { WorkspaceScope } from '@/lib/server/workspace-scope';

// Every consuming statement binds project, caller, and admitted workspace in that order.
export const READABLE_PROJECT_SCOPE_SQL = `p.id = $1
        and p.deleted_at is null
        and (
          (p.user_id = $2 and p.organization_id is not distinct from $3::uuid)
          or (
            $3::uuid is not null
            and (p.organization_id is null or p.organization_id = $3::uuid)
            and exists (
              select 1
                from public.organization_shared_projects s
                join public.organization_members m
                  on m.organization_id = s.organization_id
                 and m.user_id = $2
                 and m.status = 'active'
                left join public.organization_project_access a
                  on a.organization_id = s.organization_id
                 and a.project_id = s.project_id
                 and a.user_id = $2
               where s.project_id = p.id
                 and s.organization_id = $3::uuid
                 and public.app_org_resource_is_readable(s.organization_id)
                 and coalesce(a.access, s.default_access) in ('read', 'write')
            )
          )
        )`;

export async function selectReadableProject(
  db: DatabaseAdapter,
  scope: WorkspaceScope,
  projectId: string,
): Promise<{ id: string } | undefined> {
  const [project] = await db.query<{ id: string }>(
    `select p.id
       from user_projects p
      where ${READABLE_PROJECT_SCOPE_SQL}
      limit 1`,
    [projectId, scope.userId, scope.organizationId],
  );
  return project;
}
