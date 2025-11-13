/**
 * Billing store - Manages subscription, customer, and invoice state
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { StripeService, type CustomerInfo, type SubscriptionInfo, type InvoiceInfo } from '../services/stripe';
import { isSubscriptionActive, isInGracePeriod } from '../utils/featureGates';

interface BillingState {
  // Customer info
  customer: CustomerInfo | null;

  // Subscription info
  subscription: SubscriptionInfo | null;
  subscriptionLoading: boolean;

  // Invoices
  invoices: InvoiceInfo[];
  invoicesLoading: boolean;

  // Billing portal
  portalUrl: string | null;

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
  createCustomer: (email: string, name?: string) => Promise<CustomerInfo>;
  getCustomerByEmail: (email: string) => Promise<CustomerInfo | null>;

  // Subscription actions
  setSubscription: (subscription: SubscriptionInfo | null) => void;
  createSubscription: (
    customerStripeId: string,
    priceId: string,
    planName: string,
    billingInterval: 'monthly' | 'yearly',
    trialDays?: number
  ) => Promise<SubscriptionInfo>;
  fetchSubscription: (stripeSubscriptionId: string) => Promise<void>;
  fetchActiveSubscription: (customerId: string) => Promise<void>;
  updateSubscription: (
    stripeSubscriptionId: string,
    newPriceId: string,
    newPlanName: string
  ) => Promise<SubscriptionInfo>;
  cancelSubscription: (stripeSubscriptionId: string) => Promise<void>;

  // Invoice actions
  fetchInvoices: (customerStripeId: string) => Promise<void>;

  // Portal actions
  createPortalSession: (customerStripeId: string, returnUrl: string) => Promise<string>;

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
        invoices: [],
        invoicesLoading: false,
        portalUrl: null,
        initialized: false,
        error: null,

        // Initialization
        initialize: async (stripeApiKey: string, webhookSecret: string) => {
          try {
            await StripeService.initialize(stripeApiKey, webhookSecret);
            set({ initialized: true, error: null });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to initialize billing';
            set({ error: errorMessage, initialized: false });
            throw error;
          }
        },

        // Customer actions
        setCustomer: (customer) => set({ customer }),

        createCustomer: async (email: string, name?: string) => {
          try {
            set({ error: null });
            const customer = await StripeService.createCustomer(email, name);
            set({ customer });
            return customer;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create customer';
            set({ error: errorMessage });
            throw error;
          }
        },

        getCustomerByEmail: async (email: string) => {
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

        createSubscription: async (
          customerStripeId: string,
          priceId: string,
          planName: string,
          billingInterval: 'monthly' | 'yearly',
          trialDays?: number
        ) => {
          try {
            set({ subscriptionLoading: true, error: null });
            const subscription = await StripeService.createSubscription(
              customerStripeId,
              priceId,
              planName,
              billingInterval,
              trialDays
            );
            set({ subscription, subscriptionLoading: false });
            return subscription;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        fetchSubscription: async (stripeSubscriptionId: string) => {
          try {
            set({ subscriptionLoading: true, error: null });
            const subscription = await StripeService.getSubscription(stripeSubscriptionId);
            set({ subscription, subscriptionLoading: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        fetchActiveSubscription: async (customerId: string) => {
          try {
            set({ subscriptionLoading: true, error: null });
            const subscription = await StripeService.getActiveSubscription(customerId);
            set({ subscription, subscriptionLoading: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch active subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        updateSubscription: async (
          stripeSubscriptionId: string,
          newPriceId: string,
          newPlanName: string
        ) => {
          try {
            set({ subscriptionLoading: true, error: null });
            const subscription = await StripeService.updateSubscription(
              stripeSubscriptionId,
              newPriceId,
              newPlanName
            );
            set({ subscription, subscriptionLoading: false });
            return subscription;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        cancelSubscription: async (stripeSubscriptionId: string) => {
          try {
            set({ subscriptionLoading: true, error: null });
            await StripeService.cancelSubscription(stripeSubscriptionId);

            // Update subscription status locally
            const { subscription } = get();
            if (subscription) {
              set({
                subscription: {
                  ...subscription,
                  status: 'canceled',
                  canceled_at: Math.floor(Date.now() / 1000),
                },
                subscriptionLoading: false,
              });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
            set({ error: errorMessage, subscriptionLoading: false });
            throw error;
          }
        },

        // Invoice actions
        fetchInvoices: async (customerStripeId: string) => {
          try {
            set({ invoicesLoading: true, error: null });
            const invoices = await StripeService.getInvoices(customerStripeId);
            set({ invoices, invoicesLoading: false });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch invoices';
            set({ error: errorMessage, invoicesLoading: false });
            throw error;
          }
        },

        // Portal actions
        createPortalSession: async (customerStripeId: string, returnUrl: string) => {
          try {
            set({ error: null });
            const portalUrl = await StripeService.createPortalSession(customerStripeId, returnUrl);
            set({ portalUrl });
            return portalUrl;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create portal session';
            set({ error: errorMessage });
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
      }
    ),
    { name: 'BillingStore' }
  )
);
