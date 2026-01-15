/**
 * Billing Store
 *
 * Manages billing state including customer info, subscription, and credits.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { StripeService, type CustomerInfo, type SubscriptionInfo } from '../services/stripe';
import { isSubscriptionActive, isInGracePeriod } from '../utils/featureGates';
import { supabaseAuth, type AuthState } from '../services/supabaseAuth';
import { asPlanTier } from '../lib/supabase';
import { useAccountStore } from './accountStore';

interface BillingState {
  customer: CustomerInfo | null;

  subscription: SubscriptionInfo | null;
  subscriptionLoading: boolean;

  initialized: boolean;

  error: string | null;

  // Credit tracking
  // `null` means credits not yet loaded (don't block on pre-flight check)
  // `0` means credits are confirmed to be zero (block on pre-flight check)
  creditBalance_cents: number | null;
  dailyUsage_cents: number | null;
  dailyLimit_cents: number | null;
  dailyResetAt: string | null;

  // Hydration tracking - set to true once persist middleware has finished loading
  _hasHydrated: boolean;
}

interface BillingActions {
  initialize: (stripeApiKey: string, webhookSecret: string) => Promise<void>;

  setCustomer: (customer: CustomerInfo | null) => void;
  fetchCustomerByEmail: (email: string) => Promise<CustomerInfo | null>;

  setSubscription: (subscription: SubscriptionInfo | null) => void;
  fetchActiveSubscription: (customerId: string) => Promise<void>;

  isActive: () => boolean;
  isInGracePeriod: () => boolean;
  getCurrentPlan: () => string;
  updateCredits: (info: {
    remaining_cents: number;
    daily_used?: number;
    daily_limit?: number;
    daily_reset_at?: string;
  }) => void;

  setError: (error: string | null) => void;
  clearError: () => void;

  // Hydration setter for persist middleware callback
  setHasHydrated: (state: boolean) => void;
}

type BillingStore = BillingState & BillingActions;

// Storage fallback for SSR/non-browser environments
const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
const BILLING_STORE_VERSION = 1;

export const useBillingStore = create<BillingStore>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        customer: null,
        subscription: null,
        subscriptionLoading: false,
        initialized: false,
        error: null,
        // Initialize to null to indicate "not yet loaded" vs "confirmed zero"
        creditBalance_cents: null,
        dailyUsage_cents: null,
        dailyLimit_cents: null,
        dailyResetAt: null,
        _hasHydrated: false,

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

        updateCredits: (info) => {
          set({
            creditBalance_cents: info.remaining_cents,
            dailyUsage_cents: info.daily_used ?? get().dailyUsage_cents ?? 0,
            dailyLimit_cents: info.daily_limit ?? get().dailyLimit_cents ?? 0,
            dailyResetAt: info.daily_reset_at ?? get().dailyResetAt,
          });
        },

        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state });
        },
      })),
      {
        name: 'billing-storage',
        version: BILLING_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          customer: state.customer,
          subscription: state.subscription,
          // Note: `initialized` is intentionally NOT persisted - it must be false on cold start
          // to ensure proper re-initialization of the Stripe service
          creditBalance_cents: state.creditBalance_cents, // Persist credits for offline/restart continuity
          // Note: _hasHydrated is NOT persisted - it's set by onRehydrateStorage callback
        }),
        onRehydrateStorage: () => (state) => {
          // Mark that hydration is complete
          if (state) {
            state.setHasHydrated(true);
          }
        },
        migrate: (persistedState: unknown, version: number) => {
          // Migration logic for future schema changes
          if (version === 0) {
            return persistedState as BillingStore;
          }
          return persistedState as BillingStore;
        },
      },
    ),
    { name: 'BillingStore', enabled: import.meta.env.DEV },
  ),
);

export function initializeBillingStore(): () => void {
  const unsubscribe = supabaseAuth.onAuthStateChange((authState: AuthState) => {
    const store = useBillingStore.getState();

    if (authState.user && authState.session) {
      const customerInfo: CustomerInfo = {
        id: authState.user.id,
        stripe_customer_id: authState.subscription?.stripe_customer_id || '',
        email: authState.user.email || '',
        name: authState.profile?.display_name || undefined,
        created_at: Math.floor(new Date(authState.user.created_at).getTime() / 1000),
        updated_at: Date.now() / 1000,
      };
      store.setCustomer(customerInfo);

      if (authState.subscription) {
        const sub = authState.subscription;
        const planTier = asPlanTier(sub.plan_tier);

        const subscriptionInfo: SubscriptionInfo = {
          id: sub.stripe_subscription_id || `sub_${authState.user.id}`,
          customer_id: authState.user.id,
          stripe_subscription_id: sub.stripe_subscription_id || '',
          stripe_price_id: sub.stripe_price_id || '',
          plan_name: planTier,
          billing_interval: 'monthly',
          status: sub.status || 'none',
          current_period_start: sub.current_period_start
            ? Math.floor(new Date(sub.current_period_start).getTime() / 1000)
            : 0,
          current_period_end: sub.current_period_end
            ? Math.floor(new Date(sub.current_period_end).getTime() / 1000)
            : 0,
          cancel_at_period_end: sub.cancel_at_period_end || false,
          cancel_at: undefined,
          canceled_at: sub.canceled_at
            ? Math.floor(new Date(sub.canceled_at).getTime() / 1000)
            : undefined,
          amount: 0,
          currency: 'usd',
          created_at: Math.floor(new Date(sub.created_at || new Date()).getTime() / 1000),
          updated_at: Math.floor(new Date(sub.updated_at || new Date()).getTime() / 1000),
        };
        store.setSubscription(subscriptionInfo);
      } else {
        store.setSubscription(null);
      }

      // Sync credits from account store if available
      // This ensures credits fetched via /api/me are reflected in billing store
      const accountState = useAccountStore.getState();
      if (accountState.account?.credits) {
        const credits = accountState.account.credits;
        store.updateCredits({
          remaining_cents: credits.remaining_cents ?? 0,
          daily_used: credits.daily_used_cents,
          daily_limit: credits.daily_limit_cents,
          daily_reset_at: credits.daily_reset_at,
        });
        console.log('[BillingStore] Synced credits from account store:', credits);
      }
    } else if (!authState.user && !authState.isLoading) {
      store.setCustomer(null);
      store.setSubscription(null);
      // Reset credits to null when user logs out (not 0, since 0 would block messages)
      useBillingStore.setState({
        creditBalance_cents: null,
        dailyUsage_cents: null,
        dailyLimit_cents: null,
        dailyResetAt: null,
      });
    }
  });

  return unsubscribe;
}

// Selectors for optimized component subscriptions
export const selectCustomer = (state: BillingStore) => state.customer;
export const selectSubscription = (state: BillingStore) => state.subscription;
export const selectCreditBalance = (state: BillingStore) => state.creditBalance_cents;
export const selectIsHydrated = (state: BillingStore) => state._hasHydrated;

/**
 * Wait for billing store to be hydrated from localStorage.
 * Use this before accessing billing state in async initialization code.
 */
export function waitForBillingHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useBillingStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useBillingStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}
