import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

import { createCostSlice } from './billing/costSlice';
import type { CostSlice } from './billing/costSlice';

export {
  creditsFromProviderUsd,
  formatProviderCostCredits,
  providerUsdFromCredits,
} from './billing/costSlice';

type BillingUsageStore = CostSlice;

export const useBillingUsageStore = create<BillingUsageStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...createCostSlice(set as Parameters<typeof createCostSlice>[0], get as () => CostSlice),
    })),
    { name: 'BillingUsageStore', enabled: import.meta.env.DEV },
  ),
);

export const selectCostAnalytics = (state: BillingUsageStore) => state.costAnalytics;
