import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

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

  // RLS-bound client: agent_delegations.user_id RLS policy enforces tenant
  // isolation; the .eq('user_id', ...) filter remains as defense-in-depth.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
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

  const { data, error } = await supabase
    .from('agent_delegations')
    .update({
      status: newStatus,
      response,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
      // Table doesn't exist yet - return graceful success
      return NextResponse.json({ success: true, delegation: null });
    }
    if (error.code === 'PGRST116') {
      throw createError.notFound('Delegation not found');
    }
    logger.error({ error, userId: user.id, delegationId: id }, 'Failed to respond to delegation');
    throw createError.internal('Failed to respond to delegation');
  }

  logger.info(
    { userId: user.id, delegationId: id, status: newStatus },
    'Agent delegation response recorded',
  );

  return NextResponse.json({ success: true, delegation: data });
}

export const PUT = withErrorHandler(handleRespondToDelegation);
