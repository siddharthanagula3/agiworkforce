/**
 * Billing Store
 *
 * Handles subscription plan, credits, Stripe data, and feature flags.
 * Extracted from the unified auth.ts god store.
 *
 * Consumers should prefer importing from this store directly when only
 * billing/subscription data is needed.
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';
import { StripeService, type CustomerInfo, type SubscriptionInfo } from '../services/stripe';
import { subscriptionService, type PlanFeatures } from '../services/subscriptionService';
import { isSubscriptionActive, isInGracePeriod } from '../utils/featureGates';
import { type PlanTier, asPlanTier, PLAN_DISPLAY_NAMES } from '../lib/supabase';

// Re-export for backwards compatibility
export type { PlanTier } from '../lib/supabase';
export type { CustomerInfo, SubscriptionInfo } from '../services/stripe';

// =============================================================================
// Types
// =============================================================================

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export type SubscriptionFetchStatus = 'idle' | 'fetching' | 'succeeded' | 'failed';

export interface CreditBalance {
  account_id?: string;
  period_start?: string;
  period_end?: string;
  allocated_cents?: number;
  used_cents?: number;
  remaining_cents?: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  daily_reset_at?: string;
}

// =============================================================================
// State & Actions
// =============================================================================

interface BillingState {
  // Subscription / Plan
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  isPro: boolean;
  isEnterprise: boolean;
  featureFlags: Record<string, boolean>;

  // Stripe
  stripeCustomerId: string | null;
  stripeCustomer: CustomerInfo | null;
  stripeSubscription: SubscriptionInfo | null;
  stripeInitialized: boolean;

  // Credits
  credits: CreditBalance | null;
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;

  // Device linking tokens
  accessToken: string | null;
  refreshToken: string | null;
  deviceLinkId: string | null;
  deviceLinkCode: string | null;

  // Metadata
  lastSyncedAt: number | null;

  // Error
  error: string | null;
}

interface BillingActions {
  setPlan: (plan: PlanTier) => void;
  setFeatureFlag: (flag: string, enabled: boolean) => void;
  simulatePlan: (plan: PlanTier) => void;

  initializeStripe: (stripeApiKey: string, webhookSecret: string) => Promise<void>;
  setStripeCustomer: (customer: CustomerInfo | null) => void;
  fetchCustomerByEmail: (email: string) => Promise<CustomerInfo | null>;
  setStripeSubscription: (subscription: SubscriptionInfo | null) => void;
  fetchActiveSubscription: (customerId: string) => Promise<void>;
  isSubscriptionActive: () => boolean;
  isInGracePeriod: () => boolean;
  getCurrentPlan: () => string;

  updateCredits: (info: {
    remaining_cents: number;
    daily_used?: number;
    daily_limit?: number;
    daily_reset_at?: string;
  }) => void;

  setError: (error: string | null) => void;
  reset: () => void;
}

type BillingStoreType = BillingState & BillingActions;

// =============================================================================
// Subscription cache
// =============================================================================

const SUBSCRIPTION_CACHE_KEY = 'agiworkforce_subscription_cache_billing';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SubscriptionCache {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  fetchedAt: number;
  userId: string;
}

export function getBillingCachedSubscription(userId: string): SubscriptionCache | null {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as SubscriptionCache;
    if (data.userId === userId && Date.now() - data.fetchedAt < SUBSCRIPTION_CACHE_MAX_AGE_MS) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function setBillingCachedSubscription(
  userId: string,
  planTier: PlanTier,
  subscriptionStatus: SubscriptionStatus,
): void {
  try {
    const cache: SubscriptionCache = {
      planTier,
      subscriptionStatus,
      fetchedAt: Date.now(),
      userId,
    };
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

export function clearBillingCachedSubscription(): void {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
  } catch {
    // ignore
  }
}

// =============================================================================
// Default state
// =============================================================================

function getDefaultBillingState(): BillingState {
  const devPlan = import.meta.env.VITE_DEV_ACCOUNT_PLAN as PlanTier | undefined;
  const plan: PlanTier | null = devPlan || null;

  return {
    plan,
    planDisplayName: plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading...',
    subscriptionStatus: 'none',
    subscriptionFetchStatus: 'idle',
    currentPeriodEnd: null,
    isPro: false,
    isEnterprise: false,
    featureFlags: {},
    stripeCustomerId: null,
    stripeCustomer: null,
    stripeSubscription: null,
    stripeInitialized: false,
    credits: null,
    creditBalance_cents: null,
    dailyUsage_cents: null,
    dailyLimit_cents: null,
    dailyResetAt: null,
    accessToken: null,
    refreshToken: null,
    deviceLinkId: null,
    deviceLinkCode: null,
    lastSyncedAt: null,
    error: null,
  };
}

// =============================================================================
// Store
// =============================================================================

export const useBillingCoreStore = create<BillingStoreType>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        ...getDefaultBillingState(),

        setPlan: (plan) => {
          set(
            {
              plan,
              planDisplayName: PLAN_DISPLAY_NAMES[plan],
              subscriptionStatus: plan === 'free' ? 'none' : 'active',
              isPro: plan === 'hobby' || plan === 'pro' || plan === 'max' || plan === 'enterprise',
              isEnterprise: plan === 'enterprise',
            },
            undefined,
            'billing/setPlan',
          );
        },

        setFeatureFlag: (flag, enabled) => {
          set(
            (state) => ({ featureFlags: { ...state.featureFlags, [flag]: enabled } }),
            undefined,
            'billing/setFeatureFlag',
          );
        },

        simulatePlan: (plan) => {
          get().setPlan(plan);
        },

        initializeStripe: async (stripeApiKey, webhookSecret) => {
          try {
            await StripeService.initialize(stripeApiKey, webhookSecret);
            set({ stripeInitialized: true, error: null }, undefined, 'billing/initStripe/success');
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to initialize billing';
            set(
              { error: errorMessage, stripeInitialized: false },
              undefined,
              'billing/initStripe/error',
            );
            throw error;
          }
        },

        setStripeCustomer: (customer) => {
          set({ stripeCustomer: customer }, undefined, 'billing/setStripeCustomer');
        },

        fetchCustomerByEmail: async (email) => {
          try {
            set({ error: null }, undefined, 'billing/fetchCustomer/start');
            const customer = await StripeService.getCustomerByEmail(email);
            if (customer) {
              set({ stripeCustomer: customer }, undefined, 'billing/fetchCustomer/success');
            }
            return customer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get customer';
            set({ error: errorMessage }, undefined, 'billing/fetchCustomer/error');
            throw error;
          }
        },

        setStripeSubscription: (subscription) => {
          set({ stripeSubscription: subscription }, undefined, 'billing/setStripeSubscription');
        },

        fetchActiveSubscription: async (customerId) => {
          try {
            set(
              { subscriptionFetchStatus: 'fetching', error: null },
              undefined,
              'billing/fetchActiveSub/start',
            );
            const subscription = await StripeService.getActiveSubscription(customerId);
            set(
              { stripeSubscription: subscription, subscriptionFetchStatus: 'succeeded' },
              undefined,
              'billing/fetchActiveSub/success',
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to fetch active subscription';
            set(
              { error: errorMessage, subscriptionFetchStatus: 'failed' },
              undefined,
              'billing/fetchActiveSub/error',
            );
            throw error;
          }
        },

        isSubscriptionActive: () => {
          return isSubscriptionActive(get().stripeSubscription);
        },

        isInGracePeriod: () => {
          return isInGracePeriod(get().stripeSubscription);
        },

        getCurrentPlan: () => {
          const { stripeSubscription, plan } = get();
          return stripeSubscription?.plan_name || plan || 'free';
        },

        updateCredits: (info) => {
          set(
            (state) => ({
              creditBalance_cents: info.remaining_cents,
              dailyUsage_cents: info.daily_used ?? state.dailyUsage_cents ?? 0,
              dailyLimit_cents: info.daily_limit ?? state.dailyLimit_cents ?? 0,
              dailyResetAt: info.daily_reset_at ?? state.dailyResetAt,
              credits: {
                ...state.credits,
                remaining_cents: info.remaining_cents,
                daily_used_cents: info.daily_used,
                daily_limit_cents: info.daily_limit,
                daily_reset_at: info.daily_reset_at,
              },
            }),
            undefined,
            'billing/updateCredits',
          );
        },

        setError: (error) => set({ error }, undefined, 'billing/setError'),

        reset: () => {
          clearBillingCachedSubscription();
          set(getDefaultBillingState(), undefined, 'billing/reset');
        },
      })),
      {
        name: 'billing-core-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          creditBalance_cents: state.creditBalance_cents,
        }),
        onRehydrateStorage: () => () => {
          // No-op; billing data is always fetched fresh from backend
        },
      },
    ),
    { name: 'BillingCoreStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectBillingPlan = (state: BillingStoreType) => state.plan;
export const selectBillingPlanDisplayName = (state: BillingStoreType) => state.planDisplayName;
export const selectBillingSubscriptionStatus = (state: BillingStoreType) =>
  state.subscriptionStatus;
export const selectBillingSubscriptionFetchStatus = (state: BillingStoreType) =>
  state.subscriptionFetchStatus;
export const selectBillingIsPro = (state: BillingStoreType) => state.isPro;
export const selectBillingIsEnterprise = (state: BillingStoreType) => state.isEnterprise;
export const selectBillingFeatureFlags = (state: BillingStoreType) => state.featureFlags;
export const selectBillingStripeCustomer = (state: BillingStoreType) => state.stripeCustomer;
export const selectBillingStripeSubscription = (state: BillingStoreType) =>
  state.stripeSubscription;
export const selectBillingCreditBalance = (state: BillingStoreType) => state.creditBalance_cents;
export const selectBillingCredits = (state: BillingStoreType) => state.credits;
export const selectBillingIsTierLoading = (state: BillingStoreType) =>
  state.plan === null || state.subscriptionFetchStatus === 'fetching';

// =============================================================================
// Feature gate helper
// =============================================================================

export function hasBillingFeature(featureKey: string): boolean {
  const { featureFlags, isPro, isEnterprise } = useBillingCoreStore.getState();

  if (featureFlags[featureKey] !== undefined) {
    return featureFlags[featureKey]!;
  }

  const featureMap: Record<string, keyof PlanFeatures> = {
    browser_automation: 'browserAutomation',
    advanced_ui_automation: 'advancedUiAutomation',
    email_support: 'emailSupport',
    llm_cost_tracking: 'llmCostTracking',
    team_features: 'teamFeatures',
    sso: 'sso',
    priority_support: 'prioritySupport',
    custom_workflows: 'customWorkflows',
    webhook_integration: 'webhookIntegration',
    analytics: 'analytics',
  };

  const mappedFeature = featureMap[featureKey];
  if (mappedFeature) {
    return subscriptionService.hasFeatureAccess(mappedFeature);
  }

  const proFeatures = [
    'unlimited_automations',
    'browser_automation',
    'advanced_ui_automation',
    'email_support',
    'llm_cost_tracking',
  ];

  const enterpriseFeatures = [
    'team_features',
    'sso',
    'priority_support',
    'custom_workflows',
    'webhook_integration',
    'analytics',
  ];

  if (enterpriseFeatures.includes(featureKey)) return isEnterprise;
  if (proFeatures.includes(featureKey)) return isPro || isEnterprise;
  return true;
}

export function getBillingPlanDescription(plan: PlanTier): string {
  const descriptions: Record<PlanTier, string> = {
    hobby:
      'Perfect for getting started; 3-month free trial with BETATESTER code; $1/mo cloud credits; $10/month',
    free: 'Limited automations; Community support',
    pro: 'Unlimited automations; Priority support',
    max: 'Maximum performance; $250/mo credits; Dedicated support',
    enterprise: 'Custom solutions; Dedicated support; SSO',
  };
  return descriptions[plan];
}

// Sync billing data from a raw syncWithBackend result
export function applyBillingSyncResult(data: {
  plan: PlanTier | null;
  planDisplayName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionFetchStatus: SubscriptionFetchStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  featureFlags: Record<string, boolean>;
  credits: CreditBalance | null;
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;
  lastSyncedAt: number;
  isPro: boolean;
  isEnterprise: boolean;
}): void {
  useBillingCoreStore.setState(
    {
      plan: data.plan,
      planDisplayName: data.planDisplayName,
      subscriptionStatus: data.subscriptionStatus,
      subscriptionFetchStatus: data.subscriptionFetchStatus,
      currentPeriodEnd: data.currentPeriodEnd,
      stripeCustomerId: data.stripeCustomerId,
      featureFlags: data.featureFlags,
      credits: data.credits,
      creditBalance_cents: data.creditBalance_cents,
      dailyUsage_cents: data.dailyUsage_cents,
      dailyLimit_cents: data.dailyLimit_cents,
      dailyResetAt: data.dailyResetAt,
      lastSyncedAt: data.lastSyncedAt,
      isPro: data.isPro,
      isEnterprise: data.isEnterprise,
    },
    undefined,
    'billing/applySyncResult',
  );
}

export function waitForBillingHydration(): Promise<void> {
  // Billing data is always fetched fresh, so resolve immediately
  return Promise.resolve();
}

// Use asPlanTier from supabase lib — re-export for convenience
export { asPlanTier };
