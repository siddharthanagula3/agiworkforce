import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * Agent Delegation Response API
 *
 * PUT /api/agents/communication/[id]
 *     - Accept or reject a delegation
 */

const RespondToDelegationSchema = z.object({
  response: z.string().min(1).max(5000),
  accepted: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function handleRespondToDelegation(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = RespondToDelegationSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const { response, accepted } = validationResult.data;
  const newStatus = accepted ? 'accepted' : 'rejected';

  let rows: Record<string, unknown>[];
  try {
    rows = await db.query<Record<string, unknown>>(
      `update agent_delegations
       set status = $1,
           response = $2,
           updated_at = $3
       where id = $4 and user_id = $5
       returning *`,
      [newStatus, response, new Date().toISOString(), id, userId],
    );
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr.code === '42P01' || pgErr.message?.includes('does not exist')) {
      // Table doesn't exist yet - return graceful success
      return NextResponse.json({ success: true, delegation: null });
    }
    logger.error({ err, userId, delegationId: id }, 'Failed to respond to delegation');
    throw createError.internal('Failed to respond to delegation');
  }

  if (rows.length === 0) {
    throw createError.notFound('Delegation not found');
  }

  logger.info(
    { userId, delegationId: id, status: newStatus },
    'Agent delegation response recorded',
  );

  return NextResponse.json({ success: true, delegation: rows[0] });
}

export const PUT = withErrorHandler(handleRespondToDelegation);
