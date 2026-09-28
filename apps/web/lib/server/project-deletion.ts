import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';

const PG_UNDEFINED_COLUMN = '42703';
const PG_UNDEFINED_TABLE = '42P01';

export interface DeletedProjectScope {
  projectId: string;
  userId: string;
  organizationId: string | null;
}

export function isProjectSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === PG_UNDEFINED_COLUMN || code === PG_UNDEFINED_TABLE;
}

export async function releaseDeletedProjectContents(
  tx: Pick<DatabaseAdapter, 'execute' | 'query'>,
  scope: DeletedProjectScope,
  options: { purgeKnowledgeFiles: boolean },
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
  if (!options.purgeKnowledgeFiles) return [];
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
  return purged
    .map((row) => row.storage_uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
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
  let storageUris: string[];
  try {
    storageUris = await db.transaction((tx) =>
      releaseDeletedProjectContents(tx, scope, { purgeKnowledgeFiles: true }),
    );
  } catch (error) {
    if (!isProjectSchemaNotReady(error)) throw error;
    logger.warn(
      { error, projectId: scope.projectId, userId: scope.userId },
      'Knowledge-file schema not ready; releasing project chats without source cleanup',
    );
    storageUris = await db.transaction((tx) =>
      releaseDeletedProjectContents(tx, scope, { purgeKnowledgeFiles: false }),
    );
  }
  await deleteDeletedProjectObjects(storageUris, scope);
}
