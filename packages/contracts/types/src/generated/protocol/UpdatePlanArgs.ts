import type { PlanItemArg } from './PlanItemArg';

export type UpdatePlanArgs = {
  /**
   * Arguments for the `update_plan` todo/checklist tool (not plan mode).
   */
  explanation: string | null;
  plan: Array<PlanItemArg>;
};
