/**
 * Billing Store (Legacy - Re-exports from unified auth store)
 *
 * This file is kept for backwards compatibility.
 * All functionality has been consolidated into ./auth.ts
 *
 * @deprecated Import from './auth' instead
 */

export {
  // Store hook
  useBillingStore,
  // Initialization
  initializeBillingStore,
  // Selectors
  selectCustomer,
  selectSubscription,
  selectCreditBalance,
  selectIsHydrated,
  selectStripeCustomer,
  selectStripeSubscription,
  // Helpers
  waitForBillingHydration,
  // Types
  type CustomerInfo,
  type SubscriptionInfo,
} from './auth';
