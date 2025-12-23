import {
  getSupabase,
  type PricingPlan,
  type Subscription,
  type PlanTier,
  asPlanTier,
} from '../lib/supabase';
import { supabaseAuth } from './supabaseAuth';

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
  hobby: {
    automationsPerDay: 10,
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
  free: {
    automationsPerDay: 10,
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

export interface SubscriptionState {
  isLoading: boolean;
  error: string | null;
  subscription: Subscription | null;
  currentPlan: PricingPlan | null;
}

class SubscriptionService {
  private static instance: SubscriptionService;
  private listeners: Set<(state: SubscriptionState) => void> = new Set();
  private state: SubscriptionState = {
    isLoading: false,
    error: null,
    subscription: null,
    currentPlan: null,
  };

  private constructor() {
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

  hasFeatureAccess(feature: keyof PlanFeatures): boolean {
    const tier = asPlanTier(this.state.subscription?.plan_tier);
    const features = PLAN_FEATURES[tier];
    return !!features[feature];
  }

  getState(): SubscriptionState {
    return { ...this.state };
  }

  onStateChange(listener: (state: SubscriptionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(updates: Partial<SubscriptionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

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
}

export const subscriptionService = SubscriptionService.getInstance();
