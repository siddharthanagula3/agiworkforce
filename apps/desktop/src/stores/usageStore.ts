/**
 * Usage Store (DEPRECATED)
 *
 * This store has been consolidated into billingUsage.ts
 * This file re-exports from the new location for backwards compatibility.
 *
 * @deprecated Use useBillingUsageStore from './billingUsage' instead
 */

export {
  useBillingUsageStore as useUsageStore,
  getUsagePercentage,
  getRemainingPercentage,
  initializeUsageStore,
} from './billingUsage';
