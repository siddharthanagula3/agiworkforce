/**
 * Billing store - Manages minimal subscription state for feature gating
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { StripeService, type CustomerInfo, type SubscriptionInfo } from '../services/stripe';
import { isSubscriptionActive, isInGracePeriod } from '../utils/featureGates';
import { supabaseAuth, type AuthState } from '../services/supabaseAuth';
import { asPlanTier } from '../lib/supabase';

interface BillingState {
  // Customer info
  customer: CustomerInfo | null;

  // Subscription info
  subscription: SubscriptionInfo | null;
  subscriptionLoading: boolean;

  // Initialization
  initialized: boolean;

  // Error state
  error: string | null;
}

interface BillingActions {
  // Initialization
  initialize: (stripeApiKey: string, webhookSecret: string) => Promise<void>;

  // Customer actions
  setCustomer: (customer: CustomerInfo | null) => void;
  fetchCustomerByEmail: (email: string) => Promise<CustomerInfo | null>;

  // Subscription actions
  setSubscription: (subscription: SubscriptionInfo | null) => void;
  fetchActiveSubscription: (customerId: string) => Promise<void>;

  // Computed properties
  isActive: () => boolean;
  isInGracePeriod: () => boolean;
  getCurrentPlan: () => string;

  // Error handling
  setError: (error: string | null) => void;
  clearError: () => void;
}

type BillingStore = BillingState & BillingActions;

export const useBillingStore = create<BillingStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        customer: null,
        subscription: null,
        subscriptionLoading: false,
        initialized: false,
        error: null,

        // Initialization
        initialize: async (stripeApiKey: string, webhookSecret: string) => {
          try {
            await StripeService.initialize(stripeApiKey, webhookSecret);
            set({ initialized: true, error: null });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to initialize billing';
            set({ error: errorMessage, initialized: false });
            throw error;
          }
        },

        // Customer actions
        setCustomer: (customer) => set({ customer }),

        fetchCustomerByEmail: async (email: string) => {
          try {
            set({ error: null });
            const customer = await StripeService.getCustomerByEmail(email);
            if (customer) {
              set({ customer });
            }
            return customer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get customer';
            set({ error: errorMessage });
            throw error;
          }
        },

        // Subscription actions
        setSubscription: (subscription) => set({ subscription }),

        fetchActiveSubscription: async (customerId: string) => {
          try {
            set({ subscriptionLoading: true, error: null });
            const subscription = await StripeService.getActiveSubscription(customerId);
            set({ subscription, subscriptionLoading: false });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to fetch active subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        // Computed properties
        isActive: () => {
          const { subscription } = get();
          return isSubscriptionActive(subscription);
        },

        isInGracePeriod: () => {
          const { subscription } = get();
          return isInGracePeriod(subscription);
        },

        getCurrentPlan: () => {
          const { subscription } = get();
          return subscription?.plan_name || 'free';
        },

        // Error handling
        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),
      }),
      {
        name: 'billing-storage',
        partialize: (state) => ({
          customer: state.customer,
          subscription: state.subscription,
          initialized: state.initialized,
        }),
      },
    ),
    { name: 'BillingStore' },
  ),
);

/**
 * Initialize billing store with Supabase Auth listener
 * This ensures billing state is synced with authenticated user
 */
export function initializeBillingStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange((authState: AuthState) => {
    const store = useBillingStore.getState();

    if (authState.user && authState.session) {
      // Sync customer info from profile/user
      const customerInfo: CustomerInfo = {
        id: authState.user.id,
        stripe_customer_id: authState.subscription?.stripe_customer_id || '',
        email: authState.user.email || '',
        name: authState.profile?.display_name || undefined,
        created_at: Math.floor(new Date(authState.user.created_at).getTime() / 1000),
        updated_at: Date.now() / 1000,
      };
      store.setCustomer(customerInfo);

      // Sync subscription info
      if (authState.subscription) {
        const sub = authState.subscription;
        const planTier = asPlanTier(sub.plan_tier);

        const subscriptionInfo: SubscriptionInfo = {
          id: sub.stripe_subscription_id || `sub_${authState.user.id}`, // Fallback ID
          customer_id: authState.user.id,
          stripe_subscription_id: sub.stripe_subscription_id || '',
          stripe_price_id: sub.stripe_price_id || '',
          plan_name: planTier,
          billing_interval: 'monthly', // Default or infer if available
          status: sub.status || 'none',
          current_period_start: sub.current_period_start
            ? Math.floor(new Date(sub.current_period_start).getTime() / 1000)
            : 0,
          current_period_end: sub.current_period_end
            ? Math.floor(new Date(sub.current_period_end).getTime() / 1000)
            : 0,
          cancel_at_period_end: sub.cancel_at_period_end || false,
          cancel_at: undefined, // Supabase doesn't have a distinct future cancel date field usually different from period end
          canceled_at: sub.canceled_at
            ? Math.floor(new Date(sub.canceled_at).getTime() / 1000)
            : undefined,
          amount: 0, // Not stored in Supabase subscription table currently
          currency: 'usd',
          created_at: Math.floor(new Date(sub.created_at || new Date()).getTime() / 1000),
          updated_at: Math.floor(new Date(sub.updated_at || new Date()).getTime() / 1000),
        };
        store.setSubscription(subscriptionInfo);
      } else {
        store.setSubscription(null);
      }
    } else if (!authState.user && !authState.isLoading) {
      // User signed out
      store.setCustomer(null);
      store.setSubscription(null);
    }
  });

  return unsubscribe;
}
