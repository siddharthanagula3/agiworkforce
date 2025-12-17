/**
 * Subscription Service
 *
 * Manages user subscriptions integrating Supabase (database) with Stripe (payments).
 * This service coordinates between the local database and Stripe for subscription management.
 */

import {
  getSupabase,
  type PricingPlan,
  type Subscription,
  type PlanTier,
  asPlanTier,
} from '../lib/supabase';
import { supabaseAuth } from './supabaseAuth';

// Stripe price IDs mapped to plan tiers (default to annual plans)
export const STRIPE_PRICE_IDS: Record<PlanTier, string> = {
  free: 'price_1RxhcU0atLU7AWGTkVn2j7DS',
  pro: 'price_1SeqRd0atLU7AWGTiLWX2PaL', // Annual - $299.88/year ($24.99/mo)
  max: 'price_1SerIL0atLU7AWGT2c1HMEVJ', // Annual - $2999.88/year ($249.99/mo)
  enterprise: 'price_1Seoam0atLU7AWGT3lQ2wDav',
};

// Monthly price IDs for users who prefer monthly billing
export const STRIPE_PRO_MONTHLY_PRICE_ID = 'price_1SeqRd0atLU7AWGTUSWQWEso'; // $29.99/month
export const STRIPE_MAX_MONTHLY_PRICE_ID = 'price_1SerIL0atLU7AWGTkcaeDZHu'; // $299.99/month

export const STRIPE_PRODUCT_IDS: Record<PlanTier, string> = {
  free: 'prod_StUbhCc9Y4aVwP',
  pro: 'prod_StUazPLCB2MV6j',
  max: 'prod_Tc5TnOvtWWeGll',
  enterprise: 'prod_Tc2fXCzWqk1oDD',
};

export interface PlanFeatures {
  automationsPerDay: number | 'unlimited';
  browserAutomation: boolean;
  advancedUiAutomation: boolean;
  emailSupport: boolean;
  prioritySupport: boolean;
  teamFeatures: boolean;
  sso: boolean;
  customWorkflows: boolean;
  webhookIntegration: boolean;
  analytics: boolean;
  llmCostTracking: boolean;
}

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    automationsPerDay: 3,
    browserAutomation: false,
    advancedUiAutomation: false,
    emailSupport: false,
    prioritySupport: false,
    teamFeatures: false,
    sso: false,
    customWorkflows: false,
    webhookIntegration: false,
    analytics: false,
    llmCostTracking: false,
  },
  pro: {
    // $29.99/month or $24.99/month (billed yearly)
    // Includes $25/month token credits
    automationsPerDay: 'unlimited',
    browserAutomation: true,
    advancedUiAutomation: true,
    emailSupport: true,
    prioritySupport: false,
    teamFeatures: false,
    sso: false,
    customWorkflows: false,
    webhookIntegration: false,
    analytics: false,
    llmCostTracking: true,
  },
  max: {
    // $299.99/month or $249.99/month (billed yearly)
    // Includes $300/month cloud credits
    automationsPerDay: 'unlimited',
    browserAutomation: true,
    advancedUiAutomation: true,
    emailSupport: true,
    prioritySupport: true,
    teamFeatures: false,
    sso: false,
    customWorkflows: true,
    webhookIntegration: true,
    analytics: true,
    llmCostTracking: true,
  },
  enterprise: {
    automationsPerDay: 'unlimited',
    browserAutomation: true,
    advancedUiAutomation: true,
    emailSupport: true,
    prioritySupport: true,
    teamFeatures: true,
    sso: true,
    customWorkflows: true,
    webhookIntegration: true,
    analytics: true,
    llmCostTracking: true,
  },
};

// Monthly token credits per plan (in cents)
export const PLAN_MONTHLY_CREDITS: Record<PlanTier, number> = {
  free: 0,
  pro: 2500, // $25/month
  max: 30000, // $300/month
  enterprise: 0, // Custom/negotiated
};

export interface SubscriptionState {
  isLoading: boolean;
  error: string | null;
  subscription: Subscription | null;
  plans: PricingPlan[];
  currentPlan: PricingPlan | null;
}

class SubscriptionService {
  private static instance: SubscriptionService;
  private listeners: Set<(state: SubscriptionState) => void> = new Set();
  private state: SubscriptionState = {
    isLoading: false,
    error: null,
    subscription: null,
    plans: [],
    currentPlan: null,
  };

