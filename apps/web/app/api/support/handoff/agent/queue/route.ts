import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { getWaitingQueue } from '@/lib/support/handoff/handoff-service';

async function handleQueue(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  await requirePlatformAdmin(request);

  const queue = await getWaitingQueue();
  return NextResponse.json({ queue }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleQueue);
