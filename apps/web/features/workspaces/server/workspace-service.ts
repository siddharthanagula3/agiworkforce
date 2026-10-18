import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { WorkspaceSummary } from '@agiworkforce/types';

interface WorkspaceRow {
  id: string;
  kind: WorkspaceSummary['kind'];
  organization_id: string | null;
  name: string;
  slug: string;
  is_primary: boolean;
  role: string | null;
}

export async function listAccountWorkspaces(
  db: DatabaseAdapter,
  userId: string,
): Promise<WorkspaceSummary[]> {
  const rows = await db.query<WorkspaceRow>(
    `select w.id, w.kind, w.organization_id, w.name, w.slug, w.is_primary, m.role
       from public.workspaces w
       join public.organization_members m
         on m.organization_id = w.organization_id
        and m.user_id = $1
        and m.status = 'active'
      where w.kind = 'organization'
      union all
     select w.id, w.kind, w.organization_id, w.name, w.slug, w.is_primary, null
       from public.workspaces w
      where w.kind = 'personal' and w.owner_account_id = $1
      order by 4`,
    [userId],
  );
  return rows.map(formatWorkspace);
}

function formatWorkspace(row: WorkspaceRow): WorkspaceSummary {
  return {
    id: row.id,
    kind: row.kind,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    isPrimary: row.is_primary,
    role: row.role,
  };
}

// Undefined when the account cannot open that workspace at all, which the
// caller refuses rather than downgrading to personal scope.
export function organizationForWorkspace(
  workspaces: readonly WorkspaceSummary[],
  workspaceId: string,
): string | null | undefined {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) return undefined;
  return workspace.kind === 'personal' ? null : workspace.organizationId;
}
