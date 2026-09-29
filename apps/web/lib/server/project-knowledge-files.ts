import 'server-only';

import { createError } from '@/lib/errors';
import { assertFileStorageAvailable, resolveFileStorageAllowance } from '@/lib/server/file-storage';
import { logger } from '@/lib/logger';
import { mapKnowledgeFileRow } from '@/lib/projects';
import type { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveProjectWriteAccess } from '@/lib/services/org-sharing-service';
import { MAX_KNOWLEDGE_FILES } from '@/lib/services/project-context-service';
import {
  extractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError,
} from '@/lib/server/project-knowledge-extraction';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { fileTextPreviewKind } from '@/lib/server/file-text-preview';
import { enqueueJob } from '@/lib/jobs/job-service';
import {
  deleteProjectKnowledgeObject,
  sealProjectKnowledgeObject,
} from '@/lib/server/project-knowledge-object-storage';
import { recordModerationEvent } from '@/lib/moderation';
import { validateAttachmentMeta } from '@agiworkforce/types';
import type { ManagedCloudProjectKnowledgeRegisterRequest } from '@agiworkforce/cloud-contracts';
import type { ExternalResourceReferenceInput } from '@agiworkforce/types';
import { recordExternalResourceReferences } from '@/lib/server/external-resource-references';
import {
  externalOriginHoldsGoogleUserData,
  GOOGLE_USER_DATA_SCAN_WITHHELD_MESSAGE,
} from '@/lib/connectors/google-user-data-runs';
import type { BillingPlanTier, ProjectKnowledgeIndexState } from '@agiworkforce/types';
import {
  findProjectKnowledgeDocument,
  readProjectKnowledgeIndexStates,
} from '@/lib/services/retrieval-index-service';
import { dispatchRetrievalIndexWorkflows } from '@/lib/workflows/start-retrieval-index-workflow';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

export interface OwnedProjectKnowledgeFile {
  mimeType: string;
  fileName: string;
  storageUri: string;
}

export async function findOwnedProjectKnowledgeFile(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  owner: { userId: string; organizationId: string | null },
  projectId: string,
  fileId: string,
): Promise<OwnedProjectKnowledgeFile | null> {
  const [file] = await db.query<{
    mime_type: string | null;
    file_name: string;
    storage_uri: string | null;
  }>(
    `select f.mime_type, f.file_name, f.storage_uri
       from project_knowledge_files f
       join user_projects p on p.id = f.project_id
      where f.id = $1
        and f.project_id = $2
        and f.deleted_at is null
        and p.user_id = $3
        and p.organization_id is not distinct from $4::uuid
        and p.deleted_at is null
      limit 1`,
    [fileId, projectId, owner.userId, owner.organizationId],
  );
  if (!file?.storage_uri) return null;
  return {
    mimeType: file.mime_type || 'application/octet-stream',
    fileName: file.file_name,
    storageUri: file.storage_uri,
  };
}

