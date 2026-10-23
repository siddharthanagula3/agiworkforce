import 'server-only';

import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';

import { evaluateFlagsForSubject } from './flag-evaluation-service';
import { USAGE_PROMOTIONS_FLAG_KEY, usagePromotionsOn } from './usage-promotions';

/**
 * Whether usage-limit promotions may act for this account. Every failure reads
 * off, because the other answer hands out usage nobody decided to give.
 */
export async function readUsagePromotionsOn(
  userId: string,
  plan: string | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    return usagePromotionsOn(
      await evaluateFlagsForSubject(
        {
          userId,
          workspaceId: null,
          role: null,
          plan,
          region: managedCloudDataRegion(),
          country: null,
          surface: null,
          clientVersion: null,
        },
        { keyPrefix: USAGE_PROMOTIONS_FLAG_KEY },
        nowMs,
      ),
    );
  } catch (error) {
    logger.error({ error }, '[billing] usage promotion switch unreadable; promotions stay off');
    return false;
  }
}
