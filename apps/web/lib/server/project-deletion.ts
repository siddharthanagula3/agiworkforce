import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';

export interface DeletedProjectScope {
  projectId: string;
  userId: string;
  organizationId: string | null;
}

/**
 * Returns the storage URIs whose objects may now be deleted. A duplicated
 * project copies `storage_uri` rather than the object, so a URI another live
 * source still points at is kept.
 */
export async function releaseDeletedProjectContents(
  tx: Pick<DatabaseAdapter, 'execute' | 'query'>,
  scope: DeletedProjectScope,
): Promise<string[]> {
  await tx.execute(
    `update web_conversations
        set project_id = null, updated_at = now()
      where project_id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null`,
    [scope.projectId, scope.userId, scope.organizationId],
  );
  const purged = await tx.query<{ storage_uri: string | null }>(
    `update project_knowledge_files k
        set deleted_at = now(), updated_at = now()
       from user_projects p
      where k.project_id = $1::uuid
        and p.id = k.project_id
        and p.user_id = $2
        and p.organization_id is not distinct from $3::uuid
        and k.deleted_at is null
    returning k.storage_uri`,
    [scope.projectId, scope.userId, scope.organizationId],
  );
  const released = [
    ...new Set(
      purged
        .map((row) => row.storage_uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
    ),
  ];
  if (released.length === 0) return [];
  const stillReferenced = await tx.query<{ storage_uri: string }>(
    `select distinct storage_uri
       from project_knowledge_files
      where storage_uri = any($1::text[])
        and deleted_at is null
        and project_id in (
          select id
            from user_projects
           where user_id = $2
             and organization_id is not distinct from $3::uuid
        )`,
    [released, scope.userId, scope.organizationId],
  );
  const shared = new Set(stillReferenced.map((row) => row.storage_uri));
  return released.filter((uri) => !shared.has(uri));
}

export async function deleteDeletedProjectObjects(
  storageUris: readonly string[],
  scope: DeletedProjectScope,
): Promise<void> {
  for (const storageUri of storageUris) {
    const objectKey = objectKeyFromStorageUri(storageUri);
    if (!objectKey) continue;
    try {
      await deleteProjectKnowledgeObject(objectKey);
    } catch (error) {
      logger.error(
        { error, projectId: scope.projectId, userId: scope.userId, objectKey },
        'Failed to delete a project knowledge object after project deletion',
      );
    }
  }
}

export async function releaseTombstonedProject(
  db: Pick<DatabaseAdapter, 'transaction'>,
  scope: DeletedProjectScope,
): Promise<void> {
  const storageUris = await db.transaction((tx) => releaseDeletedProjectContents(tx, scope));
  await deleteDeletedProjectObjects(storageUris, scope);
}