  private constructor() {
    // Initialize subscription state when auth state changes
    supabaseAuth.onAuthStateChange((authState) => {
      if (authState.subscription) {
        this.updateState({ subscription: authState.subscription });
        this.refreshCurrentPlan();
      } else if (!authState.user) {
        this.updateState({
          subscription: null,
          currentPlan: null,
        });
      }
    });
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Fetch all available pricing plans
   */
  async fetchPlans(): Promise<PricingPlan[]> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_cents', { ascending: true });

      if (error) throw error;

      this.updateState({ plans: data || [], isLoading: false });
      return data || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch plans';
      this.updateState({ error: message, isLoading: false });
      return [];
    }
  }

  /**
   * Get current plan details
   */
  private async refreshCurrentPlan(): Promise<void> {
    const subscription = this.state.subscription;
    if (!subscription) return;

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('pricing_plans')
        .select('*')
        .eq('tier', subscription.plan_tier)
        .eq('is_active', true)
        .single();

      if (error) throw error;

      this.updateState({ currentPlan: data });
    } catch (error) {
      console.error('[Subscription] Error fetching current plan:', error);
    }
  }

  /**
   * Get the user's current subscription
   */
  async getSubscription(): Promise<Subscription | null> {
    const userId = supabaseAuth.getUser()?.id;
    if (!userId) return null;

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      this.updateState({ subscription: data });
      return data;
    } catch (error) {
      console.error('[Subscription] Error fetching subscription:', error);
      return null;
    }
  }

  /**
   * Create a Stripe Checkout session for subscribing to a plan
   * This should redirect the user to Stripe's hosted checkout page
   *
   * @param planTier - The plan tier to subscribe to
   * @param billingInterval - 'monthly' or 'annual' (default: 'annual' for Pro)
   */
  async createCheckoutSession(
    planTier: PlanTier,
    billingInterval: 'monthly' | 'annual' = 'annual',
  ): Promise<{ url: string } | { error: string }> {
    const user = supabaseAuth.getUser();
    const profile = supabaseAuth.getState().profile;

    if (!user || !profile) {
      return { error: 'Not authenticated' };
    }

    // Get the appropriate price ID based on tier and billing interval
    let priceId: string | undefined;
    if (planTier === 'pro') {
      // Pro plan: annual by default ($24.99/mo billed yearly), or monthly ($29.99/mo)
      priceId =
        billingInterval === 'monthly'
          ? STRIPE_PRO_MONTHLY_PRICE_ID // $29.99/month
          : STRIPE_PRICE_IDS.pro; // $299.88/year ($24.99/mo)
    } else {
      priceId = STRIPE_PRICE_IDS[planTier];
    }

    if (!priceId) {
      return { error: 'Invalid plan tier' };
    }

    // In a real implementation, this would call your backend API to create a Stripe Checkout session
    // For now, we'll use a payment link approach

    // The payment link would be created via Stripe MCP or your backend
    // This is a placeholder that would be replaced with actual Stripe integration
    const successUrl = `${window.location.origin}/subscription/success`;
    const cancelUrl = `${window.location.origin}/subscription/cancel`;

    // For desktop apps, the typical flow is:
    // 1. Call your backend to create a Stripe Checkout session
    // 2. Backend returns a checkout URL
    // 3. Open that URL in the user's browser
    // 4. User completes payment on Stripe
    // 5. Stripe webhooks update your database
    // 6. Desktop app polls or receives push notification about subscription update

    // Placeholder - in production, call your backend API
    console.log('[Subscription] Would create checkout session for:', {
      userId: user.id,
      email: user.email,
      priceId,
      billingInterval,
      successUrl,
      cancelUrl,
    });

    return {
      error:
        'Checkout session creation requires backend integration. Use the Stripe payment link for now.',
    };
  }

  /**
   * Create a Stripe Customer Portal session for managing subscription
   */
  async createPortalSession(): Promise<{ url: string } | { error: string }> {
    const subscription = this.state.subscription;

    if (!subscription?.stripe_customer_id) {
      return { error: 'No active subscription found' };
    }

    // In production, call your backend to create a portal session
    // The backend would use Stripe API to create a billing portal session
    console.log(
      '[Subscription] Would create portal session for customer:',
      subscription.stripe_customer_id,
    );

    return {
      error: 'Portal session creation requires backend integration.',
    };
  }

  /**
   * Check if user has access to a specific feature based on their plan
   */
  hasFeatureAccess(feature: keyof PlanFeatures): boolean {
    const tier = asPlanTier(this.state.subscription?.plan_tier);
    const features = PLAN_FEATURES[tier];
    return !!features[feature];
  }

  /**
   * Get features for a specific plan tier
   */
  getPlanFeatures(tier: PlanTier): PlanFeatures {
    return PLAN_FEATURES[tier];
  }

  /**
   * Check if user can upgrade to a higher plan
   */
  canUpgradeTo(targetTier: PlanTier): boolean {
    const currentTier = asPlanTier(this.state.subscription?.plan_tier);
    const tierOrder: PlanTier[] = ['free', 'pro', 'enterprise'];
    return tierOrder.indexOf(targetTier) > tierOrder.indexOf(currentTier);
  }

  /**
   * Get current state
   */
  getState(): SubscriptionState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: (state: SubscriptionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<SubscriptionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('[Subscription] Error in state listener:', error);
      }
    });
  }

  /**
   * Track a usage event
   */
  async trackUsage(
    eventType: string,
    quantity: number = 1,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const userId = supabaseAuth.getUser()?.id;
    if (!userId) return;

    const supabase = getSupabase();

    try {
      await supabase.from('usage_events').insert({
        user_id: userId,
        event_type: eventType,
        quantity,
        metadata: metadata as Record<string, never>,
      });
    } catch (error) {
      console.error('[Subscription] Error tracking usage:', error);
    }
  }

  /**
   * Get usage summary for current period
   */
  async getUsageSummary(): Promise<{ [key: string]: number }> {
    const userId = supabaseAuth.getUser()?.id;
    const subscription = this.state.subscription;

    if (!userId || !subscription) return {};

    const supabase = getSupabase();
    const periodStart = subscription.current_period_start || new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('usage_events')
        .select('event_type, quantity')
        .eq('user_id', userId)
        .gte('created_at', periodStart);

      if (error) throw error;

      // Aggregate usage by event type
      return (data || []).reduce(
        (acc, event) => {
          acc[event.event_type] = (acc[event.event_type] || 0) + (event.quantity ?? 0);
          return acc;
        },
        {} as { [key: string]: number },
      );
    } catch (error) {
      console.error('[Subscription] Error fetching usage summary:', error);
      return {};
    }
  }
}

// Export singleton instance
export const subscriptionService = SubscriptionService.getInstance();
