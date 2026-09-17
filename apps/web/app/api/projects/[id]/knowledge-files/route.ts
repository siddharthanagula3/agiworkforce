import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getKnowledgeStorageLimitBytes,
  getKnowledgeStorageLimitErrorMessage,
} from '@/lib/services/free-plan-entitlements';
import { logger } from '@/lib/logger';
import { mapKnowledgeFileRow } from '@/lib/projects';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  resolveProjectWriteAccess,
  resolveSharedProjectScope,
} from '@/lib/services/org-sharing-service';
import { MAX_KNOWLEDGE_FILES } from '@/lib/services/project-context-service';
import {
  extractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError,
} from '@/lib/server/project-knowledge-extraction';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { enqueueJob } from '@/lib/jobs/job-service';
import {
  deleteProjectKnowledgeObject,
  sealProjectKnowledgeObject,
} from '@/lib/server/project-knowledge-object-storage';
import { recordModerationEvent } from '@/lib/moderation';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { ManagedCloudProjectKnowledgeRegisterRequestSchema } from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import type { ProjectKnowledgeIndexState } from '@agiworkforce/types';
import {
  findProjectKnowledgeDocument,
  readProjectKnowledgeIndexStates,
} from '@/lib/services/retrieval-index-service';
import { dispatchRetrievalIndexWorkflows } from '@/lib/workflows/start-retrieval-index-workflow';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

function projectKnowledgeResponse(
  row: Record<string, unknown>,
  projectId: string,
  indexing: ProjectKnowledgeIndexState | null = null,
) {
  const file = mapKnowledgeFileRow(row);
  return {
    ...file,
    storageUri: `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
    indexing,
  };
}

async function readIndexStates(
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

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

/**
 * Migration 0090 grants an organization member SELECT on the knowledge files of
 * a project shared with them, and restricts every write to the owner. The
 * database is the authority here, and this read has to match it: filtering the
 * lookup by `user_id` refused the read the policy allows, so a shared project
 * opened to a sources panel that could never load.
 */
async function selectReadableProject(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  projectId: string,
  userId: string,
  organizationId: string | null,
): Promise<{ id: string } | undefined> {
  const [owned] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (owned || !organizationId) return owned;

  const sharedScope = await resolveSharedProjectScope(db, userId);
  if (sharedScope?.organizationId !== organizationId || sharedScope.projectIds.length === 0) {
    return undefined;
  }

  const [shared] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and id = any($2::uuid[])
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, sharedScope.projectIds, organizationId],
  );
  return shared;
}

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId } = await context.params;

  const project = await selectReadableProject(db, projectId, userId, organizationId);

  if (!project) {
    throw createError.notFound('Project not found');
  }

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from project_knowledge_files
       where project_id = $1 and deleted_at is null and superseded_at is null
       order by added_at desc`,
      [projectId],
    );
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Project sources are temporarily unavailable.',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  // The storage cap is enforced on upload and was invisible until it refused
  // you. It is ACCOUNT-wide, not per project, so the panel cannot compute it
  // from the files it just listed, the total has to come from here.
  // The meter is context; the file list is the point of this endpoint. Neither
  // the plan read nor the usage read may take the list down with it, so both
  // degrade to "no meter" rather than propagating.
  let limitBytes: number | null = null;
  try {
    const subscription = await SubscriptionService.getSubscription(db, userId);
    limitBytes = getKnowledgeStorageLimitBytes(subscription?.plan_tier);
  } catch (error) {
    logger.warn({ error, userId }, 'Knowledge storage meter: plan read failed');
  }
  let usedBytes: number | null = null;
  try {
    const [usage] = await db.query<{ total: string | number | null }>(
      // Must match handleCreateKnowledgeFile's usage query EXACTLY, including
      // the organization scope. A meter computed over a different set than the
      // cap enforces is worse than no meter: it reads as headroom the upload
      // will refuse.
      `select coalesce(sum(k.byte_count), 0) as total
        from project_knowledge_files k
         join user_projects p on p.id = k.project_id
        where p.user_id = $1
          and p.organization_id is not distinct from $2::uuid
          and k.deleted_at is null
          and k.superseded_at is null`,
      [userId, organizationId],
    );
    usedBytes = Number(usage?.total ?? 0);
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.warn({ error, userId }, 'Knowledge storage meter: usage read failed');
    }
  }

  const indexStates = await readIndexStates(
    db,
    projectId,
    data.map((row) => String(row['id'] ?? '')).filter(Boolean),
  );

  return NextResponse.json({
    files: data.map((row) =>
      projectKnowledgeResponse(row, projectId, indexStates.get(String(row['id'] ?? '')) ?? null),
    ),
    storage: { usedBytes, limitBytes },
  });
}

