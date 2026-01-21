/**
 * Analytics Store (DEPRECATED)
 *
 * This store has been consolidated into billingUsage.ts
 * This file re-exports from the new location for backwards compatibility.
 *
 * @deprecated Use useBillingUsageStore from './billingUsage' instead
 */

export {
  useBillingUsageStore as useAnalyticsStore,
  startMetricsAutoRefresh,
  stopMetricsAutoRefresh,
} from './billingUsage';
