import 'server-only';

import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';

import { evaluateFlagsForSubject } from './flag-evaluation-service';
import { STORE_TEST_PURCHASES_FLAG_KEY, storeTestPurchasesAllowed } from './store-test-purchases';

/**
 * Whether the operator has named this account as one that may be granted a
 * store test purchase in production. Every failure reads refused: an absent
 * flag, an unreadable store and anything thrown on the way all leave the
 * purchase ungranted, because the other answer hands out a paid plan for free.
 */
export async function readStoreTestPurchasesAllowed(
  userId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  try {
    return storeTestPurchasesAllowed(
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
        { keyPrefix: STORE_TEST_PURCHASES_FLAG_KEY },
        nowMs,
      ),
    );
  } catch (error) {
    logger.error({ error }, '[billing] store test purchase allowance unreadable; refused');
    return false;
  }
}
