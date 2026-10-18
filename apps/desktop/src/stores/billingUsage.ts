import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

import { createCostSlice } from './billing/costSlice';
import type { CostSlice } from './billing/costSlice';

export {
  creditsFromProviderUsd,
  formatProviderCostCredits,
  providerUsdFromCredits,
} from './billing/costSlice';

import { createAnalyticsSlice } from './billing/analyticsSlice';
import type { AnalyticsSlice } from './billing/analyticsSlice';

type BillingUsageStore = CostSlice & AnalyticsSlice;

export const useBillingUsageStore = create<BillingUsageStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...createCostSlice(set as Parameters<typeof createCostSlice>[0], get as () => CostSlice),
      ...createAnalyticsSlice(set as Parameters<typeof createAnalyticsSlice>[0]),
    })),
    { name: 'BillingUsageStore', enabled: import.meta.env.DEV },
  ),
);

export const selectCostOverview = (state: BillingUsageStore) => state.costOverview;
export const selectCostAnalytics = (state: BillingUsageStore) => state.costAnalytics;
export const selectCostFilters = (state: BillingUsageStore) => state.costFilters;
export const selectCostLoading = (state: BillingUsageStore) =>
  state.loadingCostOverview || state.loadingCostAnalytics;
export const selectCostError = (state: BillingUsageStore) => state.costError;
