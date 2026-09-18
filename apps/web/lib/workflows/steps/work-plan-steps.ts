import 'server-only';

import { parseAgiWorkGoal } from '@/app/api/llm/v1/chat/completions/lib/agiwork-plan';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  loadWorkPlanForRun,
  openWorkPlan,
  settleWorkPlan,
  workPlanStatusFromSteps,
  type WorkPlanStatus,
} from '@/lib/services/work-plan-service';
import type { CloudAgentWorkflowInput } from '../cloud-agent-workflow-input';

// The steps arrive later from the planning turn; this pins what the run is
// accountable to. A plan write must never end a turn, so failures are swallowed.
export async function ensureWorkPlanForRun(input: CloudAgentWorkflowInput): Promise<void> {
  'use step';

  if (input.processed.chatRequest.work_mode !== 'agiwork') return;
  const goal = parseAgiWorkGoal(input.processed.chatRequest.agi_work_goal);
  if (!goal) return;

  try {
    const db = getNeonDb();
    const existing = await loadWorkPlanForRun(db, { userId: input.userId, runId: input.runId });
    if (existing) return;
    await openWorkPlan(db, {
      userId: input.userId,
      runId: input.runId,
      conversationId: input.processed.conversationId ?? null,
      objective: goal.goal,
      constraints: goal.constraints ?? null,
      deliverable: goal.deliverable ?? null,
    });
  } catch (error) {
    logger.warn({ error, runId: input.runId }, 'Durable work plan could not be opened');
  }
}

// A plan whose steps already say how it went keeps their verdict; only one still
// reading as open is closed by the run's outcome.
export async function settleWorkPlanForRun(
  input: CloudAgentWorkflowInput,
  outcome: 'completed' | 'failed',
): Promise<void> {
  'use step';

  if (input.processed.chatRequest.work_mode !== 'agiwork') return;

  try {
    const db = getNeonDb();
    const plan = await loadWorkPlanForRun(db, { userId: input.userId, runId: input.runId });
    if (!plan) return;
    const fromSteps = workPlanStatusFromSteps(plan);
    const status: WorkPlanStatus =
      outcome === 'failed' || fromSteps === 'draft' || fromSteps === 'active' ? outcome : fromSteps;
    await settleWorkPlan(db, { userId: input.userId, planId: plan.id, status });
  } catch (error) {
    logger.warn({ error, runId: input.runId }, 'Durable work plan could not be settled');
  }
}
