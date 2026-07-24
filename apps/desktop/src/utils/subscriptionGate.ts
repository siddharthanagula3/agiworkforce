import { asPlanTier, type PlanTier } from '../lib/cloudAccountTypes';
import { cloudAccountAuth } from '../services/cloudAccountAuth';
import {
  effectivePlanTier,
  isEntitledSubscriptionStatus,
  normalizeUIPlanTier,
  tierAtLeast,
} from '@agiworkforce/types';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';

export interface SubscriptionGateResult {
  hasAccess: boolean;
  reason?: string;
  currentTier?: PlanTier;
  currentStatus?: SubscriptionStatus;
  requiresUpgrade?: boolean;
}

export function checkSubscriptionGate(): SubscriptionGateResult {
  const authState = cloudAccountAuth.getState();

  if (!authState.user || !authState.session) {
    return {
      hasAccess: false,
      reason: 'Please sign in to use AGI Workforce',
      requiresUpgrade: false,
    };
  }

  if (!authState.subscription) {
    return {
      hasAccess: false,
      reason: 'A subscription is required to use AGI Workforce',
      requiresUpgrade: true,
      currentTier: 'free',
      currentStatus: 'none',
    };
  }

  const subscription = authState.subscription;
  const planTier = asPlanTier(subscription.plan_tier);
  const status = subscription.status as SubscriptionStatus;

  if (!isEntitledSubscriptionStatus(status)) {
    return {
      hasAccess: false,
      reason: `Your subscription is ${status}. Please update your payment method to continue using AGI Workforce.`,
      requiresUpgrade: status === 'canceled' || status === 'none',
      currentTier: planTier,
      currentStatus: status,
    };
  }

  // Free users are now allowed access to the app generally
  return {
    hasAccess: true,
    currentTier: planTier,
    currentStatus: status,
  };
}

export function checkAutoModeAccess(): SubscriptionGateResult {
  const authState = cloudAccountAuth.getState();

  if (!authState.subscription) {
    return {
      hasAccess: false,
      reason: 'Auto Mode requires a Basic plan or higher.',
      requiresUpgrade: true,
      currentTier: 'free',
      currentStatus: 'none',
    };
  }

  const subscription = authState.subscription;
  const planTier = asPlanTier(effectivePlanTier(subscription.plan_tier, subscription.status));

  if (!tierAtLeast(normalizeUIPlanTier(planTier), 'basic')) {
    return {
      hasAccess: false,
      reason: 'Auto Mode requires a Basic plan or higher.',
      requiresUpgrade: true,
      currentTier: planTier,
      currentStatus: subscription.status as SubscriptionStatus,
    };
  }

  return {
    hasAccess: true,
    currentTier: planTier,
    currentStatus: subscription.status as SubscriptionStatus,
  };
}

export function canUseAPIKeys(): boolean {
  const gateResult = checkSubscriptionGate();
  return gateResult.hasAccess;
}

export function getUpgradeMessage(currentTier?: PlanTier): string {
  if (
    !currentTier ||
    currentTier === 'free' ||
    currentTier === 'local-only' ||
    currentTier === 'byok'
  ) {
    return 'Subscribe to Basic plan to unlock AGI Workforce';
  }
  return 'Upgrade to Basic plan or higher to continue using AGI Workforce';
}
