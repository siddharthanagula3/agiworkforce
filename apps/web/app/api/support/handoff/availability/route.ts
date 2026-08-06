/**
 * GET /api/support/handoff/availability
 *
 * Tells the widget the truth BEFORE the user commits to anything: is a human
 * actually there, and if not, what happens instead.
 *
 * No auth — the marketing widget calls this signed out. It reveals only
 * deployment-level facts (is live chat on, is anyone online, what address does
 * the fallback go to), never anything about an account or another user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveHumanAvailability } from '@/lib/support/handoff/presence-service';

async function handleAvailability(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-availability');
  if (limited) return limited;

  const availability = await resolveHumanAvailability();
  return NextResponse.json(availability, {
    // Presence changes on a ~90s heartbeat TTL; never let a CDN pin it.
    headers: { 'cache-control': 'no-store' },
  });
}

export const GET = withErrorHandler(handleAvailability);
