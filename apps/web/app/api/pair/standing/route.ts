export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

import {
  evaluatePairingStanding,
  isRelayCaller,
  pairingStandingRequestSchema,
} from '@/lib/device-steps/pairing-standing';
import { logger } from '@/lib/logger';

/**
 * The relay's recheck of live Remote Control pairings. A pairing is checked
 * against the same account, workspace, plan and switch gates that created it,
 * and against the devices it names, so a deletion, a sign-out everywhere, a
 * downgrade or a workspace switch-off ends it within the relay's interval.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isRelayCaller(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = pairingStandingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid standing request' }, { status: 400 });
  }

  try {
    const results = await evaluatePairingStanding(parsed.data.pairings, request.url);
    return NextResponse.json({ results });
  } catch (error) {
    logger.error({ error }, '[pairing-standing] standing check failed');
    return NextResponse.json({ error: 'Standing unavailable' }, { status: 503 });
  }
}
