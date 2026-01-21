/**
 * Token Budget Store (DEPRECATED)
 *
 * This store has been consolidated into billingUsage.ts
 * This file re-exports from the new location for backwards compatibility.
 *
 * @deprecated Use useBillingUsageStore from './billingUsage' instead
 */

export {
  useBillingUsageStore as useTokenBudgetStore,
  selectBudget,
  selectActiveAlerts,
  selectBudgetPercentage,
  selectInputTokens,
  selectOutputTokens,
  selectEstimatedCost,
  selectTokenBreakdown,
  type BudgetPeriod,
  type TokenBudget,
  type BudgetAlert,
  type TokenUsageDetails,
} from './billingUsage';
