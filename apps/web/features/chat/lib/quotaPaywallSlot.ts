import {
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isSelfServePaidPlanTier,
} from '@agiworkforce/types';
import type { PaywallSlot } from '@/features/chat/types/message-metadata';

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

function serverRecoveryAction(
  recovery: ServerQuotaRecovery | undefined,
): RenderableRecoveryAction | null {
  const action = recovery?.action as RenderableRecoveryAction | undefined;
  return action && SERVER_RECOVERY_ACTIONS.has(action) ? action : null;
}

export function resolveQuotaPaywallSlot(input: {
  code: string | undefined;
  message: string;
  recovery?: ServerQuotaRecovery | undefined;
  planTier: string | null | undefined;
  subscriptionSource: string | null | undefined;
  resetAt?: string | undefined;
}): PaywallSlot | null {
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
