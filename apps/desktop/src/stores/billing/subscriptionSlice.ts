import { invoke } from '../../lib/tauri-mock';
import { toast } from 'sonner';

export interface RustPricingPlan {
  id: string;
  tier: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly_usd: number;
  price_annual_usd: number;
  features: string[];
  limits: Record<string, unknown>;
  is_popular: boolean;
  is_available: boolean;
}

export interface RustSubscriptionInfo {
  stripe_subscription_id: string;
  plan_name: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
}

export interface SubscriptionSliceState {
  pricingPlans: RustPricingPlan[];
  currentPlan: RustPricingPlan | null;
  isLoadingPlans: boolean;
  subscriptionError: string | null;
}

export interface SubscriptionSliceActions {
  fetchPricingPlans: () => Promise<RustPricingPlan[]>;
  fetchCurrentPlan: (userId: string) => Promise<RustPricingPlan | null>;
  subscribeToPlan: (
    userId: string,
    planId: string,
    billingInterval?: string,
  ) => Promise<RustSubscriptionInfo | null>;
  upgradePlan: (userId: string, newPlanId: string) => Promise<RustSubscriptionInfo | null>;
  cancelPlanSubscription: (userId: string, subscriptionId: string) => Promise<boolean>;
}

export type SubscriptionSlice = SubscriptionSliceState & SubscriptionSliceActions;

export const createSubscriptionSlice = (
  set: (
    partial: Partial<SubscriptionSlice> | ((s: SubscriptionSlice) => Partial<SubscriptionSlice>),
  ) => void,
  get: () => SubscriptionSlice,
): SubscriptionSlice => ({
  pricingPlans: [],
  currentPlan: null,
  isLoadingPlans: false,
  subscriptionError: null,

  fetchPricingPlans: async () => {
    set({ isLoadingPlans: true, subscriptionError: null });
    try {
      const plans = await invoke<RustPricingPlan[]>('get_pricing_plans');
      set({ pricingPlans: plans, isLoadingPlans: false });
      return plans;
    } catch (error) {
      console.error('Failed to fetch pricing plans:', error);
      set({ isLoadingPlans: false, subscriptionError: String(error) });
      return [];
    }
  },

  fetchCurrentPlan: async (userId: string) => {
    if (!userId?.trim()) {
      toast.error('User ID is required to fetch current plan');
      return null;
    }
    set({ isLoadingPlans: true, subscriptionError: null });
    try {
      const plan = await invoke<RustPricingPlan>('get_current_plan', { userId });
      set({ currentPlan: plan, isLoadingPlans: false });
      return plan;
    } catch (error) {
      console.error('Failed to fetch current plan:', error);
      set({ isLoadingPlans: false, subscriptionError: String(error) });
      return null;
    }
  },

  subscribeToPlan: async (userId: string, planId: string, billingInterval?: string) => {
    if (!userId?.trim()) {
      toast.error('User ID is required to subscribe');
      return null;
    }
    if (!planId?.trim()) {
      toast.error('Plan ID is required to subscribe');
      return null;
    }
    set({ isLoadingPlans: true, subscriptionError: null });
    try {
      const sub = await invoke<RustSubscriptionInfo>('subscribe_to_plan', {
        userId,
        planId,
        billingInterval: billingInterval ?? null,
      });
      set({ isLoadingPlans: false });
      await get().fetchCurrentPlan(userId);
      return sub;
    } catch (error) {
      console.error('Failed to subscribe to plan:', error);
      set({ isLoadingPlans: false, subscriptionError: String(error) });
      return null;
    }
  },

  upgradePlan: async (userId: string, newPlanId: string) => {
    if (!userId?.trim()) {
      toast.error('User ID is required to upgrade plan');
      return null;
    }
    if (!newPlanId?.trim()) {
      toast.error('Plan ID is required to upgrade');
      return null;
    }
    set({ isLoadingPlans: true, subscriptionError: null });
    try {
      const sub = await invoke<RustSubscriptionInfo>('upgrade_plan', { userId, newPlanId });
      set({ isLoadingPlans: false });
      await get().fetchCurrentPlan(userId);
      return sub;
    } catch (error) {
      console.error('Failed to upgrade plan:', error);
      set({ isLoadingPlans: false, subscriptionError: String(error) });
      return null;
    }
  },

  cancelPlanSubscription: async (userId: string, subscriptionId: string) => {
    if (!userId?.trim()) {
      toast.error('User ID is required to cancel subscription');
      return false;
    }
    if (!subscriptionId?.trim()) {
      toast.error('Subscription ID is required to cancel');
      return false;
    }
    set({ isLoadingPlans: true, subscriptionError: null });
    try {
      await invoke('cancel_subscription', { userId, subscriptionId });
      set({ isLoadingPlans: false, currentPlan: null });
      return true;
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      set({ isLoadingPlans: false, subscriptionError: String(error) });
      return false;
    }
  },
});
