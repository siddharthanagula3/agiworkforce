import { z } from 'zod';
import { AGI_WORK_MODE } from '@agiworkforce/types';
import type { CloudWorkPlanReview } from '@agiworkforce/types/protocol';
import { AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_PLAN_STEP_CHARS } from '@agiworkforce/cloud-contracts';
import { AgiWorkGoalSchema } from '@/app/api/llm/v1/chat/completions/lib/agiwork-plan';

const WorkPlanReviewSchema = z
  .object({
    reviewId: z.uuid(),
    planningMessageId: z.uuid(),
    runId: z.uuid(),
    conversationId: z.uuid(),
    model: z.string().min(1),
    mode: z.literal(AGI_WORK_MODE),
    goal: AgiWorkGoalSchema,
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1),
            description: z.string().min(1).max(MAX_AGIWORK_PLAN_STEP_CHARS),
            status: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(AGIWORK_PLAN_MAX_STEPS),
    awaitingApproval: z.boolean(),
    declined: z.boolean(),
  })
  .strict() satisfies z.ZodType<CloudWorkPlanReview>;

export const WorkPlanReviewPatchSchema = z
  .object({
    workPlanReview: WorkPlanReviewSchema,
    expectedWorkPlanReview: WorkPlanReviewSchema.nullable(),
  })
  .strict();

export function sameWorkPlanContent(
  left: CloudWorkPlanReview,
  right: CloudWorkPlanReview,
): boolean {
  const content = (plan: CloudWorkPlanReview) => ({
    reviewId: plan.reviewId,
    planningMessageId: plan.planningMessageId,
    runId: plan.runId,
    conversationId: plan.conversationId,
    model: plan.model,
    mode: plan.mode,
    goal: plan.goal,
    steps: plan.steps.map(({ id, description }) => ({ id, description })),
  });
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}

export const UPDATE_WORK_PLAN_REVIEW_SQL = `update web_messages
   set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb
 where id = $2::uuid and conversation_id = $3::uuid
   and role = 'assistant' and deleted_at is null
   and coalesce(metadata -> 'agiWorkPlanReview', 'null'::jsonb) = $4::jsonb
 returning id, metadata -> 'agiWorkPlanReview' as review`;