async function handleCreateKnowledgeFile(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: projectId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsedBody = ManagedCloudProjectKnowledgeRegisterRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    const issue = parsedBody.error.issues[0];
    throw createError.validation(
      issue
        ? `${issue.path.join('.') || 'request'}: ${issue.message}`
        : 'Invalid project source metadata',
    );
  }
  const body = parsedBody.data;
  const attachmentValidation = validateAttachmentMeta(
    body.fileName.trim(),
    body.mimeType.trim(),
    body.byteCount,
  );
  if (!attachmentValidation.ok) {
    throw createError.validation(attachmentValidation.message);
  }
  const [owned] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );

  if (!owned) {
    const writeAccess = await resolveProjectWriteAccess(db, { projectId, userId, organizationId });
    if (writeAccess !== 'editor') {
      throw createError.notFound('Project not found');
    }
    const [shared] = await db.query<{ id: string }>(
      `select id
         from user_projects
        where id = $1
          and organization_id is not distinct from $2::uuid
          and is_archived = false
          and deleted_at is null
        limit 1`,
      [projectId, organizationId],
    );
    if (!shared) {
      throw createError.notFound('Project not found');
    }
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
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Knowledge files require Managed Cloud (pending migration apply)',
        },
        { status: 503 },
      );
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

  const subscription = await SubscriptionService.getSubscription(db, userId);
  const storageLimitBytes = getKnowledgeStorageLimitBytes(subscription?.plan_tier);
  if (storageLimitBytes !== null) {
    let usedBytes = 0;
    try {
      const [usage] = await db.query<{ total: string | number | null }>(
        `select coalesce(sum(k.byte_count), 0) as total
          from project_knowledge_files k
           join user_projects p on p.id = k.project_id
          where p.user_id = $1
            and p.organization_id is not distinct from $2::uuid
            and k.deleted_at is null
            and k.superseded_at is null`,
        [userId, organizationId],
      );
      usedBytes = Number(usage?.total ?? 0);
    } catch (error) {
      if (!isSchemaNotReady(error)) throw error;
    }
    if (usedBytes + body.byteCount > storageLimitBytes) {
      throw createError.validation(
        getKnowledgeStorageLimitErrorMessage(subscription?.plan_tier, storageLimitBytes),
      );
    }
  }

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
        planTier: subscription?.plan_tier ?? '',
        documentId: `${projectId}:${body.checksumSha256.trim()}`,
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
        unreadableUploadSummary(body.mimeType, extraction.extractedText),
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
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Knowledge files require Managed Cloud (pending migration apply)',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to create knowledge file');
    throw createError.internal('Failed to create knowledge file');
  }

  const fileId = String(data['id'] ?? '');
  await dispatchKnowledgeIndexing(db, fileId, userId);
  const indexStates = await readIndexStates(db, projectId, [fileId]);

  return NextResponse.json(
    { file: projectKnowledgeResponse(data, projectId, indexStates.get(fileId) ?? null) },
    { status: 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleListKnowledgeFiles));
export const POST = withCorsRoute(withErrorHandler(handleCreateKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
