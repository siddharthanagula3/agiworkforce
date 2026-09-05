import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreateConversationSchema } from '@/lib/validations/chat';
import { CONVERSATION_WORK_MODE_SELECT, type ChatConversationRow } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { assertSessionInvariants } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
} from '@agiworkforce/cloud-contracts';
import { buildCloudChatSessionLabel } from '@/lib/services/chat-session-label-service';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

async function handleGetConversations(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const rawQ = url.searchParams.get('q') ?? '';
  const q = rawQ.slice(0, 200).trim();
  const rawProjectId = url.searchParams.get('projectId');
  const projectId = rawProjectId?.trim() ?? null;
  if (rawProjectId !== null && (!projectId || projectId.length > 128)) {
    throw createError.validation('Invalid projectId');
  }
  const archivedFilter = url.searchParams.get('archived') ?? 'include';
  if (!['include', 'only', 'exclude'].includes(archivedFilter)) {
    throw createError.validation('Invalid archived filter');
  }
  const deletedFilter = url.searchParams.get('deleted') ?? 'exclude';
  if (!['exclude', 'only'].includes(deletedFilter)) {
    throw createError.validation('Invalid deleted filter');
  }

  const limit =
    parsePositiveInt(
      url.searchParams.get('limit'),
      MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
      MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
    ) || MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;
  const offset = parsePositiveInt(url.searchParams.get('offset'), 0);
  const includeHistoryStats = url.searchParams.get('includeHistoryStats') === '1';
  const statsOnly = includeHistoryStats && url.searchParams.get('statsOnly') === '1';

  try {
    const where = ['user_id = $1', 'organization_id is not distinct from $2'];
    where.push(deletedFilter === 'only' ? 'deleted_at is not null' : 'deleted_at is null');
    const params: unknown[] = [userId, organizationId];
    if (projectId) {
      params.push(projectId);
      where.push(`project_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`title ilike $${params.length}`);
    }
    if (archivedFilter === 'only') {
      where.push('archived = true');
    } else if (archivedFilter === 'exclude') {
      where.push('archived = false');
    }
    params.push(limit + 1, offset);
    const limitParameter = params.length - 1;
    const offsetParameter = params.length;

    const [rows, historyStatsRows] = await Promise.all([
      statsOnly
        ? Promise.resolve([])
        : db.query<ChatConversationRow>(
            `
          select id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at, deleted_at,
            ${CONVERSATION_WORK_MODE_SELECT}
          from web_conversations
          where ${where.join(' and ')}
          order by pinned desc, updated_at desc
          limit $${limitParameter} offset $${offsetParameter}
        `,
            params,
          ),
      includeHistoryStats
        ? db.query<{ conversation_count: string; message_count: string }>(
            `
              select
                count(*)::text as conversation_count,
                coalesce(
                  sum(
                    (select count(*)
                       from web_messages
                      where web_messages.conversation_id = web_conversations.id)
                  ),
                  0
                )::text as message_count
              from web_conversations
              where user_id = $1
                and organization_id is not distinct from $2
                and deleted_at is null
                and is_temporary = false
            `,
            [userId, organizationId],
          )
        : Promise.resolve([]),
    ]);

    const hasMore = rows.length > limit;
    const conversations = hasMore ? rows.slice(0, limit) : rows;
    const historyStatsRow = historyStatsRows[0];
    const historyStats = historyStatsRow
      ? {
          conversationCount: Number(historyStatsRow.conversation_count),
          messageCount: Number(historyStatsRow.message_count),
        }
      : undefined;

    return NextResponse.json({
      conversations,
      hasMore,
      nextOffset: offset + conversations.length,
      ...(historyStats ? { historyStats } : {}),
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch conversations');
    throw createError.internal('Failed to fetch conversations');
  }
}

async function handleCreateConversation(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is fine - defaults will be applied by schema
  }

  const validationResult = CreateConversationSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }
  const body = validationResult.data;

  if (body.projectId) {
    let ownedProject: { id: string } | undefined;
    try {
      [ownedProject] = await db.query<{ id: string }>(
        `select id
           from user_projects
          where id = $1 and user_id = $2 and is_archived = false and deleted_at is null
          limit 1`,
        [body.projectId, userId],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to validate conversation project');
      throw createError.internal('Failed to validate project');
    }
    if (!ownedProject) {
      throw createError.notFound('Project not found');
    }
  }

  try {
    const [conversation] = await db.query<ChatConversationRow>(
      `
        insert into web_conversations
          (id, user_id, organization_id, title, model, project_id, is_temporary)
        values (coalesce($5::uuid, gen_random_uuid()), $1, $7, $2, $3, $4, $6)
        on conflict (id) do update set
          title = excluded.title,
          model = excluded.model,
          project_id = excluded.project_id,
          updated_at = now()
        where web_conversations.user_id = $1
          and web_conversations.organization_id is not distinct from $7
        returning id, organization_id, title, model, project_id, pinned, starred, archived, is_temporary, created_at, updated_at
      `,
      [
        userId,
        body.title,
        body.model ?? null,
        body.projectId ?? null,
        body.id ?? null,
        body.isTemporary ?? false,
        organizationId,
      ],
    );
    if (!conversation) {
      throw createError.conflict('Conversation id already exists');
    }

    assertSessionInvariants(
      buildCloudChatSessionLabel({
        conversationId: conversation.id,
        ownerUserId: userId,
        projectId: conversation.project_id,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      }),
    );

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create conversation');
    throw createError.internal('Failed to create conversation');
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGetConversations));
export const POST = withCorsRoute(withErrorHandler(handleCreateConversation));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
