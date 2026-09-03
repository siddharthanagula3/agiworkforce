import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { mapProjectRow } from '@/lib/projects';
import { parseProjectRequest } from '@/lib/project-request-validation';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { ManagedCloudProjectUpdateRequestSchema } from '@agiworkforce/cloud-contracts';
import { SYNCED_APP_SURFACES } from '@agiworkforce/types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  ProjectConversationMembershipError,
  replaceProjectConversationMembership,
} from '@/lib/services/project-membership-service';
import { resolveSharedProjectScope } from '@/lib/services/org-sharing-service';

const PG_UNDEFINED_COLUMN = '42703';
const PG_UNDEFINED_TABLE = '42P01';

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === PG_UNDEFINED_COLUMN || code === PG_UNDEFINED_TABLE;
}

type RouteContext = { params: Promise<{ id: string }> };

async function selectProjectWithConversationCount(
  db: DatabaseAdapter,
  id: string,
  userId: string,
  organizationId: string | null,
): Promise<Record<string, unknown> | undefined> {
  const [project] = await db.query<Record<string, unknown>>(
    `select p.*,
            (select count(*)::int
               from web_conversations c
              where c.project_id = p.id::text
                and c.user_id = $2
                and c.organization_id is not distinct from $3::uuid
                and c.deleted_at is null) as conversation_count
       from user_projects p
      where p.id = $1
        and p.user_id = $2
        and p.organization_id is not distinct from $3::uuid
        and p.deleted_at is null
      limit 1`,
    [id, userId, organizationId],
  );
  return project;
}

async function selectSharedProjectWithConversationCount(
  db: DatabaseAdapter,
  id: string,
  userId: string,
  sharedProjectIds: string[],
  organizationId: string,
): Promise<Record<string, unknown> | undefined> {
  if (sharedProjectIds.length === 0) return undefined;
  const [project] = await db.query<Record<string, unknown>>(
    `select p.*,
            true as is_org_shared,
            (select count(*)::int
               from web_conversations c
              where c.project_id = p.id::text
                and c.user_id = $2
                and c.organization_id is not distinct from $4::uuid
                and c.deleted_at is null) as conversation_count
       from user_projects p
      where p.id = $1
        and p.id = any($3::uuid[])
        and p.organization_id is not distinct from $4::uuid
        and p.deleted_at is null
      limit 1`,
    [id, userId, sharedProjectIds, organizationId],
  );
  return project;
}

async function handleGetProject(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  let data = await selectProjectWithConversationCount(db, id, userId, organizationId);

  if (!data && organizationId) {
    const sharedScope = await resolveSharedProjectScope(db, userId);
    if (sharedScope?.organizationId === organizationId) {
      data = await selectSharedProjectWithConversationCount(
        db,
        id,
        userId,
        sharedScope.projectIds,
        organizationId,
      );
    }
  }

  if (!data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
    project: mapProjectRow(data),
  });
}

