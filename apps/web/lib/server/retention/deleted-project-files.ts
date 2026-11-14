import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { resourceDeletionPolicy } from '@/lib/resources/deletion-policies';
import { recordAuditEvent } from '@/lib/security-audit';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { projectStorageUrisUnderHold } from '@/lib/server/project-deletion';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import { countHeldRows, legalHoldExclusion } from '@/lib/services/legal-hold-gate';
import { serializeDestructionWithHolds } from '@/lib/services/legal-hold-placement';

const TABLE = 'project_knowledge_files';
const MAX_ROWS_PER_RUN = 500;
const BATCH_SIZE = 50;

export interface DeletedProjectFilesPurge {
  candidates: number;
  objectsDeleted: number;
  objectsFailed: number;
  /** Objects another live or held row still addresses, kept while its row went. */
  objectsKept: number;
  objectsLeftToLifecycle: number;
  rowsPurged: number;
  heldFromPurge: number;
}

interface Candidate {
  id: string;
  project_id: string;
}

interface Confirmed {
  id: string;
  storage_uri: string | null;
}

function recoveryWindow(): string {
  const policy = resourceDeletionPolicy(TABLE);
  if (policy === null) throw new Error(`${TABLE} has no resource deletion policy`);
  return `${policy.recoveryWindowDays} days`;
}

function dueForPurge(alias: string, windowParam: string): string {
  return `${alias}.deleted_at is not null
           and ${alias}.deleted_at < now() - ${windowParam}::interval`;
}

async function workspacesOf(
  db: Pick<DatabaseAdapter, 'query'>,
  candidates: readonly Candidate[],
): Promise<Map<string | null, string[]>> {
  const projectIds = [...new Set(candidates.map((candidate) => candidate.project_id))];
  const projects = await db.query<{ id: string; organization_id: string | null }>(
    `select owner_project.id, owner_project.organization_id
       from public.user_projects owner_project
      where owner_project.id = any($1::uuid[])`,
    [projectIds],
  );
  const workspaceOf = new Map(projects.map((row) => [row.id, row.organization_id ?? null]));
  const byWorkspace = new Map<string | null, string[]>();
  for (const candidate of candidates) {
    const workspace = workspaceOf.get(candidate.project_id) ?? null;
    const ids = byWorkspace.get(workspace) ?? [];
    ids.push(candidate.id);
    byWorkspace.set(workspace, ids);
  }
  return byWorkspace;
}

async function deleteUnreferencedObjects(
  tx: Pick<DatabaseAdapter, 'query'>,
  confirmed: readonly Confirmed[],
  deleteObject: (key: string) => Promise<void>,
  tally: DeletedProjectFilesPurge,
): Promise<Set<string>> {
  const uris = [
    ...new Set(
      confirmed
        .map((row) => row.storage_uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
    ),
  ];
  const stillStored = new Set<string>();
  if (uris.length === 0) return stillStored;

  const live = await tx.query<{ storage_uri: string }>(
    `select shared.storage_uri
       from public.project_knowledge_files shared
      where shared.storage_uri = any($1::text[])
        and shared.deleted_at is null`,
    [uris],
  );
  const kept = new Set(live.map((row) => row.storage_uri));
  for (const uri of await projectStorageUrisUnderHold(tx, uris)) kept.add(uri);
  tally.objectsKept += kept.size;
  const ledgerOwned = await tx.query<{ object_key: string }>(
    `select ledger.object_key
       from public.project_knowledge_objects ledger
      where ledger.object_key = any($1::text[])`,
    [uris],
  );
  for (const row of ledgerOwned) {
    if (kept.has(row.object_key)) continue;
    kept.add(row.object_key);
    tally.objectsLeftToLifecycle += 1;
  }

  for (const uri of uris) {
    if (kept.has(uri)) continue;
    const key = objectKeyFromStorageUri(uri);
    if (!key) continue;
    try {
      await deleteObject(key);
      tally.objectsDeleted += 1;
    } catch (error) {
      tally.objectsFailed += 1;
      stillStored.add(uri);
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'A deleted project file object could not be removed; its row is kept for the next run',
      );
    }
  }
  return stillStored;
}

