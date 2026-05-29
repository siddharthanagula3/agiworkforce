import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * Agent Communication API
 *
 * GET  /api/agents/communication?agentId=<id>[&type=delegations]
 *      - List messages or delegations for an agent
 *
 * POST /api/agents/communication
 *      - Send a message from one agent to another
 */

const SendMessageSchema = z.object({
  type: z.literal('message'),
  from: z.string().min(1).max(255),
  to: z.string().min(1).max(255),
  content: z.string().min(1).max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  taskId: z.string().optional(),
  messageType: z
    .enum(['request', 'response', 'update', 'delegation', 'completion'])
    .optional()
    .default('request'),
});

/**
 * GET /api/agents/communication
 * Returns messages or delegations for the specified agentId.
 */
async function handleGetCommunication(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const agentId = url.searchParams.get('agentId');
  const type = url.searchParams.get('type') ?? 'messages';

  if (!agentId) {
    throw createError.validation('agentId query parameter is required');
  }

  if (type === 'delegations') {
    let rows: Record<string, unknown>[];
    try {
      rows = await db.query<Record<string, unknown>>(
        `select *
         from agent_delegations
         where user_id = $1 and delegate_agent_id = $2
         order by created_at desc
         limit 50`,
        [userId, agentId],
      );
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === '42P01' || pgErr.message?.includes('does not exist')) {
        return NextResponse.json({ delegations: [] });
      }
      logger.error({ err, userId, agentId }, 'Failed to fetch agent delegations');
      throw createError.internal('Failed to fetch agent delegations');
    }

    const delegations = rows.map((row) => ({
      id: row['id'] as string,
      from: (row['delegator_agent_id'] as string) ?? '',
      to: (row['delegate_agent_id'] as string) ?? '',
      delegatorId: row['delegator_agent_id'] as string | undefined,
      status: (row['status'] as string) ?? 'pending',
      timestamp: row['created_at'] as string,
      task: {
        title: (row['task_title'] as string | undefined) ?? 'Task',
        description: (row['task_description'] as string) ?? '',
        requirements: (row['task_requirements'] as string[]) ?? [],
        expectedOutput: (row['task_expected_output'] as string) ?? '',
        priority: (row['priority'] as string | undefined) ?? 'medium',
        deadline: row['deadline'] as string | undefined,
      },
      response: row['response'] as string | undefined,
      result: row['result'] as { output: string } | undefined,
    }));

    return NextResponse.json({ delegations });
  }

  // Default: fetch messages
  let rows: Record<string, unknown>[];
  try {
    rows = await db.query<Record<string, unknown>>(
      `select *
       from agent_messages
       where user_id = $1 and to_agent_id = $2
       order by created_at desc
       limit 100`,
      [userId, agentId],
    );
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '42P01' || pgErr.message?.includes('does not exist')) {
      return NextResponse.json({ messages: [] });
    }
    logger.error({ err, userId, agentId }, 'Failed to fetch agent messages');
    throw createError.internal('Failed to fetch agent messages');
  }

  const messages = rows.map((row) => ({
    id: row['id'] as string,
    from: (row['from_agent_id'] as string) ?? '',
    to: (row['to_agent_id'] as string) ?? '',
    fromAgentId: row['from_agent_id'] as string | undefined,
    content: (row['content'] as string) ?? '',
    timestamp: row['created_at'] as string,
    createdAt: row['created_at'] as string,
    type: (row['message_type'] as string) ?? 'request',
    messageType: row['message_type'] as string | undefined,
    status: (row['status'] as string) ?? 'delivered',
    priority: (row['priority'] as string) ?? 'medium',
    taskId: row['task_id'] as string | undefined,
  }));

  return NextResponse.json({ messages });
}

/**
 * POST /api/agents/communication
 * Send a message from one agent to another.
 */
async function handleSendMessage(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = SendMessageSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { from, to, content, priority, taskId, messageType } = validationResult.data;

  let rows: Record<string, unknown>[];
  try {
    rows = await db.query<Record<string, unknown>>(
      `insert into agent_messages
         (user_id, from_agent_id, to_agent_id, content, priority, task_id, message_type, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [userId, from, to, content, priority, taskId ?? null, messageType, 'delivered'],
    );
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '42P01' || pgErr.message?.includes('does not exist')) {
      logger.warn({ userId, from, to }, 'agent_messages table does not exist; message dropped');
      return NextResponse.json({ success: true, message: null });
    }
    logger.error({ err, userId, from, to }, 'Failed to send agent message');
    throw createError.internal('Failed to send message');
  }

  const data = rows[0] ?? null;
  logger.info({ userId, messageId: data?.['id'], from, to }, 'Agent message sent');

  return NextResponse.json({ success: true, message: data }, { status: 201 });
}

export const GET = withErrorHandler(handleGetCommunication);
export const POST = withErrorHandler(handleSendMessage);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
