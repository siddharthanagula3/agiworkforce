import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { immer } from 'zustand/middleware/immer';
import type {
  PricingPlan,
  UsageSummary,
  BillableEvent,
  Invoice,
  CurrentBill,
  ROIGuarantee,
  PlanChangeEstimate,
  CostEstimate,
} from '../types/pricing';

interface PricingState {
  // Plans
  plans: PricingPlan[];
  currentPlan: PricingPlan | null;
  plansLoading: boolean;

  // Usage
  currentUsage: UsageSummary | null;
  billableEvents: BillableEvent[];
  projectedCost: number;
  usageLoading: boolean;

  // Invoices
  invoices: Invoice[];
  currentBill: CurrentBill | null;
  selectedInvoice: Invoice | null;
  invoicesLoading: boolean;

  // ROI Guarantee
  roiGuarantee: ROIGuarantee | null;
  roiLoading: boolean;

  // Cost Estimate
  costEstimate: CostEstimate | null;

  // UI State
  error: string | null;
  isPlanChangeModalOpen: boolean;
  isInvoiceDetailModalOpen: boolean;
  planChangeEstimate: PlanChangeEstimate | null;

  // Actions - Plans
  fetchPlans: () => Promise<void>;
  fetchCurrentPlan: (userId: string) => Promise<void>;
  subscribeToPlan: (planId: string, userId: string) => Promise<void>;
  upgradePlan: (planId: string, userId: string) => Promise<void>;
  cancelSubscription: (userId: string) => Promise<void>;
  getPlanChangeEstimate: (newPlanId: string, userId: string) => Promise<void>;

  // Actions - Usage
  fetchUsage: (userId: string) => Promise<void>;
  fetchBillableEvents: (userId: string, limit?: number) => Promise<void>;
  calculateProjectedCost: (userId: string) => Promise<void>;

  // Actions - Invoices
  fetchInvoices: (userId: string) => Promise<void>;
  fetchCurrentBill: (userId: string) => Promise<void>;
  selectInvoice: (invoice: Invoice | null) => void;
  downloadInvoice: (invoiceId: string) => Promise<void>;

  // Actions - ROI Guarantee
  fetchROIGuarantee: (subscriptionId: string) => Promise<void>;

  // Actions - Cost Estimate
  calculateEstimate: (hoursPerMonth: number, hourlyRate: number) => CostEstimate;

  // UI Actions
  setError: (error: string | null) => void;
  openPlanChangeModal: () => void;
  closePlanChangeModal: () => void;
  openInvoiceDetailModal: () => void;
  closeInvoiceDetailModal: () => void;
  reset: () => void;
}

