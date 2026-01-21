/**
 * Account Store (Legacy - Re-exports from unified auth store)
 *
 * This file is kept for backwards compatibility.
 * All functionality has been consolidated into ./auth.ts
 *
 * @deprecated Import from './auth' instead
 */

export {
  // Store hook
  useAccountStore,
  // Initialization
  initializeAccountStore,
  // Selectors
  selectAccount,
  selectPlan,
  selectPlanDisplayName,
  selectSubscriptionFetchStatus,
  selectIsAuthenticated,
  selectIsPro,
  selectIsEnterprise,
  selectDisplayName,
  selectEmail,
  selectAvatar,
  selectFeatureFlags,
  selectIsTierLoading,
  // Helpers
  waitForHydration,
  hasFeature,
  getPlanDescription,
  cleanupAccountStore,
  // Types
  type PlanTier,
  type SubscriptionStatus,
  type SubscriptionFetchStatus,
  type CreditBalance,
  type DesktopAccount,
} from './auth';
