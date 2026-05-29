import {
  type PricingPlan,
  type Subscription,
  type PlanTier,
  asPlanTier,
} from '../lib/cloudAccountTypes';
import { cloudAccountAuth } from './cloudAccountAuth';
import { WEB_APP_URL } from '../api/config';

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
  'local-only': {
    automationsPerDay: 'unlimited',
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
  byok: {
    automationsPerDay: 'unlimited',
    browserAutomation: false,
    advancedUiAutomation: false,
    emailSupport: false,
    prioritySupport: false,
    teamFeatures: false,
    sso: false,
    customWorkflows: false,
    webhookIntegration: false,
    analytics: false,
    llmCostTracking: true,
  },
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
  pro_plus: {
    automationsPerDay: 'unlimited',
    browserAutomation: true,
    advancedUiAutomation: true,
    emailSupport: true,
    prioritySupport: true,
    teamFeatures: false,
    sso: false,
    customWorkflows: true,
    webhookIntegration: false,
    analytics: true,
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
    cloudAccountAuth.onAuthStateChange((authState) => {
      this.updateState({
        subscription: authState.subscription,
        currentPlan: authState.subscription
          ? this.planFromSubscription(authState.subscription)
          : null,
      });
    });
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  private planFromSubscription(subscription: Subscription): PricingPlan {
    const tier = asPlanTier(subscription.plan_tier);
    const now = new Date().toISOString();
    return {
      id: `plan-${tier}`,
      tier,
      name: tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      price_cents: 0,
      currency: 'usd',
      interval: 'month',
      stripe_product_id: null,
      stripe_price_id: subscription.stripe_price_id,
      features: PLAN_FEATURES[tier],
      is_active: true,
      created_at: now,
      updated_at: now,
    };
  }

  async getSubscription(): Promise<Subscription | null> {
    await cloudAccountAuth.refreshUserData();
    const subscription = cloudAccountAuth.getState().subscription;
    this.updateState({
      subscription,
      currentPlan: subscription ? this.planFromSubscription(subscription) : null,
    });
    return subscription;
  }

  hasFeatureAccess(feature: keyof PlanFeatures): boolean {
    const tier = asPlanTier(this.state.subscription?.plan_tier);
    return !!PLAN_FEATURES[tier][feature];
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
    const session = cloudAccountAuth.getSession();
    if (!session?.access_token) return;

    try {
      const headers = await this.csrfHeaders();
      const amountCents =
        typeof metadata['amount_cents'] === 'number' ? (metadata['amount_cents'] as number) : 0;
      await fetch(`${WEB_APP_URL}/api/usage/deduct`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...headers,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount_cents: amountCents,
          description: eventType,
          metadata: { ...metadata, quantity },
        }),
      });
    } catch (error) {
      console.warn('[Subscription] Usage tracking skipped:', error);
    }
  }

  private async csrfHeaders(): Promise<Record<string, string>> {
    const response = await fetch(`${WEB_APP_URL}/api/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    }
    const data = (await response.json()) as { token?: string; csrfToken?: string };
    const token = data.token ?? data.csrfToken;
    if (!token) throw new Error('Missing CSRF token');
    return {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      'X-Requested-With': 'agiworkforce-desktop',
    };
  }
}

export const subscriptionService = SubscriptionService.getInstance();