export const usePricingStore = create<PricingState>()(
  immer((set, get) => ({
    // Initial State
    plans: [],
    currentPlan: null,
    plansLoading: false,
    currentUsage: null,
    billableEvents: [],
    projectedCost: 0,
    usageLoading: false,
    invoices: [],
    currentBill: null,
    selectedInvoice: null,
    invoicesLoading: false,
    roiGuarantee: null,
    roiLoading: false,
    costEstimate: null,
    error: null,
    isPlanChangeModalOpen: false,
    isInvoiceDetailModalOpen: false,
    planChangeEstimate: null,

    // Plans Actions
    fetchPlans: async () => {
      set({ plansLoading: true, error: null });
      try {
        const plans = await invoke<PricingPlan[]>('get_pricing_plans');
        set({ plans, plansLoading: false });
      } catch (error) {
        console.error('Failed to fetch pricing plans:', error);
        set({ error: String(error), plansLoading: false });
      }
    },

    fetchCurrentPlan: async (userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        const plan = await invoke<PricingPlan>('get_current_plan', { userId });
        set({ currentPlan: plan, plansLoading: false });
      } catch (error) {
        console.error('Failed to fetch current plan:', error);
        set({ error: String(error), plansLoading: false });
      }
    },

    subscribeToPlan: async (planId: string, userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        await invoke('subscribe_to_plan', { userId, planId });
        await get().fetchCurrentPlan(userId);
        set({ plansLoading: false });
      } catch (error) {
        console.error('Failed to subscribe to plan:', error);
        set({ error: String(error), plansLoading: false });
        throw error;
      }
    },

    upgradePlan: async (planId: string, userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        await invoke('upgrade_plan', { userId, newPlanId: planId });
        await get().fetchCurrentPlan(userId);
        set({ plansLoading: false, isPlanChangeModalOpen: false });
      } catch (error) {
        console.error('Failed to upgrade plan:', error);
        set({ error: String(error), plansLoading: false });
        throw error;
      }
    },

    cancelSubscription: async (userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        await invoke('cancel_subscription', { userId });
        await get().fetchCurrentPlan(userId);
        set({ plansLoading: false });
      } catch (error) {
        console.error('Failed to cancel subscription:', error);
        set({ error: String(error), plansLoading: false });
        throw error;
      }
    },

    getPlanChangeEstimate: async (newPlanId: string, userId: string) => {
      set({ plansLoading: true, error: null });
      try {
        const estimate = await invoke<PlanChangeEstimate>('get_plan_change_estimate', {
          userId,
          newPlanId,
        });
        set({ planChangeEstimate: estimate, plansLoading: false });
      } catch (error) {
        console.error('Failed to get plan change estimate:', error);
        set({ error: String(error), plansLoading: false });
        throw error;
      }
    },

    // Usage Actions
    fetchUsage: async (userId: string) => {
      set({ usageLoading: true, error: null });
      try {
        const usage = await invoke<UsageSummary>('get_usage_summary', {
          userId,
          period: 'current',
        });
        set({ currentUsage: usage, usageLoading: false });
      } catch (error) {
        console.error('Failed to fetch usage:', error);
        set({ error: String(error), usageLoading: false });
      }
    },

    fetchBillableEvents: async (userId: string, limit = 50) => {
      set({ usageLoading: true, error: null });
      try {
        const events = await invoke<BillableEvent[]>('get_billable_events', { userId, limit });
        set({ billableEvents: events, usageLoading: false });
      } catch (error) {
        console.error('Failed to fetch billable events:', error);
        set({ error: String(error), usageLoading: false });
      }
    },

    calculateProjectedCost: async (userId: string) => {
      set({ usageLoading: true, error: null });
      try {
        const cost = await invoke<number>('calculate_projected_cost', { userId });
        set({ projectedCost: cost, usageLoading: false });
      } catch (error) {
        console.error('Failed to calculate projected cost:', error);
        set({ error: String(error), usageLoading: false });
      }
    },

    // Invoices Actions
    fetchInvoices: async (userId: string) => {
      set({ invoicesLoading: true, error: null });
      try {
        const invoices = await invoke<Invoice[]>('get_invoices', { userId });
        set({ invoices, invoicesLoading: false });
      } catch (error) {
        console.error('Failed to fetch invoices:', error);
        set({ error: String(error), invoicesLoading: false });
      }
    },

    fetchCurrentBill: async (userId: string) => {
      set({ invoicesLoading: true, error: null });
      try {
        const bill = await invoke<CurrentBill>('get_current_bill', { userId });
        set({ currentBill: bill, invoicesLoading: false });
      } catch (error) {
        console.error('Failed to fetch current bill:', error);
        set({ error: String(error), invoicesLoading: false });
      }
    },

    selectInvoice: (invoice: Invoice | null) => {
      set({ selectedInvoice: invoice });
    },

    downloadInvoice: async (invoiceId: string) => {
      try {
        const pdfPath = await invoke<string>('download_invoice_pdf', { invoiceId });
        console.log('Invoice downloaded:', pdfPath);
        return;
      } catch (error) {
        console.error('Failed to download invoice:', error);
        set({ error: String(error) });
        throw error;
      }
    },

    // ROI Guarantee Actions
    fetchROIGuarantee: async (subscriptionId: string) => {
      set({ roiLoading: true, error: null });
      try {
        const guarantee = await invoke<ROIGuarantee>('get_roi_guarantee_status', {
          subscriptionId,
        });
        set({ roiGuarantee: guarantee, roiLoading: false });
      } catch (error) {
        console.error('Failed to fetch ROI guarantee:', error);
        set({ error: String(error), roiLoading: false });
      }
    },

    // Cost Estimate
    calculateEstimate: (hoursPerMonth: number, hourlyRate: number): CostEstimate => {
      const valueSaved = hoursPerMonth * hourlyRate;
      const planCost = 39; // Pro plan cost
      const netSavings = valueSaved - planCost;
      const roiMultiplier = planCost > 0 ? valueSaved / planCost : 0;

      const estimate: CostEstimate = {
        hours_per_month: hoursPerMonth,
        hourly_rate_usd: hourlyRate,
        value_saved_usd: valueSaved,
        plan_cost_usd: planCost,
        net_savings_usd: netSavings,
        roi_multiplier: roiMultiplier,
      };

      set({ costEstimate: estimate });
      return estimate;
    },

    // UI Actions
    setError: (error: string | null) => {
      set({ error });
    },

    openPlanChangeModal: () => {
      set({ isPlanChangeModalOpen: true });
    },

    closePlanChangeModal: () => {
      set({ isPlanChangeModalOpen: false, planChangeEstimate: null });
    },

    openInvoiceDetailModal: () => {
      set({ isInvoiceDetailModalOpen: true });
    },

    closeInvoiceDetailModal: () => {
      set({ isInvoiceDetailModalOpen: false, selectedInvoice: null });
    },

    reset: () => {
      set({
        plans: [],
        currentPlan: null,
        plansLoading: false,
        currentUsage: null,
        billableEvents: [],
        projectedCost: 0,
        usageLoading: false,
        invoices: [],
        currentBill: null,
        selectedInvoice: null,
        invoicesLoading: false,
        roiGuarantee: null,
        roiLoading: false,
        costEstimate: null,
        error: null,
        isPlanChangeModalOpen: false,
        isInvoiceDetailModalOpen: false,
        planChangeEstimate: null,
      });
    },
  })),
);

// ========================================
// SELECTORS
// ========================================

export const selectPlans = (state: PricingState) => state.plans;
export const selectCurrentPlan = (state: PricingState) => state.currentPlan;
export const selectPlansLoading = (state: PricingState) => state.plansLoading;
export const selectCurrentUsage = (state: PricingState) => state.currentUsage;
export const selectBillableEvents = (state: PricingState) => state.billableEvents;
export const selectProjectedCost = (state: PricingState) => state.projectedCost;
export const selectInvoices = (state: PricingState) => state.invoices;
export const selectCurrentBill = (state: PricingState) => state.currentBill;
export const selectSelectedInvoice = (state: PricingState) => state.selectedInvoice;
export const selectROIGuarantee = (state: PricingState) => state.roiGuarantee;
export const selectError = (state: PricingState) => state.error;
export const selectCostEstimate = (state: PricingState) => state.costEstimate;
