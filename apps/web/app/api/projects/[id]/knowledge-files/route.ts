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
import { MAX_KNOWLEDGE_FILES } from '@/lib/services/project-context-service';
import {
  extractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError,
} from '@/lib/server/project-knowledge-extraction';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import { recordModerationEvent } from '@/lib/moderation';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { ManagedCloudProjectKnowledgeRegisterRequestSchema } from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

function projectKnowledgeResponse(row: Record<string, unknown>, projectId: string) {
  const file = mapKnowledgeFileRow(row);
  return {
    ...file,
    storageUri: `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
  };
}

async function purgeRejectedKnowledgeUpload(
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
      '[knowledge-files] CRITICAL: could not delete a rejected upload from storage',
    );
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

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId } = await context.params;

  const [project] = await db.query<{ id: string }>(
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
  // from the files it just listed — the total has to come from here.
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

  return NextResponse.json({
    files: data.map((row) => projectKnowledgeResponse(row, projectId)),
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
  const [project] = await db.query<{ id: string }>(
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

  if (!project) {
    throw createError.notFound('Project not found');
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
          message: 'Knowledge files require Cloud Managed (pending migration apply)',
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

  let extractedText: string | null;
  try {
    const extraction = await extractProjectKnowledgeFile({
      projectId,
      storageUri: body.storageUri.trim(),
      fileName: body.fileName.trim(),
      mimeType: body.mimeType.trim(),
      byteCount: body.byteCount,
      checksumSha256: body.checksumSha256.trim(),
    });
    extractedText = extraction.extractedText;
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
        await purgeRejectedKnowledgeUpload(userId, projectId, storageUri);
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
        unreadableUploadSummary(body.mimeType, extractedText),
        body.sourceSurface,
        userId,
        body.storageUri.trim(),
        extractedText,
        (supersedes?.version ?? 0) + 1,
        supersedes?.id ?? null,
      ],
    );
    if (!inserted) throw new Error('No row returned');
    data = inserted;

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
          message: 'Knowledge files require Cloud Managed (pending migration apply)',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to create knowledge file');
    throw createError.internal('Failed to create knowledge file');
  }

  return NextResponse.json({ file: projectKnowledgeResponse(data, projectId) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleListKnowledgeFiles));
export const POST = withCorsRoute(withErrorHandler(handleCreateKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