export function projectKnowledgeResponse(
  row: Record<string, unknown>,
  projectId: string,
  indexing: ProjectKnowledgeIndexState | null = null,
) {
  const file = mapKnowledgeFileRow(row);
  const previewKind = fileTextPreviewKind(file.fileName, file.mimeType);
  return {
    ...file,
    storageUri: `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
    textPreview: previewKind === 'table' || previewKind === 'office',
    indexing,
  };
}

export async function readIndexStates(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  projectId: string,
  fileIds: string[],
): Promise<Map<string, ProjectKnowledgeIndexState>> {
  try {
    return await readProjectKnowledgeIndexStates(db, projectId, fileIds);
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.warn({ error }, '[knowledge-files] index state read failed');
    }
    return new Map();
  }
}

async function dispatchKnowledgeIndexing(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  fileId: string,
  ownerUserId: string,
): Promise<void> {
  try {
    const document = await findProjectKnowledgeDocument(db, { fileId, ownerUserId });
    if (!document) return;
    await dispatchRetrievalIndexWorkflows([
      {
        documentId: document.id,
        userId: document.user_id,
        organizationId: document.organization_id,
      },
    ]);
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.warn({ error, fileId }, '[knowledge-files] indexing was not dispatched');
    }
  }
}

async function purgeUploadedKnowledgeObject(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  userId: string,
  projectId: string,
  storageUri: string,
): Promise<void> {
  const objectKey = objectKeyFromStorageUri(storageUri);
  if (!objectKey) return;
  try {
    await deleteProjectKnowledgeObject(objectKey);
  } catch (deleteError) {
    logger.error(
      { err: deleteError, userId, projectId, objectKey },
      '[knowledge-files] could not delete an uploaded object from storage; queued for retry',
    );
    try {
      await enqueueJob(db, {
        kind: 'file-processing.purge-upload-object',
        userId,
        idempotencyKey: `purge-upload:${objectKey}`.slice(0, 255),
        payload: { objectKey, projectId },
      });
    } catch (queueError) {
      logger.error(
        { err: queueError, userId, projectId, objectKey },
        '[knowledge-files] CRITICAL: an uploaded object is neither deleted nor queued for deletion',
      );
    }
  }
}

function unreadableUploadSummary(mimeType: string, extractedText: string | null): string | null {
  if (extractedText !== null) return null;
  return mimeType.trim().toLowerCase().startsWith('image/')
    ? 'Not readable: text is not extracted from images, so only this file name reaches the model.'
    : 'Not readable: no text could be extracted from this file, so only its name reaches the model.';
}

export function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export type ProjectKnowledgeRegistration =
  | {
      status: 'created';
      file: ReturnType<typeof projectKnowledgeResponse>;
      /** Why part of the file was not read, for the person who added it. */
      notice?: string;
    }
  | { status: 'unavailable' };

export interface ProjectKnowledgeScope {
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  userId: string;
  organizationId: string | null;
  projectId: string;
}

export type ProjectKnowledgeCapacity =
  { status: 'ready'; planTier: BillingPlanTier } | { status: 'unavailable' };

export async function checkProjectKnowledgeCapacity(
  scope: ProjectKnowledgeScope,
  body: Pick<
    ManagedCloudProjectKnowledgeRegisterRequest,
    'fileName' | 'mimeType' | 'byteCount' | 'checksumSha256'
  >,
): Promise<ProjectKnowledgeCapacity> {
  const { db, userId, organizationId, projectId } = scope;
  const attachmentValidation = validateAttachmentMeta(
    body.fileName.trim(),
    body.mimeType.trim(),
    body.byteCount,
  );
  if (!attachmentValidation.ok) {
    throw createError.validation(attachmentValidation.message);
  }
  const [owned] = await db.query<{ id: string; is_archived: boolean }>(
    `select id, is_archived
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );

  let archived = owned?.is_archived === true;
  if (!owned) {
    const writeAccess = await resolveProjectWriteAccess(db, { projectId, userId, organizationId });
    if (writeAccess !== 'editor') {
      throw createError.notFound('Project not found');
    }
    const [shared] = await db.query<{ id: string; is_archived: boolean }>(
      `select id, is_archived
         from user_projects
        where id = $1
          and organization_id is not distinct from $2::uuid
          and deleted_at is null
        limit 1`,
      [projectId, organizationId],
    );
    if (!shared) {
      throw createError.notFound('Project not found');
    }
    archived = shared.is_archived === true;
  }
  if (archived) {
    throw createError.conflict('This project is archived. Unarchive it to add sources.');
  }

  let activeCount = 0;
  try {
    const [countRow] = await db.query<{ count: number }>(
      `select count(*)::int as count
         from project_knowledge_files
        where project_id = $1 and deleted_at is null and superseded_at is null`,
      [projectId],
    );
    activeCount = countRow?.count ?? 0;
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { status: 'unavailable' };
    }
    throw error;
  }
  if (activeCount >= MAX_KNOWLEDGE_FILES) {
    throw createError.conflict(
      `This project already has the maximum of ${MAX_KNOWLEDGE_FILES} knowledge files. Remove a file before adding another.`,
    );
  }

  let duplicate: { id: string; file_name: string } | undefined;
  try {
    [duplicate] = await db.query<{ id: string; file_name: string }>(
      `select id, file_name
         from project_knowledge_files
        where project_id = $1 and checksum_sha256 = $2 and deleted_at is null
          and superseded_at is null
        limit 1`,
      [projectId, body.checksumSha256.trim()],
    );
  } catch (error) {
    if (!isSchemaNotReady(error)) throw error;
  }
  if (duplicate) {
    throw createError.conflict(`This file is already in the project as "${duplicate.file_name}".`);
  }

  const storageScope = { db, userId, organizationId };
  const allowance = await resolveFileStorageAllowance(storageScope);
  await assertFileStorageAvailable(storageScope, body.byteCount, allowance);
  return { status: 'ready', planTier: allowance.planTier };
}

