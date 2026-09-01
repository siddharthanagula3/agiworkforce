import {
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isSelfServePaidPlanTier,
} from '@agiworkforce/types';
import type { PaywallSlot } from '@/features/chat/types/message-metadata';
import { resolveFreeCapacityPaywallSlot } from './freeCapacityRecovery';

export interface ServerQuotaRecovery {
  action: string;
  href: string;
}

type RenderableRecoveryAction = NonNullable<PaywallSlot['recoveryAction']>;

const SERVER_RECOVERY_ACTIONS = new Set<RenderableRecoveryAction>([
  'top_up',
  'upgrade',
  'view_usage',
]);

/**
 * The primary CTA the server asked for, from a list it may send more than one
 * of. `byok` is deliberately not renderable as the primary action: it is a
 * secondary way out that the free-capacity variant renders alongside the others,
 * and promoting it here would replace an upgrade CTA on every refusal that
 * happens to carry one.
 */
function serverRecoveryAction(
  recovery: readonly ServerQuotaRecovery[] | undefined,
): RenderableRecoveryAction | null {
  for (const option of recovery ?? []) {
    const action = option.action as RenderableRecoveryAction;
    if (SERVER_RECOVERY_ACTIONS.has(action)) return action;
  }
  return null;
}

export function resolveQuotaPaywallSlot(input: {
  code: string | undefined;
  message: string;
  recovery?: readonly ServerQuotaRecovery[] | undefined;
  planTier: string | null | undefined;
  subscriptionSource: string | null | undefined;
  resetAt?: string | undefined;
  retryAt?: string | undefined;
}): PaywallSlot | null {
  const freeCapacity = resolveFreeCapacityPaywallSlot({
    code: input.code,
    message: input.message,
    recovery: input.recovery,
    planTier: input.planTier,
    ...(input.retryAt ? { retryAt: input.retryAt } : {}),
  });
  if (freeCapacity) return freeCapacity;

  const block = classifyManagedQuotaErrorCode(input.code);
  if (!block) return null;

  const nextTier = getNextUpgradeTier(input.planTier);
  const canBuyCredits =
    block.clearedByCredits &&
    isSelfServePaidPlanTier(input.planTier) &&
    input.subscriptionSource === 'stripe';
  const recoveryAction =
    serverRecoveryAction(input.recovery) ?? (canBuyCredits ? 'top_up' : 'upgrade');

  return {
    feature: block.feature,
    requiredTier: nextTier ?? 'basic',
    reason: input.message || block.reason,
    recoveryAction,
    showUpgradeCta: block.showUpgradeCta && (nextTier !== null || recoveryAction === 'top_up'),
    showResetTime: block.showResetTime,
    suggestStandardModel: block.suggestStandardModel,
    ...(input.resetAt ? { resetAt: input.resetAt } : {}),
  };
}
