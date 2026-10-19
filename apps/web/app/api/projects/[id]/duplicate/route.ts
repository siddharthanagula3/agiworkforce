import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudProjectDuplicateResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { DEFAULT_PROJECT_COLOR, mapProjectRow } from '@/lib/projects';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  getProjectLimit,
  getProjectLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { HEALTH_SPACE_KIND } from '@/lib/health-space';

type RouteContext = { params: Promise<{ id: string }> };

const CARRIED_COLUMNS = [
  'icon_emoji',
  'accent_color',
  'default_privacy_mode',
  'default_provider_mode',
  'allowed_surfaces',
  'default_model_id',
  'chat_defaults',
  'imported_from',
  'uses_global_memory',
  'uses_account_instructions',
  'uses_account_style',
] as const;

function copyName(original: string): string {
  const trimmed = original.trim() || 'Project';
  const match = /^(.*)\s\(copy(?:\s(\d+))?\)$/.exec(trimmed);
  if (!match) return `${trimmed} (copy)`.slice(0, 200);
  const base = match[1] ?? trimmed;
  const next = match[2] ? Number.parseInt(match[2], 10) + 1 : 2;
  return `${base} (copy ${next})`.slice(0, 200);
}

async function handleDuplicateProject(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id } = await context.params;

  const [source] = await db.query<Record<string, unknown>>(
    `select * from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null
      limit 1`,
    [id, userId, organizationId],
  );
  if (!source) {
    throw createError.notFound('Project not found');
  }
  if (source['space_kind'] === HEALTH_SPACE_KIND) {
    throw createError.conflict('Health cannot be duplicated. Its chats and files stay in Health.');
  }

  const planTier = await resolveEntitledPlanTier(db, userId);
  const projectLimit = getProjectLimit(planTier);
  if (projectLimit === 0) {
    throw createError.validation(getProjectLimitErrorMessage(planTier));
  }

  // uses_global_memory is carried with the rest: defaulting it back to true
  // would widen what the copy's chats can read.
  const columns = [
    'user_id',
    'organization_id',
    'name',
    'description',
    'instructions',
    'color',
    ...CARRIED_COLUMNS,
  ];
  const values: unknown[] = [
    userId,
    organizationId,
    copyName(String(source['name'] ?? 'Project')),
    source['description'] ?? '',
    source['instructions'] ?? '',
    source['color'] ?? DEFAULT_PROJECT_COLOR,
    ...CARRIED_COLUMNS.map((column) =>
      column === 'chat_defaults' ? JSON.stringify(source[column] ?? {}) : source[column],
    ),
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

  let copy: { created: Record<string, unknown> | undefined; copiedFiles: number };
  try {
    copy = await db.transaction(async (tx) => {
      const [created] = await tx.query<Record<string, unknown>>(
        `with inserted as materialized (
           insert into user_projects (${columns.join(', ')})
           values (${placeholders})
           returning *
         ), quota_guard as materialized (
           select public.assert_user_resource_limit('projects', $1, $${values.length + 1})
             from (select count(*) from inserted) as dependency
         )
         select inserted.* from inserted cross join quota_guard`,
        [...values, projectLimit],
      );
      if (!created) return { created, copiedFiles: 0 };
      const copiedFiles = await tx.query<{ id: string }>(
        `insert into project_knowledge_files
           (project_id, file_name, mime_type, byte_count, checksum_sha256, summary,
            source_surface, added_by_user_id, storage_uri, extracted_text, extracted_at)
         select $1, file_name, mime_type, byte_count, checksum_sha256, summary,
                source_surface, $2, storage_uri, extracted_text, extracted_at
           from project_knowledge_files
          where project_id = $3 and deleted_at is null and superseded_at is null
         returning id`,
        [created['id'], userId, id],
      );
      return { created, copiedFiles: copiedFiles.length };
    });
  } catch (error) {
    if (isUserResourceLimitError(error)) {
      throw createError.validation(getProjectLimitErrorMessage(planTier));
    }
    throw error;
  }

  const { created, copiedFiles } = copy;
  if (!created) {
    logger.error({ userId, sourceProjectId: id }, 'Project duplicate returned no row');
    throw createError.internal('Failed to duplicate the project');
  }

  const duplicated: ManagedCloudProjectDuplicateResponse = {
    project: mapProjectRow(created),
    copiedKnowledgeFiles: copiedFiles,
  };
  return NextResponse.json(duplicated);
}

export const POST = withCorsRoute(withErrorHandler(handleDuplicateProject));
export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
