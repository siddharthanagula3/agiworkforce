import type { FreeModelPromotionOffer } from '@agiworkforce/cloud-contracts';

import { readAcknowledgedAccount, rememberAcknowledgedAccount } from './account-notice';

const STORAGE_KEY_PREFIX = 'agi.free-model-promotion.default';

/**
 * True the first time this account sees this promotion on this browser, and
 * never again: the promoted model becomes the Free default once, and a later
 * move back to the plan's own model is the account's choice to keep.
 */
export function claimFreeModelPromotionDefault(
  promotion: FreeModelPromotionOffer,
  accountId: string,
): boolean {
  const key = `${STORAGE_KEY_PREFIX}.${promotion.modelId}.${promotion.endsAt}`;
  if (readAcknowledgedAccount(key) === accountId) return false;
  rememberAcknowledgedAccount(key, accountId);
  return true;
}
