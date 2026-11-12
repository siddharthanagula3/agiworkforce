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
import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import type {
  PolicySurface,
  RequestOriginRules,
} from '@/lib/services/organization-policy-evaluator';

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
    plan = await resolveEntitledPlanTier(db, userId, { throwOnSeatLookupError: true });
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

const UNAVAILABLE_STATUS = 503;

/**
 * A refusal is final when the answer is no, and not final when the answer could
 * not be read: a live pairing ends on the first and is only held on the second.
 */
export interface RemoteControlStandingRefusal {
  final: boolean;
  response: NextResponse;
}

/**
 * Everything that decides whether this account may hold a Remote Control
 * pairing right now: the workspace policy, the plan and the switch. Creating a
 * pairing, claiming one and the relay's recheck of a live one all ask this,
 * so a pairing outlives none of the reasons that would have refused it.
 */
export async function remoteControlStandingRefusal(
  db: DatabaseAdapter,
  userId: string,
  request: NextRequest,
  surface: PolicySurface,
  options: { originRules?: RequestOriginRules } = {},
): Promise<RemoteControlStandingRefusal | null> {
  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'remote_control',
    surface,
    undefined,
    options,
  );
  if (featureGate) {
    return { final: featureGate.status !== UNAVAILABLE_STATUS, response: featureGate };
  }

  const planRefusal = await remoteControlPlanRefusal(db, userId);
  if (planRefusal) {
    return { final: planRefusal.status !== UNAVAILABLE_STATUS, response: planRefusal };
  }

  const switchedOff = await remoteControlRefusal(request, userId);
  return switchedOff ? { final: true, response: switchedOff } : null;
}
