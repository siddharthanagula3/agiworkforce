import 'server-only';

import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';

import { BILLING_UPGRADES_OPEN_FLAG_KEY, billingUpgradesOpen } from './billing-upgrades';
import { evaluateFlagsForSubject } from './flag-evaluation-service';

/**
 * Whether the operator has opened paid upgrades to this account. Every failure
 * reads closed: an unreadable store yields no definition, which is the gated
 * state, and anything thrown on the way is answered the same, because the other
 * answer starts a checkout nobody decided to allow.
 */
export async function readBillingUpgradesOpen(
  userId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    return billingUpgradesOpen(
      await evaluateFlagsForSubject(
        {
          userId,
          workspaceId: null,
          role: null,
          plan: null,
          region: managedCloudDataRegion(),
          country: null,
          surface: null,
          clientVersion: null,
        },
        { keyPrefix: BILLING_UPGRADES_OPEN_FLAG_KEY },
        nowMs,
      ),
    );
  } catch (error) {
    logger.error({ error }, '[billing] upgrade switch unreadable; upgrades stay gated');
    return false;
  }
}
