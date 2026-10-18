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
import {
  deleteDeletedProjectObjects,
  releaseDeletedProjectContents,
} from '@/lib/server/project-deletion';
import {
  ProjectConversationMembershipError,
  replaceProjectConversationMembership,
} from '@/lib/services/project-membership-service';
import {
  resolveProjectWriteAccess,
  resolveSharedProjectScope,
  type ProjectWriteAccess,
  type SharedProjectAccess,
} from '@/lib/services/org-sharing-service';

const OWNER_ONLY_PROJECT_FIELDS = [
  'isArchived',
  'starred',
  'defaultPrivacyMode',
  'defaultProviderMode',
  'allowedSurfaces',
  'usesGlobalMemory',
  'usesAccountInstructions',
  'usesAccountStyle',
  'importedFrom',
] as const;

class ProjectUpdateMiss extends Error {}

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
                and c.deleted_at is null
                and coalesce(c.is_temporary, false) = false) as conversation_count
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
  sharedAccess: SharedProjectAccess,
): Promise<Record<string, unknown> | undefined> {
  if (sharedProjectIds.length === 0) return undefined;
  const [project] = await db.query<Record<string, unknown>>(
    `select p.*,
            true as is_org_shared,
            $5::text as shared_access,
            (select count(*)::int
               from web_conversations c
              where c.project_id = p.id::text
                and c.user_id = $2
                and c.organization_id is not distinct from $4::uuid
                and c.deleted_at is null
                and coalesce(c.is_temporary, false) = false) as conversation_count
       from user_projects p
      where p.id = $1
        and p.id = any($3::uuid[])
        and p.organization_id is not distinct from $4::uuid
        and p.deleted_at is null
      limit 1`,
    [id, userId, sharedProjectIds, organizationId, sharedAccess],
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
        sharedScope.writableProjectIds.includes(id) ? 'write' : 'read',
      );
    }
  }

  if (!data) {
    throw createError.notFound('Project not found');
  }

  if (data['server_version'] === null || data['server_version'] === undefined) {
    throw createError.internal('Project version unavailable');
  }

  return NextResponse.json({
    project: { ...mapProjectRow(data), serverVersion: String(data['server_version']) },
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

  let writeAccess: ProjectWriteAccess = 'owner';

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
  if (body.usesAccountInstructions !== undefined) {
    addBase('uses_account_instructions', body.usesAccountInstructions);
  }
  if (body.usesAccountStyle !== undefined) addBase('uses_account_style', body.usesAccountStyle);
  if (body.starred !== undefined) {
    baseParams.push(body.starred);
    baseSetClauses.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('starred', $${baseParams.length}::boolean)`,
    );
  }

  if (body.iconEmoji !== undefined) addBase('icon_emoji', body.iconEmoji);
  if (body.accentColor !== undefined) addBase('accent_color', body.accentColor);
  if (body.defaultPrivacyMode !== undefined) {
    addBase('default_privacy_mode', body.defaultPrivacyMode);
  }
  if (body.defaultProviderMode !== undefined) {
    addBase('default_provider_mode', body.defaultProviderMode);
  }
  if (body.allowedSurfaces !== undefined) {
    addBase(
      'allowed_surfaces',
      body.allowedSurfaces.length > 0 ? body.allowedSurfaces : [...SYNCED_APP_SURFACES],
    );
  }
  if (body.defaultModelId !== undefined) addBase('default_model_id', body.defaultModelId);
  if (body.importedFrom !== undefined) addBase('imported_from', body.importedFrom);

  const executeUpdate = async (targetDb: DatabaseAdapter) => {
    const idIdx = baseParams.length + 1;
    const userIdx = baseParams.length + 2;
    const organizationIdx = baseParams.length + 3;
    const ownerPredicate = writeAccess === 'owner' ? '=' : '<>';
    const [updated] = await targetDb.query<Record<string, unknown>>(
      `update user_projects set ${baseSetClauses.join(', ')} where id = $${idIdx} and user_id ${ownerPredicate} $${userIdx} and organization_id is not distinct from $${organizationIdx}::uuid and deleted_at is null returning *`,
      [...baseParams, id, userId, organizationId],
    );
    if (!updated) throw new ProjectUpdateMiss();
  };

  const runUpdate = async () => {
    if (body.conversationIds === undefined) {
      await executeUpdate(db);
      return;
    }
    await db.transaction(async (tx) => {
      await executeUpdate(tx);
      await replaceProjectConversationMembership(tx, {
        userId,
        organizationId,
        projectId: id,
        conversationIds: body.conversationIds ?? [],
      });
    });
  };

  try {
    try {
      await runUpdate();
    } catch (error) {
      if (!(error instanceof ProjectUpdateMiss)) throw error;
      const access = await resolveProjectWriteAccess(db, { projectId: id, userId, organizationId });
      if (access !== 'editor') throw createError.notFound('Project not found');
      const ownerOnly = OWNER_ONLY_PROJECT_FIELDS.filter(
        (field) => (body as Record<string, unknown>)[field] !== undefined,
      );
      if (ownerOnly.length > 0) {
        throw createError
          .forbidden(
            `An editor on a shared project can change its name, description, instructions and appearance. ${ownerOnly.join(', ')} stays with the owner.`,
          )
          .asUserSafe();
      }
      writeAccess = 'editor';
      await runUpdate();
    }
  } catch (error) {
    if (error instanceof ProjectUpdateMiss) throw createError.notFound('Project not found');
    if (error instanceof ProjectConversationMembershipError) {
      throw createError.validation(error.message);
    }
    throw error;
  }

  const projectWithCount =
    writeAccess === 'owner'
      ? await selectProjectWithConversationCount(db, id, userId, organizationId)
      : await selectSharedProjectWithConversationCount(
          db,
          id,
          userId,
          [id],
          organizationId as string,
          'write',
        );
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

  const scope = { projectId: id, userId, organizationId };
  let outcome: { deleted: number; storageUris: string[] };
  try {
    outcome = await db.transaction(async (tx) => {
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
      return {
        deleted,
        storageUris: await releaseDeletedProjectContents(tx, scope),
      };
    });
  } catch (error) {
    logger.error({ error, projectId: id, userId }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  if (outcome.deleted === 0) {
    throw createError.notFound('Project not found');
  }

  await deleteDeletedProjectObjects(outcome.storageUris, scope);

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetProject));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateProject));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteProject));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
