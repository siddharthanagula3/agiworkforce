/**
 * POST /api/support/handoff/agent/[sessionId]/claim — a human takes the session.
 *
 * ADMIN ONLY. The claim is a conditional UPDATE (`status = 'waiting' and
 * wait_expires_at > now()`), so the loser of a race gets 409 and two agents can
 * never both be talking to one user — and an expired wait cannot be claimed out
 * from under the email fallback that already owns it.
 *
 * THE RESPONSE CARRIES EVERYTHING: transcript, what the agent already tried, the
 * sources it cited, and the server-derived account context. That is the whole
 * point of live handoff — the user must not have to repeat themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { requireAdmin } from '@/lib/auth-guards';
import { createError } from '@/lib/errors';
import { claimHandoffForAgent } from '@/lib/support/handoff/handoff-service';
import { appendHandoffMessage, getSessionById } from '@/lib/support/handoff/store';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleClaim(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requireAdmin(request);
  const { sessionId } = await context.params;

  const claim = await claimHandoffForAgent(sessionId, userId);
  if (!claim) {
    // Distinguish "already taken / already timed out" from "no such session",
    // because an agent console needs to know which one happened.
    const existing = await getSessionById(sessionId);
    if (!existing) throw createError.notFound('Support request not found');
    throw createError.conflict(
      existing.status === 'waiting'
        ? 'That request has passed its wait deadline and has been emailed instead'
        : `That request is already ${existing.status}`,
    );
  }

  // Tell the user a person is here, in the transcript they are already polling.
  await appendHandoffMessage({
    sessionId,
    author: 'system',
    body: 'A member of the support team joined and can see this conversation.',
  });

  return NextResponse.json(claim);
}

export const POST = withErrorHandler(handleClaim);