async function handleUpdateProject(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const body = parseProjectRequest(ManagedCloudProjectUpdateRequestSchema, rawBody);

  const baseSetClauses: string[] = ['updated_at = now()'];
  const baseParams: unknown[] = [];

  function addBase(col: string, val: unknown) {
    baseParams.push(val);
    baseSetClauses.push(`${col} = $${baseParams.length}`);
  }

  if (body.name !== undefined) addBase('name', body.name.trim());
  if (body.description !== undefined) addBase('description', body.description?.trim() ?? null);
  if (body.instructions !== undefined) addBase('instructions', body.instructions?.trim() ?? null);
  if (body.color !== undefined) addBase('color', body.color.trim());
  if (body.isArchived !== undefined) addBase('is_archived', body.isArchived);
  if (body.usesGlobalMemory !== undefined) addBase('uses_global_memory', body.usesGlobalMemory);
  if (body.starred !== undefined) {
    baseParams.push(body.starred);
    baseSetClauses.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('starred', $${baseParams.length}::boolean)`,
    );
  }

  const round10SetClauses: string[] = [];
  const round10Params: unknown[] = [];

  function addRound10(col: string, val: unknown) {
    const idx = baseParams.length + round10Params.length + 1;
    round10Params.push(val);
    round10SetClauses.push(`${col} = $${idx}`);
  }

  if (body.iconEmoji !== undefined) addRound10('icon_emoji', body.iconEmoji);
  if (body.accentColor !== undefined) addRound10('accent_color', body.accentColor);
  if (body.defaultPrivacyMode !== undefined)
    addRound10('default_privacy_mode', body.defaultPrivacyMode);
  if (body.defaultProviderMode !== undefined)
    addRound10('default_provider_mode', body.defaultProviderMode);
  if (body.allowedSurfaces !== undefined) {
    addRound10(
      'allowed_surfaces',
      body.allowedSurfaces.length > 0 ? body.allowedSurfaces : [...SYNCED_APP_SURFACES],
    );
  }
  if (body.defaultModelId !== undefined) addRound10('default_model_id', body.defaultModelId);
  if (body.importedFrom !== undefined) addRound10('imported_from', body.importedFrom);

  const hasRound10 = round10SetClauses.length > 0;

  function buildUpdateSql(includeRound10: boolean): { sql: string; params: unknown[] } {
    const setClauses = includeRound10
      ? [...baseSetClauses, ...round10SetClauses]
      : [...baseSetClauses];
    const params = includeRound10 ? [...baseParams, ...round10Params] : [...baseParams];
    const idIdx = params.length + 1;
    const userIdx = params.length + 2;
    const organizationIdx = params.length + 3;
    return {
      sql: `update user_projects set ${setClauses.join(', ')} where id = $${idIdx} and user_id = $${userIdx} and organization_id is not distinct from $${organizationIdx}::uuid and deleted_at is null returning *`,
      params: [...params, id, userId, organizationId],
    };
  }

  const executeUpdate = async (targetDb: DatabaseAdapter, includeRound10: boolean) => {
    const { sql, params } = buildUpdateSql(includeRound10);
    const [updated] = await targetDb.query<Record<string, unknown>>(sql, params);
    if (!updated) throw createError.notFound('Project not found');
  };

  const updateAndReplaceMembership = (includeRound10: boolean) =>
    db.transaction(async (tx) => {
      await executeUpdate(tx, includeRound10);
      await replaceProjectConversationMembership(tx, {
        userId,
        organizationId,
        projectId: id,
        conversationIds: body.isArchived === true ? [] : (body.conversationIds ?? []),
      });
    });

  try {
    if (body.isArchived === true || body.conversationIds !== undefined) {
      try {
        await updateAndReplaceMembership(hasRound10);
      } catch (error) {
        if (
          hasRound10 &&
          error &&
          typeof error === 'object' &&
          (error as { code?: string }).code === PG_UNDEFINED_COLUMN
        ) {
          await updateAndReplaceMembership(false);
        } else {
          throw error;
        }
      }
    } else {
      try {
        await executeUpdate(db, hasRound10);
      } catch (error) {
        if (
          hasRound10 &&
          error &&
          typeof error === 'object' &&
          (error as { code?: string }).code === PG_UNDEFINED_COLUMN
        ) {
          await executeUpdate(db, false);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof ProjectConversationMembershipError) {
      throw createError.validation(error.message);
    }
    throw error;
  }

  const projectWithCount = await selectProjectWithConversationCount(db, id, userId, organizationId);
  if (!projectWithCount) throw createError.notFound('Project not found');

  return NextResponse.json({ project: mapProjectRow(projectWithCount) });
}

async function handleDeleteProject(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await context.params;

  const runDelete = (purgeKnowledgeFiles: boolean) =>
    db.transaction(async (tx) => {
      const deleted = await tx.execute(
        `update user_projects
           set deleted_at = now(), updated_at = now()
         where id = $1
           and user_id = $2
           and organization_id is not distinct from $3::uuid
           and deleted_at is null`,
        [id, userId, organizationId],
      );
      if (deleted === 0) return { deleted, storageUris: [] as string[] };

      await tx.execute(
        `update web_conversations
            set project_id = null, updated_at = now()
          where project_id = $1
            and user_id = $2
            and organization_id is not distinct from $3::uuid
            and deleted_at is null`,
        [id, userId, organizationId],
      );

      if (!purgeKnowledgeFiles) return { deleted, storageUris: [] as string[] };

      const purged = await tx.query<{ storage_uri: string | null }>(
        `update project_knowledge_files
            set deleted_at = now(), updated_at = now()
          where project_id = $1::uuid
            and deleted_at is null
        returning storage_uri`,
        [id],
      );
      return {
        deleted,
        storageUris: purged
          .map((row) => row.storage_uri)
          .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
      };
    });

  let outcome: { deleted: number; storageUris: string[] };
  try {
    try {
      outcome = await runDelete(true);
    } catch (error) {
      if (!isSchemaNotReady(error)) throw error;
      logger.warn(
        { error, projectId: id, userId },
        'Knowledge-file schema not ready; deleting project without source cleanup',
      );
      outcome = await runDelete(false);
    }
  } catch (error) {
    logger.error({ error, projectId: id, userId }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  if (outcome.deleted === 0) {
    throw createError.notFound('Project not found');
  }

  for (const storageUri of outcome.storageUris) {
    const objectKey = objectKeyFromStorageUri(storageUri);
    if (!objectKey) continue;
    try {
      await deleteProjectKnowledgeObject(objectKey);
    } catch (error) {
      logger.error(
        { error, projectId: id, userId, objectKey },
        'Failed to delete a project knowledge object after project deletion',
      );
    }
  }

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetProject));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateProject));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteProject));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
