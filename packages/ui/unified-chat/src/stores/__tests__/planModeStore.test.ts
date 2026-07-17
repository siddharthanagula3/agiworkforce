import { beforeEach, describe, expect, it } from 'vitest';

import {
  usePlanModeStore,
  selectPlanMode,
  selectPendingPlan,
  selectHasPendingApproval,
  type PlanProposal,
} from '../planModeStore';

function reset() {
  usePlanModeStore.setState({ planMode: false, pendingPlan: null });
}

const SAMPLE_PLAN: PlanProposal = {
  id: 'plan-1',
  createdAt: '2026-05-08T00:00:00Z',
  steps: [
    { index: 1, description: 'Read source file' },
    { index: 2, description: 'Apply patch', tool: 'Edit' },
  ],
  summary: 'Refactor login flow',
  status: 'pending',
};

describe('planModeStore', () => {
  beforeEach(reset);

  it('starts off — planMode false, pendingPlan null', () => {
    expect(selectPlanMode(usePlanModeStore.getState())).toBe(false);
    expect(selectPendingPlan(usePlanModeStore.getState())).toBeNull();
    expect(selectHasPendingApproval(usePlanModeStore.getState())).toBe(false);
  });

  it('togglePlanMode flips the boolean', () => {
    usePlanModeStore.getState().togglePlanMode();
    expect(selectPlanMode(usePlanModeStore.getState())).toBe(true);
    usePlanModeStore.getState().togglePlanMode();
    expect(selectPlanMode(usePlanModeStore.getState())).toBe(false);
  });

  it('setPlanMode sets directly', () => {
    usePlanModeStore.getState().setPlanMode(true);
    expect(selectPlanMode(usePlanModeStore.getState())).toBe(true);
    usePlanModeStore.getState().setPlanMode(false);
    expect(selectPlanMode(usePlanModeStore.getState())).toBe(false);
  });

  it('setPendingPlan stores + selectHasPendingApproval reflects pending status', () => {
    usePlanModeStore.getState().setPendingPlan(SAMPLE_PLAN);
    expect(selectPendingPlan(usePlanModeStore.getState())?.id).toBe('plan-1');
    expect(selectHasPendingApproval(usePlanModeStore.getState())).toBe(true);
  });

  it('approvePlan flips status to approved', () => {
    usePlanModeStore.getState().setPendingPlan(SAMPLE_PLAN);
    usePlanModeStore.getState().approvePlan();
    expect(selectPendingPlan(usePlanModeStore.getState())?.status).toBe('approved');
    expect(selectHasPendingApproval(usePlanModeStore.getState())).toBe(false);
  });

  it('rejectPlan flips status to rejected', () => {
    usePlanModeStore.getState().setPendingPlan(SAMPLE_PLAN);
    usePlanModeStore.getState().rejectPlan();
    expect(selectPendingPlan(usePlanModeStore.getState())?.status).toBe('rejected');
    expect(selectHasPendingApproval(usePlanModeStore.getState())).toBe(false);
  });

  it('approve/reject is a no-op when no pending plan', () => {
    usePlanModeStore.getState().approvePlan();
    expect(selectPendingPlan(usePlanModeStore.getState())).toBeNull();
    usePlanModeStore.getState().rejectPlan();
    expect(selectPendingPlan(usePlanModeStore.getState())).toBeNull();
  });
});
