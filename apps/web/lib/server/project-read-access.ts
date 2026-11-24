import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { WorkspaceScope } from '@/lib/server/workspace-scope';

function sharedGrantSql(caller: string, workspace: string): string {
  return `(
            ${workspace}::uuid is not null
            and (p.organization_id is null or p.organization_id = ${workspace}::uuid)
            and exists (
              select 1
                from public.organization_shared_projects s
                join public.organization_members m
                  on m.organization_id = s.organization_id
                 and m.user_id = ${caller}
                 and m.status = 'active'
                left join public.organization_project_access a
                  on a.organization_id = s.organization_id
                 and a.project_id = s.project_id
                 and a.user_id = ${caller}
               where s.project_id = p.id
                 and s.organization_id = ${workspace}::uuid
                 and public.app_org_resource_is_readable(s.organization_id)
                 and coalesce(a.access, s.default_access) in ('read', 'write')
            )
          )`;
}

export function readableProjectAccessSql(caller: string, workspace: string): string {
  return `p.deleted_at is null
        and (
          (p.user_id = ${caller} and p.organization_id is not distinct from ${workspace}::uuid)
          or ${sharedGrantSql(caller, workspace)}
        )`;
}

export function syncableProjectAccessSql(caller: string, workspace: string): string {
  return `(
          (p.user_id = ${caller} and p.organization_id is not distinct from ${workspace}::uuid)
          or (p.deleted_at is null and ${sharedGrantSql(caller, workspace)})
        )`;
}

export function loadableProjectAccessSql(caller: string, workspace: string): string {
  return `p.deleted_at is null
        and (
          p.user_id = ${caller}
          or ${sharedGrantSql(caller, workspace)}
        )`;
}

// Every consuming statement binds project, caller, and admitted workspace in that order.
export const READABLE_PROJECT_SCOPE_SQL = `p.id = $1
        and ${readableProjectAccessSql('$2', '$3')}`;

export const LOADABLE_PROJECT_SCOPE_SQL = `p.id = $1
        and ${loadableProjectAccessSql('$2', '$3')}`;

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

export async function selectChatProject(
  db: DatabaseAdapter,
  scope: WorkspaceScope,
  projectId: string,
): Promise<{ id: string } | undefined> {
  const [project] = await db.query<{ id: string }>(
    `select p.id
       from user_projects p
      where ${READABLE_PROJECT_SCOPE_SQL}
        and p.is_archived = false
      limit 1`,
    [projectId, scope.userId, scope.organizationId],
  );
  return project;
}
