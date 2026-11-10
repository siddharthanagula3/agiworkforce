import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { toHandoffClaimResponse } from '@/lib/support/handoff/handoff-service';
import { listConnectedSessionsForAgent } from '@/lib/support/handoff/store';
import { type HandoffClaimResponse } from '@agiworkforce/cloud-contracts/support';

const ACTIVE_SESSION_LIMIT = 25;

async function handleActive(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requirePlatformAdmin(request);

  const rows = await listConnectedSessionsForAgent(userId, ACTIVE_SESSION_LIMIT);
  const sessions: HandoffClaimResponse[] = rows.map(toHandoffClaimResponse);
  return NextResponse.json({ sessions }, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleActive);
