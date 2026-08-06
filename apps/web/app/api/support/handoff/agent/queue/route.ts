/**
 * GET /api/support/handoff/agent/queue — waiting escalations, for a human.
 *
 * ADMIN ONLY. Returns queue metadata only: reference, surface, reason, the
 * agent's one-line summary, and the deadline. It deliberately does NOT return
 * the transcript or the account context — those arrive on CLAIM, so an admin
 * browsing the queue does not read every user's conversation in passing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/auth-guards';
import { getWaitingQueue } from '@/lib/support/handoff/handoff-service';

async function handleQueue(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  await requireAdmin(request);

  const queue = await getWaitingQueue();
  return NextResponse.json({ queue }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleQueue);