async function purgeWorkspaceBatch(
  db: DatabaseAdapter,
  organizationId: string | null,
  ids: readonly string[],
  window: string,
  deleteObject: (key: string) => Promise<void>,
  tally: DeletedProjectFilesPurge,
): Promise<number> {
  return db.transaction(async (tx) => {
    await serializeDestructionWithHolds(tx, organizationId);
    const confirmedExclusion = legalHoldExclusion('project_file', {
      alias: 'knowledge',
      nextParamIndex: 3,
    });
    const confirmed = await tx.query<Confirmed>(
      `select knowledge.id, knowledge.storage_uri
         from public.project_knowledge_files knowledge
        where knowledge.id = any($1::uuid[])
          and ${dueForPurge('knowledge', '$2')}
          and ${confirmedExclusion.sql}
        for update of knowledge`,
      [ids, window, ...confirmedExclusion.params],
    );
    if (confirmed.length === 0) return 0;

    const stillStored = await deleteUnreferencedObjects(tx, confirmed, deleteObject, tally);
    const purgeable = confirmed
      .filter((row) => row.storage_uri === null || !stillStored.has(row.storage_uri))
      .map((row) => row.id);
    if (purgeable.length === 0) return 0;

    const purgeExclusion = legalHoldExclusion('project_file', {
      alias: 'target',
      nextParamIndex: 2,
    });
    const purged = await tx.query<{ id: string }>(
      `delete from public.project_knowledge_files target
        where target.id = any($1::uuid[])
          and ${purgeExclusion.sql}
        returning target.id`,
      [purgeable, ...purgeExclusion.params],
    );
    return purged.length;
  });
}

export async function recordDeletedContentPurge(input: {
  organizationId: string | null;
  resourceType: string;
  table: string;
  rowsPurged: number;
  objectsDeleted: number;
}): Promise<void> {
  if (input.rowsPurged === 0 && input.objectsDeleted === 0) return;
  const source = resourceDeletionPolicy(input.table)?.externalObjects?.sweep ?? input.table;
  await recordAuditEvent({
    userId: 'system',
    eventType: 'deleted_content_purged',
    organizationId: input.organizationId,
    severity: 'warning',
    detail: {
      resourceType: input.resourceType,
      source,
      deleted: input.rowsPurged,
      count: input.objectsDeleted,
    },
  }).catch((error: unknown) => {
    logger.error(
      { error, resourceType: input.resourceType },
      'A purge of deleted content could not be audited',
    );
  });
}

// A deletion a hold deferred completes here once no hold covers the file, on
// the same window an unheld deletion gets; a file nobody deleted never qualifies.
export async function purgeDeletedProjectFiles(
  db: DatabaseAdapter,
  options: { deleteObject?: (key: string) => Promise<void> } = {},
): Promise<DeletedProjectFilesPurge> {
  const deleteObject = options.deleteObject ?? deleteProjectKnowledgeObject;
  const window = recoveryWindow();
  const tally: DeletedProjectFilesPurge = {
    candidates: 0,
    objectsDeleted: 0,
    objectsFailed: 0,
    objectsKept: 0,
    objectsLeftToLifecycle: 0,
    rowsPurged: 0,
    heldFromPurge: 0,
  };

  tally.heldFromPurge = await countHeldRows(db, 'project_file', {
    table: TABLE,
    alias: 'knowledge',
    where: dueForPurge('knowledge', '$1'),
    params: [window],
  });
  const candidateExclusion = legalHoldExclusion('project_file', {
    alias: 'knowledge',
    nextParamIndex: 2,
  });
  const candidates = await db.query<Candidate>(
    `select knowledge.id, knowledge.project_id
       from public.project_knowledge_files knowledge
      where ${dueForPurge('knowledge', '$1')}
        and ${candidateExclusion.sql}
      order by knowledge.deleted_at asc
      limit ${MAX_ROWS_PER_RUN}`,
    [window, ...candidateExclusion.params],
  );
  tally.candidates = candidates.length;
  if (candidates.length === 0) return tally;

  for (const [organizationId, ids] of await workspacesOf(db, candidates)) {
    const before = tally.objectsDeleted;
    let purged = 0;
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      purged += await purgeWorkspaceBatch(
        db,
        organizationId,
        ids.slice(offset, offset + BATCH_SIZE),
        window,
        deleteObject,
        tally,
      );
    }
    tally.rowsPurged += purged;
    await recordDeletedContentPurge({
      organizationId,
      resourceType: 'project_file',
      table: TABLE,
      rowsPurged: purged,
      objectsDeleted: tally.objectsDeleted - before,
    });
  }
  return tally;
}
