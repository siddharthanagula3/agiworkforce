import { topUpBudgetCentsForCredits, type MobileIapPlatform } from '@agiworkforce/types';
import { MICROUSD_PER_LEDGER_CENT } from '@/lib/server/managed-usage-policy';

export interface MobileTopUpReceiptAmounts {
  units_granted: number;
  intended_amount_cents: number;
}

/**
 * The credit budget a store top-up granted for `retailCents` of its price. A
 * store refund names retail money, and the ledger holds the budget the credits
 * bought, so a refund or its reversal moves this amount, never the retail one.
 */
export function mobileTopUpBudgetMicrousd(
  receipt: MobileTopUpReceiptAmounts,
  retailCents: number,
): number {
  if (receipt.intended_amount_cents <= 0) return 0;
  const grantedMicrousd =
    topUpBudgetCentsForCredits(receipt.units_granted) * MICROUSD_PER_LEDGER_CENT;
  return Math.round((grantedMicrousd * retailCents) / receipt.intended_amount_cents);
}

export function mobileTopUpRefundDescription(
  platform: MobileIapPlatform,
  storeTransactionId: string,
): string {
  return `Mobile ${platform} refund ${storeTransactionId}`;
}

export function mobileTopUpRefundReversalDescription(
  platform: MobileIapPlatform,
  storeTransactionId: string,
): string {
  return `Mobile ${platform} refund reversed ${storeTransactionId}`;
}
