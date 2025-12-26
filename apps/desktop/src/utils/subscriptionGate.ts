import { asPlanTier, type PlanTier } from '../lib/supabase';
import { supabaseAuth } from '../services/supabaseAuth';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';

export interface SubscriptionGateResult {
  hasAccess: boolean;
  reason?: string;
  currentTier?: PlanTier;
  currentStatus?: SubscriptionStatus;
  requiresUpgrade?: boolean;
}

const PLAN_TIER_HIERARCHY: PlanTier[] = ['free', 'hobby', 'pro', 'max', 'enterprise'];

export function checkSubscriptionGate(): SubscriptionGateResult {
  const authState = supabaseAuth.getState();

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

  const activeStatuses: SubscriptionStatus[] = ['active', 'trialing'];
  const GRACE_PERIOD_DAYS = 7;

  let isGracePeriod = false;
  if (status === 'past_due' && subscription.current_period_end) {
    const now = Math.floor(Date.now() / 1000);
    const endDate = new Date(subscription.current_period_end).getTime() / 1000;
    const gracePeriodEnd = endDate + GRACE_PERIOD_DAYS * 24 * 60 * 60;
    if (now < gracePeriodEnd) {
      isGracePeriod = true;
    }
  }

  if (!activeStatuses.includes(status) && !isGracePeriod) {
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
  const authState = supabaseAuth.getState();

  if (!authState.subscription) {
    return {
      hasAccess: false,
      reason: 'Auto Mode requires a Hobby plan or higher.',
      requiresUpgrade: true,
      currentTier: 'free',
      currentStatus: 'none',
    };
  }

  const subscription = authState.subscription;
  const planTier = asPlanTier(subscription.plan_tier);
  const currentTierIndex = PLAN_TIER_HIERARCHY.indexOf(planTier);
  const hobbyTierIndex = PLAN_TIER_HIERARCHY.indexOf('hobby');

  if (currentTierIndex < hobbyTierIndex) {
    return {
      hasAccess: false,
      reason: 'Auto Mode requires a Hobby plan or higher.',
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
  if (!currentTier || currentTier === 'free') {
    return 'Subscribe to Hobby plan to unlock AGI Workforce';
  }
  return 'Upgrade to Hobby plan or higher to continue using AGI Workforce';
}
