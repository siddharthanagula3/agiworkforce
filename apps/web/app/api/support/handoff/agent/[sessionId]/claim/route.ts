import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { createError } from '@/lib/errors';
import { claimHandoffForAgent } from '@/lib/support/handoff/handoff-service';
import { appendHandoffMessage, getSessionById } from '@/lib/support/handoff/store';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleClaim(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requirePlatformAdmin(request);
  const { sessionId } = await context.params;

  const claim = await claimHandoffForAgent(sessionId, userId);
  if (!claim) {
    const existing = await getSessionById(sessionId);
    if (!existing) throw createError.notFound('Support request not found');
    throw createError.conflict(
      existing.status === 'waiting'
        ? 'That request has passed its wait deadline and has been emailed instead'
        : `That request is already ${existing.status}`,
    );
  }

  await appendHandoffMessage({
    sessionId,
    author: 'system',
    body: 'A member of the support team joined and can see this conversation.',
  });

  return NextResponse.json(claim);
}

export const POST = withErrorHandler(handleClaim);
