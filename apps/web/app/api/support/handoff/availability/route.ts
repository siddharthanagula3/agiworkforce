
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveHumanAvailability } from '@/lib/support/handoff/presence-service';

async function handleAvailability(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-availability');
  if (limited) return limited;

  const availability = await resolveHumanAvailability();
  return NextResponse.json(availability, {
    headers: { 'cache-control': 'no-store' },
  });
}

export const GET = withErrorHandler(handleAvailability);
