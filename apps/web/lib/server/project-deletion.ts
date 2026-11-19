import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  legalHoldPredicate,
  projectContentHoldPredicate,
  type LegalHoldResourceType,
} from '@/lib/services/legal-hold-gate';
import { serializeDestructionWithHolds } from '@/lib/services/legal-hold-placement';

export interface DeletedProjectScope {
  projectId: string;
  userId: string;
  organizationId: string | null;
}

export async function projectStorageUrisUnderHold(
  tx: Pick<DatabaseAdapter, 'query'>,
  storageUris: readonly string[],
): Promise<Set<string>> {
  if (storageUris.length === 0) return new Set();
  const held = legalHoldPredicate('project_file', { alias: 'r', nextParamIndex: 2 });
  const rows = await tx.query<{ storage_uri: string }>(
    `select distinct r.storage_uri
       from project_knowledge_files r
      where r.storage_uri = any($1::text[])
        and ${held.sql}`,
    [[...storageUris], ...held.params],
  );
  return new Set(rows.map((row) => row.storage_uri));
}

export class ProjectContentHeldError extends Error {
  constructor(
    readonly resourceType: LegalHoldResourceType,
    readonly resourceId: string,
  ) {
    super('Project content is preserved by an active legal hold.');
    this.name = 'ProjectContentHeldError';
  }
}

export async function retireProjectKnowledgeFile(
  db: Pick<DatabaseAdapter, 'query'>,
  scope: DeletedProjectScope & { fileId: string },
): Promise<boolean> {
  const held = projectContentHoldPredicate('project_file', { project: 'p.id', nextParamIndex: 5 });
  const unheld = { ...held, sql: `not ${held.sql}` };
  const params = [scope.projectId, scope.userId, scope.organizationId, scope.fileId];
  const [removed] = await db.query<{ id: string }>(
    `update project_knowledge_files f set deleted_at=now(), updated_at=now()
       from user_projects p
      where p.id=f.project_id and f.project_id=$1 and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and f.id=$4 and p.deleted_at is null and p.is_archived=false and f.deleted_at is null and ${unheld.sql}
    returning f.id`,
    [...params, ...unheld.params],
  );
  if (removed) return true;
  const [current] = await db.query<{ deleted_at: string | null; held: boolean }>(
    `select f.deleted_at, ${held.sql} as held from project_knowledge_files f
       join user_projects p on p.id=f.project_id where f.project_id=$1 and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and f.id=$4 and p.deleted_at is null and p.is_archived=false limit 1`,
    [...params, ...held.params],
  );
  if (current?.deleted_at != null) return true;
  if (current?.held === true) throw new ProjectContentHeldError('project_file', scope.fileId);
  return false;
}

export async function assertProjectContentUnheld(
  tx: Pick<DatabaseAdapter, 'query'>,
  scope: DeletedProjectScope,
): Promise<void> {
  await serializeDestructionWithHolds(tx, scope.organizationId);
  const projectHeld = projectContentHoldPredicate('project', {
    project: 'p.id',
    nextParamIndex: 4,
  });
  const [parent] = await tx.query<{ id: string }>(
    `select p.id from user_projects p where p.id=$1 and p.user_id=$2
      and p.organization_id is not distinct from $3::uuid and ${projectHeld.sql} limit 1`,
    [scope.projectId, scope.userId, scope.organizationId, ...projectHeld.params],
  );
  if (parent) throw new ProjectContentHeldError('project', parent.id);
  const held = projectContentHoldPredicate('project_file', { project: 'p.id', nextParamIndex: 4 });
  const params = [scope.projectId, scope.userId, scope.organizationId];
  const [preserved] = await tx.query<{ id: string }>(
    `select k.id from project_knowledge_files k join user_projects p on p.id=k.project_id
      where k.project_id=$1::uuid and p.id=k.project_id and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and k.deleted_at is null and ${held.sql} limit 1`,
    [...params, ...held.params],
  );
  if (preserved) throw new ProjectContentHeldError('project_file', preserved.id);
}

export async function releaseDeletedProjectContents(
  tx: Pick<DatabaseAdapter, 'execute' | 'query'>,
  scope: DeletedProjectScope,
): Promise<void> {
  await assertProjectContentUnheld(tx, scope);
  const held = projectContentHoldPredicate('project_file', { project: 'p.id', nextParamIndex: 4 });
  const unheld = { ...held, sql: `not ${held.sql}` };
  const params = [scope.projectId, scope.userId, scope.organizationId];
  await tx.execute(
    `update project_knowledge_files k set deleted_at=now(), updated_at=now()
       from user_projects p where k.project_id=$1::uuid and p.id=k.project_id and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and k.deleted_at is null and ${unheld.sql}`,
    [...params, ...unheld.params],
  );
  const [remaining] = await tx.query<{ id: string; held: boolean }>(
    `select k.id, ${held.sql} as held from project_knowledge_files k
       join user_projects p on p.id=k.project_id
      where k.project_id=$1::uuid and p.id=k.project_id and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and k.deleted_at is null limit 1`,
    [...params, ...held.params],
  );
  if (remaining?.held === true) throw new ProjectContentHeldError('project_file', remaining.id);
  if (remaining)
    throw new Error('Project sources changed while their removal was being committed.');
  await tx.execute(
    `update web_conversations
        set project_id = null, updated_at = now()
      where project_id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null`,
    [scope.projectId, scope.userId, scope.organizationId],
  );
}

export async function retireOwnedProject(
  db: Pick<DatabaseAdapter, 'transaction'>,
  scope: DeletedProjectScope,
): Promise<boolean> {
  return db.transaction((tx) => retireOwnedProjectInTransaction(tx, scope));
}

export async function retireOwnedProjectInTransaction(
  tx: Pick<DatabaseAdapter, 'query' | 'execute'>,
  scope: DeletedProjectScope,
): Promise<boolean> {
  await serializeDestructionWithHolds(tx, scope.organizationId);
  const held = projectContentHoldPredicate('project', { project: 'p.id', nextParamIndex: 4 });
  const unheld = { ...held, sql: `not ${held.sql}` };
  const params = [scope.projectId, scope.userId, scope.organizationId];
  const [removed] = await tx.query<{ id: string }>(
    `update user_projects p set deleted_at=now(), updated_at=now()
        where p.id=$1 and p.user_id=$2 and p.organization_id is not distinct from $3::uuid and p.deleted_at is null and ${unheld.sql} returning p.id`,
    [...params, ...unheld.params],
  );
  if (!removed) {
    const [current] = await tx.query<{ deleted_at: string | null; held: boolean }>(
      `select p.deleted_at, ${held.sql} as held from user_projects p where p.id=$1 and p.user_id=$2 and p.organization_id is not distinct from $3::uuid limit 1`,
      [...params, ...held.params],
    );
    if (!current) return false;
    if (current.deleted_at == null) {
      if (current.held) throw new ProjectContentHeldError('project', scope.projectId);
      return false;
    }
  }
  await releaseDeletedProjectContents(tx, scope);
  return true;
}
