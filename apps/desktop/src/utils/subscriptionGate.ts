/**
 * Subscription Gate Utilities
 *
 * Ensures users have at least hobby tier subscription to use the desktop app
 */

import type { PlanTier } from '../lib/supabase';
import { supabaseAuth } from '../services/supabaseAuth';

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';

export interface SubscriptionGateResult {
  hasAccess: boolean;
  reason?: string;
  currentTier?: PlanTier;
  currentStatus?: SubscriptionStatus;
  requiresUpgrade?: boolean;
}

/**
 * Plan tier hierarchy (lowest to highest)
 */
const PLAN_TIER_HIERARCHY: PlanTier[] = ['free', 'hobby', 'pro', 'max', 'enterprise'];

/**
 * Check if user has at least hobby tier subscription
 */
export function checkSubscriptionGate(): SubscriptionGateResult {
  const authState = supabaseAuth.getState();

  // Check authentication
  if (!authState.user || !authState.session) {
    return {
      hasAccess: false,
      reason: 'Please sign in to use AGI Workforce',
      requiresUpgrade: false,
    };
  }

  // Check subscription exists
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
  const planTier = subscription.plan_tier as PlanTier;
  const status = subscription.status as SubscriptionStatus;

  // Check subscription status (must be active, trialing, or within grace period)
  const activeStatuses: SubscriptionStatus[] = ['active', 'trialing'];
  const GRACE_PERIOD_DAYS = 7;

  // Check for grace period
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

  // Check plan tier (must be at least hobby)
  const currentTierIndex = PLAN_TIER_HIERARCHY.indexOf(planTier);
  const hobbyTierIndex = PLAN_TIER_HIERARCHY.indexOf('hobby');

  if (currentTierIndex < hobbyTierIndex) {
    return {
      hasAccess: false,
      reason: 'A Hobby plan or higher subscription is required to use AGI Workforce',
      requiresUpgrade: true,
      currentTier: planTier,
      currentStatus: status,
    };
  }

  // User has access
  return {
    hasAccess: true,
    currentTier: planTier,
    currentStatus: status,
  };
}

/**
 * Check if user can use API keys (requires hobby+ subscription)
 */
export function canUseAPIKeys(): boolean {
  const gateResult = checkSubscriptionGate();
  return gateResult.hasAccess;
}

/**
 * Get upgrade message for subscription gate
 */
export function getUpgradeMessage(currentTier?: PlanTier): string {
  if (!currentTier || currentTier === 'free') {
    return 'Subscribe to Hobby plan to unlock AGI Workforce';
  }
  return 'Upgrade to Hobby plan or higher to continue using AGI Workforce';
}
