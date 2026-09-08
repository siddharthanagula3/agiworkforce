import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { DEFAULT_PROJECT_COLOR, mapProjectRow } from '@/lib/projects';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getProjectLimit,
  getProjectLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

type RouteContext = { params: Promise<{ id: string }> };

const PG_UNDEFINED_COLUMN = '42703';

const CARRIED_COLUMNS = [
  'icon_emoji',
  'accent_color',
  'default_privacy_mode',
  'default_provider_mode',
  'allowed_surfaces',
  'default_model_id',
  'imported_from',
  'uses_global_memory',
] as const;

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

  const baseColumns = [
    'user_id',
    'organization_id',
    'name',
    'description',
    'instructions',
    'color',
  ];
  const baseValues: unknown[] = [
    userId,
    organizationId,
    copyName(String(source['name'] ?? 'Project')),
    source['description'] ?? '',
    source['instructions'] ?? '',
    source['color'] ?? DEFAULT_PROJECT_COLOR,
  ];

  // Everything below arrived after the base columns and is settable by the
  // user, so a copy that drops it silently rewrites the project's behaviour.
  // uses_global_memory is the one that matters most: defaulting it back to true
  // would widen what the copy's chats can read.
  const carriedColumns: string[] = [];
  const carriedValues: unknown[] = [];
  for (const column of CARRIED_COLUMNS) {
    if (source[column] === undefined) continue;
    carriedColumns.push(column);
    carriedValues.push(source[column]);
  }
  const hasCarried = carriedColumns.length > 0;

  function buildInsertSql(includeCarried: boolean): { sql: string; params: unknown[] } {
    const columns = includeCarried ? [...baseColumns, ...carriedColumns] : [...baseColumns];
    const values = includeCarried ? [...baseValues, ...carriedValues] : [...baseValues];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    return {
      sql: `with inserted as materialized (
         insert into user_projects (${columns.join(', ')})
         values (${placeholders})
         returning *
       ), quota_guard as materialized (
         select public.assert_user_resource_limit('projects', $1, $${values.length + 1})
           from (select count(*) from inserted) as dependency
       )
       select inserted.* from inserted cross join quota_guard`,
      params: [...values, projectLimit],
    };
  }

  const insertCopy = async (includeCarried: boolean) => {
    const { sql, params } = buildInsertSql(includeCarried);
    const [row] = await db.query<Record<string, unknown>>(sql, params);
    return row;
  };

  let created: Record<string, unknown> | undefined;
  try {
    try {
      created = await insertCopy(hasCarried);
    } catch (error) {
      if (hasCarried && (error as { code?: string } | null)?.code === PG_UNDEFINED_COLUMN) {
        created = await insertCopy(false);
      } else {
        throw error;
      }
    }
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
