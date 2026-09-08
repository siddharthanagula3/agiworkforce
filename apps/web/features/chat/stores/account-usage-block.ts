import type { PaywallSlot } from '@/features/chat/types/message-metadata';

/**
 * A refusal that blocks the account rather than the turn that hit it. Same
 * shape as the inline card's slot, so the composer banner and the recovery
 * handler read the fields they already read; only the lifetime differs.
 */
export type AccountUsageBlock = PaywallSlot;

/**
 * Capacity the account has spent, as opposed to something about this request.
 * `token_cap` and `rolling_capacity` are the two the plan owns; a block that
 * suggests a standard model, or that a retry can clear, is answerable by
 * changing the next send and stays an inline card on the turn that caused it.
 */
const ACCOUNT_WIDE_FEATURES: ReadonlySet<string> = new Set(['token_cap', 'rolling_capacity']);

export function isAccountWideUsageBlock(slot: PaywallSlot): boolean {
  if (slot.freeCapacity) return false;
  if (slot.suggestStandardModel === true) return false;
  return ACCOUNT_WIDE_FEATURES.has(slot.feature);
}

export function accountUsageBlockEqual(
  left: AccountUsageBlock | null,
  right: AccountUsageBlock | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.feature === right.feature &&
    left.requiredTier === right.requiredTier &&
    left.reason === right.reason &&
    left.recoveryAction === right.recoveryAction &&
    left.resetAt === right.resetAt &&
    left.showUpgradeCta === right.showUpgradeCta &&
    left.showResetTime === right.showResetTime
  );
}
