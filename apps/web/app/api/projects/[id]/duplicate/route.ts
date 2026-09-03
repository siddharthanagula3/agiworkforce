import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { mapProjectRow } from '@/lib/projects';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getProjectLimit,
  getProjectLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

function isSchemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
}

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

  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = subscription?.plan_tier;
  const projectLimit = getProjectLimit(planTier);
  if (projectLimit === 0) {
    throw createError.validation(getProjectLimitErrorMessage(planTier));
  }

  let created: Record<string, unknown> | undefined;
  try {
    [created] = await db.query<Record<string, unknown>>(
      `with inserted as materialized (
         insert into user_projects
           (user_id, organization_id, name, description, instructions, color)
         values ($1, $2, $3, $4, $5, $6)
         returning *
       ), quota_guard as materialized (
         select public.assert_user_resource_limit('projects', $1, $7)
           from (select count(*) from inserted) as dependency
       )
       select inserted.* from inserted cross join quota_guard`,
      [
        userId,
        organizationId,
        copyName(String(source['name'] ?? 'Project')),
        source['description'] ?? '',
        source['instructions'] ?? '',
        source['color'] ?? '#3b82f6',
        projectLimit,
      ],
    );
  } catch (error) {
    if (isUserResourceLimitError(error)) {
      throw createError.validation(getProjectLimitErrorMessage(planTier));
    }
    throw error;
  }

  if (!created) {
    logger.error({ userId, sourceProjectId: id }, 'Project duplicate returned no row');
    throw createError.internal('Failed to duplicate the project');
  }

  let copiedFiles = 0;
  try {
    const inserted = await db.query<{ id: string }>(
      `insert into project_knowledge_files
         (project_id, file_name, mime_type, byte_count, checksum_sha256, summary,
          source_surface, added_by_user_id, storage_uri, extracted_text, extracted_at)
       select $1, file_name, mime_type, byte_count, checksum_sha256, summary,
              source_surface, $2, storage_uri,
              to_jsonb(project_knowledge_files)->>'extracted_text', extracted_at
         from project_knowledge_files
        where project_id = $3 and deleted_at is null and superseded_at is null
       returning id`,
      [created['id'], userId, id],
    );
    copiedFiles = inserted.length;
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.error({ error, userId, sourceProjectId: id }, 'Failed to copy knowledge files');
    }
  }

  return NextResponse.json({ project: mapProjectRow(created), copiedKnowledgeFiles: copiedFiles });
}

export const POST = withCorsRoute(withErrorHandler(handleDuplicateProject));
export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
