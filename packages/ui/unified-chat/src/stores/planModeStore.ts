/**
 * planModeStore — surface-agnostic toggle for "Plan first, execute on approval"
 * conversation mode (Claude Code style).
 *
 * Hosts (apps/desktop, apps/web, etc.) flip `planMode` via the composer
 * Plan toggle button. When active, the agent is expected to:
 *   1. Receive the user's prompt.
 *   2. Produce a structured plan (numbered steps, tool calls, expected outcome).
 *   3. Wait for user approval before executing.
 *
 * The mode is conversation-scoped: mode resets when the conversation changes
 * to avoid surprising mid-thread switches. Hosts call `setPlanMode(false)`
 * on conversation reset.
 */
import { create } from 'zustand';

interface PlanModeState {
  /** Currently in plan-first mode. */
  planMode: boolean;
  /** Most recent plan proposal pending approval (set by the agent loop). */
  pendingPlan: PlanProposal | null;

  setPlanMode: (active: boolean) => void;
  togglePlanMode: () => void;
  setPendingPlan: (plan: PlanProposal | null) => void;
  approvePlan: () => void;
  rejectPlan: () => void;
}

/** Structured plan proposal an agent emits when planMode is active. */
export interface PlanProposal {
  /** Stable id for the proposal (host or agent generates). */
  id: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** Numbered steps the agent intends to take. */
  steps: PlanStep[];
  /** Brief summary of expected outcome. */
  summary: string;
  /** Optional risks or pre-conditions the user should review. */
  risks?: string[];
  /** Approval state. */
  status: 'pending' | 'approved' | 'rejected' | 'completed';
}

export interface PlanStep {
  index: number;
  description: string;
  /** Tool the agent intends to invoke for this step (if applicable). */
  tool?: string;
  /** Optional expected duration in seconds. */
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

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPlanMode = (state: PlanModeState): boolean => state.planMode;
export const selectPendingPlan = (state: PlanModeState): PlanProposal | null => state.pendingPlan;
export const selectHasPendingApproval = (state: PlanModeState): boolean =>
  state.pendingPlan?.status === 'pending';
