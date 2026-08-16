import type { AgentEvent } from '@agiworkforce/types/protocol';
import { z } from 'zod';

export const AGIWORK_PLAN_MIN_STEPS = 3;
export const AGIWORK_PLAN_MAX_STEPS = 6;
const MAX_PLAN_STEP_CHARS = 300;

export const MAX_AGIWORK_GOAL_CHARS = 2000;
export const MAX_AGIWORK_GOAL_FIELD_CHARS = 1000;

export const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';
export const AGIWORK_PLAN_PROGRESS_ID_PREFIX = 'agiwork:plan:';

export const AgiWorkGoalSchema = z
  .object({
    goal: z.string().trim().min(1).max(MAX_AGIWORK_GOAL_CHARS),
    constraints: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).optional(),
    deliverable: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).optional(),
  })
  // Drop optional fields that arrived empty so `{ goal, constraints: '' }` and
  // `{ goal }` are stored identically.
  .transform((value) => ({
    goal: value.goal,
    ...(value.constraints ? { constraints: value.constraints } : {}),
    ...(value.deliverable ? { deliverable: value.deliverable } : {}),
  }));

export type AgiWorkGoal = z.infer<typeof AgiWorkGoalSchema>;

export type AgiWorkPlanStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgiWorkPlanStep {
  id: string;
  description: string;
  status: AgiWorkPlanStepStatus;
}

export function parseAgiWorkGoal(raw: unknown): AgiWorkGoal | null {
  const parsed = AgiWorkGoalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function agiWorkGoalHeadline(goal: AgiWorkGoal): string {
  return goal.goal;
}

export function agiWorkPlanningDirective(goal: AgiWorkGoal): string {
  const lines = [
    'You are about to start an AGI Work run with tools (web search, fetch, code execution, file creation).',
    `Objective: ${goal.goal}`,
  ];
  if (goal.constraints) lines.push(`Constraints: ${goal.constraints}`);
  if (goal.deliverable) lines.push(`Expected deliverable: ${goal.deliverable}`);
  lines.push(
    '',
    `Before doing any work, reply with ONLY a JSON array of ${AGIWORK_PLAN_MIN_STEPS}-${AGIWORK_PLAN_MAX_STEPS} short, concrete step strings` +
      ' describing how you will accomplish the objective, in order. No prose, no code fences, no keys — just the array.',
  );
  return lines.join('\n');
}

export function parseAgiWorkPlanSteps(text: string): string[] {
  const steps: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || steps.length >= AGIWORK_PLAN_MAX_STEPS) return;
    steps.push(trimmed.slice(0, MAX_PLAN_STEP_CHARS));
  };

  const jsonStart = text.indexOf('[');
  const jsonEnd = text.lastIndexOf(']');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed: unknown = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string') push(entry);
          else if (steps.length >= AGIWORK_PLAN_MAX_STEPS) break;
        }
        if (steps.length > 0) return steps;
      }
    } catch {
      // Fall through to the line-based fallback below.
    }
  }

  for (const rawLine of text.split('\n')) {
    if (steps.length >= AGIWORK_PLAN_MAX_STEPS) break;
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
    if (line !== rawLine) push(line);
  }
  return steps;
}

export function buildAgiWorkPlan(descriptions: string[]): AgiWorkPlanStep[] {
  return descriptions.map((description, index) => ({
    id: `agiwork-plan-${index + 1}`,
    description,
    status: 'pending' as const,
  }));
}

export function advanceAgiWorkPlan(
  steps: AgiWorkPlanStep[],
  transition: 'start' | 'complete' | 'fail' | 'cancel',
): AgiWorkPlanStep[] {
  if (transition === 'start') {
    let marked = false;
    return steps.map((step) => {
      if (!marked && step.status === 'pending') {
        marked = true;
        return { ...step, status: 'in_progress' };
      }
      return step;
    });
  }
  if (transition === 'complete') {
    return steps.map((step) =>
      step.status === 'completed' || step.status === 'failed' || step.status === 'cancelled'
        ? step
        : { ...step, status: 'completed' },
    );
  }
  const terminal: AgiWorkPlanStepStatus = transition === 'fail' ? 'failed' : 'cancelled';
  return steps.map((step) =>
    step.status === 'in_progress' ? { ...step, status: terminal } : step,
  );
}

export function agiWorkPlanEvent(steps: AgiWorkPlanStep[], responseModel: string): string {
  return `data: ${JSON.stringify({
    choices: [
      {
        delta: {
          x_agiwork_plan: {
            steps: steps.map((step) => ({
              id: step.id,
              description: step.description,
              status: step.status,
            })),
          },
        },
        index: 0,
      },
    ],
    model: responseModel,
  })}\n\n`;
}

export function agiWorkGoalProgressEvent(goal: AgiWorkGoal): AgentEvent {
  const detailParts: string[] = [];
  if (goal.constraints) detailParts.push(`Constraints: ${goal.constraints}`);
  if (goal.deliverable) detailParts.push(`Deliverable: ${goal.deliverable}`);
  return {
    type: 'progress-update',
    progressId: AGIWORK_GOAL_PROGRESS_ID,
    summary: goal.goal,
    ...(detailParts.length > 0 ? { detail: detailParts.join('\n') } : {}),
    status: 'completed',
  };
}

export function agiWorkPlanProgressEvents(steps: AgiWorkPlanStep[]): AgentEvent[] {
  return steps.map((step, index) => ({
    type: 'progress-update',
    progressId: `${AGIWORK_PLAN_PROGRESS_ID_PREFIX}${step.id}`,
    summary: `${index + 1}. ${step.description}`,
    status: 'completed',
  }));
}
