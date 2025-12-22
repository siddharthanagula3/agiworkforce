import { createSupabaseServerClient } from '../services/supabase-server';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription: {
    id: string;
    plan_tier: string;
    status: string;
    current_period_end: string | null;
  } | null;
}

/**
 * Check if user has an active subscription
 * Active statuses: 'active', 'trialing'
 */
export async function checkSubscriptionStatus(): Promise<SubscriptionStatus> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      hasActiveSubscription: false,
      subscription: null,
    };
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, plan_tier, status, current_period_end')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  return {
    hasActiveSubscription: hasActiveSubscription || false,
    subscription: subscription || null,
  };
}

/**
 * Require active subscription - throws error if not active
 */
export async function requireActiveSubscription(): Promise<{
  subscription: NonNullable<SubscriptionStatus['subscription']>;
}> {
  const status = await checkSubscriptionStatus();

  if (!status.hasActiveSubscription || !status.subscription) {
    throw new Error('Active subscription required');
  }

  return {
    subscription: status.subscription,
  };
}