export async function findProjectKnowledgeFileByChecksum(
  scope: ProjectKnowledgeScope,
  checksumSha256: string,
): Promise<ReturnType<typeof projectKnowledgeResponse> | null> {
  const { db, userId, projectId } = scope;
  let row: Record<string, unknown> | undefined;
  try {
    [row] = await db.query<Record<string, unknown>>(
      `select *
         from project_knowledge_files
        where project_id = $1
          and checksum_sha256 = $2
          and added_by_user_id = $3
          and deleted_at is null
          and superseded_at is null
        limit 1`,
      [projectId, checksumSha256, userId],
    );
  } catch (error) {
    if (isSchemaNotReady(error)) return null;
    throw error;
  }
  if (!row) return null;
  const fileId = String(row['id'] ?? '');
  const indexStates = await readIndexStates(db, projectId, [fileId]);
  return projectKnowledgeResponse(row, projectId, indexStates.get(fileId) ?? null);
}

export async function registerProjectKnowledgeFile(
  scope: ProjectKnowledgeScope,
  body: ManagedCloudProjectKnowledgeRegisterRequest,
  origin?: ExternalResourceReferenceInput,
): Promise<ProjectKnowledgeRegistration> {
  const { db, userId, organizationId, projectId } = scope;
  const capacity = await checkProjectKnowledgeCapacity(scope, body);
  if (capacity.status === 'unavailable') return capacity;
  const { planTier } = capacity;

  let supersedes: { id: string; version: number } | undefined;
  try {
    [supersedes] = await db.query<{ id: string; version: number }>(
      `select id, version
         from project_knowledge_files
        where project_id = $1
          and file_name = $2
          and deleted_at is null
          and superseded_at is null
        order by version desc
        limit 1`,
      [projectId, body.fileName.trim()],
    );
  } catch (error) {
    if (!isSchemaNotReady(error)) throw error;
  }

  let extraction: Awaited<ReturnType<typeof extractProjectKnowledgeFile>>;
  try {
    extraction = await extractProjectKnowledgeFile({
      projectId,
      storageUri: body.storageUri.trim(),
      fileName: body.fileName.trim(),
      mimeType: body.mimeType.trim(),
      byteCount: body.byteCount,
      checksumSha256: body.checksumSha256.trim(),
      // A scan has no text layer, so reading it costs a vision call. The
      // document id is the checksum: the same file re-uploaded resolves to the
      // reservation already taken for it rather than paying twice.
      transcribeScans: {
        db,
        userId,
        organizationId,
        planTier,
        documentId: `${projectId}:${body.checksumSha256.trim()}`,
        forceNoTraining: externalOriginHoldsGoogleUserData(origin),
      },
    });
  } catch (error) {
    if (error instanceof ProjectKnowledgeExtractionError) {
      if (error.code === 'content_rejected' || error.code === 'known_illegal_media') {
        const storageUri = body.storageUri.trim();
        logger.warn(
          {
            userId,
            projectId,
            fileName: body.fileName.trim(),
            code: error.code,
            findings: error.detail.findings,
          },
          '[knowledge-files] rejected a project source that failed content inspection',
        );
        await purgeUploadedKnowledgeObject(db, userId, projectId, storageUri);
        recordModerationEvent({
          surface: 'upload',
          action: 'block',
          categories:
            error.code === 'known_illegal_media' ? ['known_illegal_media'] : ['active_content'],
          ruleIds: [
            error.code === 'known_illegal_media'
              ? 'upload.hash-denylist'
              : 'upload.content-inspection',
          ],
          userId,
          ...(error.detail.sha256 ? { contentSha256: error.detail.sha256 } : {}),
          ...(error.detail.listLabel ? { listLabel: error.detail.listLabel } : {}),
          storageKey: storageUri,
        });
      }
      throw createError.validation(error.message);
    }
    logger.error({ error, projectId }, 'Failed to extract project knowledge file');
    throw createError.internal('Failed to process the uploaded file');
  }

  // The presigned PUT for the uploaded key stays writable for the rest of its
  // ttl, so the inspected bytes are promoted to a key no upload route can name
  // before any reader is pointed at them.
  const sealedKey = await sealProjectKnowledgeObject({
    key: extraction.objectKey,
    etag: extraction.etag,
  });
  await purgeUploadedKnowledgeObject(db, userId, projectId, extraction.objectKey);
  if (!sealedKey) {
    logger.warn(
      { userId, projectId, objectKey: extraction.objectKey, hadEtag: Boolean(extraction.etag) },
      '[knowledge-files] rejected a project source whose bytes changed after inspection',
    );
    throw createError.validation(
      'The uploaded file changed during its safety check. Upload it again.',
    );
  }

  let data: Record<string, unknown>;
  try {
    const [inserted] = await db.query<Record<string, unknown>>(
      `insert into project_knowledge_files
         (project_id, file_name, mime_type, byte_count, checksum_sha256, summary, source_surface, added_by_user_id, storage_uri, extracted_text, extracted_at, version, supersedes_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $10::text is null then null else now() end, $11, $12)
       returning *`,
      [
        projectId,
        body.fileName.trim(),
        body.mimeType.trim(),
        body.byteCount,
        body.checksumSha256.trim(),
        extraction.scannedTextWithheld && extraction.extractedText === null
          ? GOOGLE_USER_DATA_SCAN_WITHHELD_MESSAGE
          : unreadableUploadSummary(body.mimeType, extraction.extractedText),
        body.sourceSurface,
        userId,
        sealedKey,
        extraction.extractedText,
        (supersedes?.version ?? 0) + 1,
        supersedes?.id ?? null,
      ],
    );
    if (!inserted) throw new Error('No row returned');
    data = inserted;

    // Written separately from the insert so a database without migration 0192
    // still accepts the upload, with the file simply carrying no anchors.
    if (extraction.anchors.length > 0 && typeof inserted['id'] === 'string') {
      try {
        await db.execute(
          `update project_knowledge_files
              set extracted_anchors = $1::jsonb
            where id = $2 and project_id = $3`,
          [JSON.stringify(extraction.anchors), inserted['id'], projectId],
        );
      } catch (anchorError) {
        logger.warn(
          { error: anchorError, projectId, fileId: inserted['id'] },
          '[knowledge-files] extraction anchors were not stored',
        );
      }
    }

    if (origin && typeof inserted['id'] === 'string') {
      try {
        const [reference] = await recordExternalResourceReferences(db, { userId, organizationId }, [
          origin,
        ]);
        if (reference) {
          await db.execute(
            `update project_knowledge_files
                set external_reference_id = $1
              where id = $2 and project_id = $3`,
            [reference.id, inserted['id'], projectId],
          );
        }
      } catch (referenceError) {
        logger.warn(
          { error: referenceError, projectId, fileId: inserted['id'] },
          '[knowledge-files] the imported source was not recorded',
        );
      }
    }

    if (supersedes) {
      await db.query(
        `update project_knowledge_files
            set superseded_at = now()
          where id = $1 and project_id = $2 and superseded_at is null`,
        [supersedes.id, projectId],
      );
    }
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return { status: 'unavailable' };
    }
    logger.error({ error, projectId }, 'Failed to create knowledge file');
    throw createError.internal('Failed to create knowledge file');
  }

  const fileId = String(data['id'] ?? '');
  await dispatchKnowledgeIndexing(db, fileId, userId);
  const indexStates = await readIndexStates(db, projectId, [fileId]);

  return {
    status: 'created',
    file: projectKnowledgeResponse(data, projectId, indexStates.get(fileId) ?? null),
    ...(extraction.scannedTextWithheld ? { notice: GOOGLE_USER_DATA_SCAN_WITHHELD_MESSAGE } : {}),
  };
}
