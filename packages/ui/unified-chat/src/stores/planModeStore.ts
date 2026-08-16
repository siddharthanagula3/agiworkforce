import { create } from 'zustand';

interface PlanModeState {
  planMode: boolean;
  pendingPlan: PlanProposal | null;

  setPlanMode: (active: boolean) => void;
  togglePlanMode: () => void;
  setPendingPlan: (plan: PlanProposal | null) => void;
  approvePlan: () => void;
  rejectPlan: () => void;
}

export interface PlanProposal {
  id: string;
  createdAt: string;
  steps: PlanStep[];
  summary: string;
  risks?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'completed';
}

export interface PlanStep {
  index: number;
  description: string;
  tool?: string;
  estimatedSeconds?: number;
}

export const usePlanModeStore = create<PlanModeState>()((set, get) => ({
  planMode: false,
  pendingPlan: null,

  setPlanMode: (active) => set({ planMode: active }),
  togglePlanMode: () => set({ planMode: !get().planMode }),
  setPendingPlan: (plan) => set({ pendingPlan: plan }),
  approvePlan: () => {
    const cur = get().pendingPlan;
    if (!cur) return;
    set({ pendingPlan: { ...cur, status: 'approved' } });
  },
  rejectPlan: () => {
    const cur = get().pendingPlan;
    if (!cur) return;
    set({ pendingPlan: { ...cur, status: 'rejected' } });
  },
}));

export const selectPlanMode = (state: PlanModeState): boolean => state.planMode;
export const selectPendingPlan = (state: PlanModeState): PlanProposal | null => state.pendingPlan;
export const selectHasPendingApproval = (state: PlanModeState): boolean =>
  state.pendingPlan?.status === 'pending';
