import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  billingPlanCapabilityUpgradeMessage,
  billingPlanCapabilityWireTiers,
  canUseBillingPlanCapability,
  wirePlanOf,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { isAppError } from '@/lib/errors';
import { readSurfaceHint } from '@/lib/free-chat-surface-policy';
import { logger } from '@/lib/logger';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';

import { assertCapabilityAvailable } from './capability-gate';
import { buildFlagSubject } from './flag-evaluation-service';
import { SCREEN_SHARE_CAPABILITY } from './kill-switches';

const REMOTE_CONTROL_LABEL = 'Remote Control';

/**
 * Remote Control is governed by the screen share switch
 * (packages/contracts/types/src/feature-registry.json), so a pairing is refused
 * while it is closed and the refusal says why, in the shape pairing answers in.
 */
export async function remoteControlRefusal(
  request: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  const subject = buildFlagSubject(request, {
    userId,
    workspaceId: null,
    role: null,
    plan: null,
    surface: readSurfaceHint(request),
  });
  try {
    await assertCapabilityAvailable(subject, SCREEN_SHARE_CAPABILITY, REMOTE_CONTROL_LABEL);
    return null;
  } catch (error) {
    if (!isAppError(error)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
}

const PLAN_UNREADABLE =
  'Your plan could not be checked, so Remote Control did not start. Try again.';

export async function remoteControlPlanRefusal(
  db: DatabaseAdapter,
  userId: string,
): Promise<NextResponse | null> {
  let plan: BillingPlanTier;
  try {
    plan = await resolveEntitledPlanTier(db, userId);
  } catch (error) {
    logger.error({ error, userId }, '[remote-control] plan unreadable; pairing refused');
    return NextResponse.json({ error: PLAN_UNREADABLE }, { status: 503 });
  }
  if (canUseBillingPlanCapability(plan, 'remote_control')) return null;
  return NextResponse.json(
    {
      error: billingPlanCapabilityUpgradeMessage('remote_control'),
      code: 'plan_upgrade_required',
      current_plan: wirePlanOf(plan).tier,
      required_plans: billingPlanCapabilityWireTiers('remote_control'),
    },
    { status: 403 },
  );
}
