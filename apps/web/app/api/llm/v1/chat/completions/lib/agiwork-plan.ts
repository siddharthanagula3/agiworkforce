import {
  AGIWORK_PLAN_MAX_STEPS,
  MAX_AGIWORK_GOAL_CHARS,
  MAX_AGIWORK_PLAN_STEP_CHARS,
} from '@agiworkforce/cloud-contracts';
import { contextSource, type ContextSource } from '@agiworkforce/context';
import type { AgentEvent } from '@agiworkforce/types/protocol';
import { z } from 'zod';
import { assertNoExternalInstructions } from './context/context-manifest';

export const AGIWORK_PLAN_MIN_STEPS = 3;

export const MAX_AGIWORK_GOAL_FIELD_CHARS = 1000;

export const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';
export const AGIWORK_PLAN_PROGRESS_ID_PREFIX = 'agiwork:plan:';
export const AGIWORK_PLAN_OVERVIEW_PROGRESS_ID = 'agiwork:plan-overview';

export const AGIWORK_EXCLUDABLE_TOOLS = ['web_search', 'code_execution'] as const;
export type AgiWorkExcludableTool = (typeof AGIWORK_EXCLUDABLE_TOOLS)[number];

const AGIWORK_TOOL_LABELS: Record<AgiWorkExcludableTool, string> = {
  web_search: 'web search',
  code_execution: 'code execution',
};

export const AgiWorkGoalSchema = z
  .object({
    goal: z.string().trim().min(1).max(MAX_AGIWORK_GOAL_CHARS),
    constraints: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).optional(),
    deliverable: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).optional(),
    excludedTools: z
      .array(z.enum(AGIWORK_EXCLUDABLE_TOOLS))
      .max(AGIWORK_EXCLUDABLE_TOOLS.length)
      .optional(),
  })
  // Drop optional fields that arrived empty so `{ goal, constraints: '' }` and
  // `{ goal }` are stored identically.
  .transform((value) => ({
    goal: value.goal,
    ...(value.constraints ? { constraints: value.constraints } : {}),
    ...(value.deliverable ? { deliverable: value.deliverable } : {}),
    ...(value.excludedTools && value.excludedTools.length > 0
      ? { excludedTools: [...new Set(value.excludedTools)] }
      : {}),
  }));

export type AgiWorkGoal = z.infer<typeof AgiWorkGoalSchema>;

export type AgiWorkPlanStepStatus =
  'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface AgiWorkPlanStep {
  id: string;
  description: string;
  status: AgiWorkPlanStepStatus;
}

export interface AgiWorkContextIdentity {
  turnId: string;
  conversationId?: string | null;
  planId?: string | null;
  version?: number | null;
}

// The goal and the plan are the two sources an AGI Work turn trusts as instruction.
// Re-checking here keeps a taxonomy edit from quietly granting that to fetched content.
function agiWorkInstructionSource(source: ContextSource): ContextSource {
  assertNoExternalInstructions([source]);
  return source;
}

export function agiWorkGoalContextSource(identity: AgiWorkContextIdentity): ContextSource {
  return agiWorkInstructionSource(
    contextSource({
      sourceClass: 'agent_instruction',
      locator: identity.planId
        ? `work_plans/${identity.planId}`
        : `agiwork/${identity.turnId}/goal`,
      conversationId: identity.conversationId ?? null,
    }),
  );
}

export function agiWorkPlanContextSource(identity: AgiWorkContextIdentity): ContextSource {
  const revision = identity.version == null ? '' : `@${identity.version}`;
  return agiWorkInstructionSource(
    contextSource({
      sourceClass: 'current_task_state',
      locator: identity.planId
        ? `work_plans/${identity.planId}${revision}`
        : `agiwork/${identity.turnId}/plan${revision}`,
      conversationId: identity.conversationId ?? null,
    }),
  );
}

export function parseAgiWorkGoal(raw: unknown): AgiWorkGoal | null {
  const parsed = AgiWorkGoalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function agiWorkGoalHeadline(goal: AgiWorkGoal): string {
  return goal.goal;
}

export function agiWorkPlanningDirective(goal: AgiWorkGoal): string {
  const excluded = new Set(goal.excludedTools ?? []);
  const tools = [
    ...(excluded.has('web_search') ? [] : ['web search', 'fetch']),
    ...(excluded.has('code_execution') ? [] : ['code execution']),
    'file creation',
  ];
  const lines = [
    `You are about to start an AGI Work run with tools (${tools.join(', ')}).`,
    `Objective: ${goal.goal}`,
  ];
  if (goal.constraints) lines.push(`Constraints: ${goal.constraints}`);
  if (goal.deliverable) lines.push(`Expected deliverable: ${goal.deliverable}`);
  lines.push(
    '',
    `Before doing any work, reply with ONLY a JSON array of ${AGIWORK_PLAN_MIN_STEPS}-${AGIWORK_PLAN_MAX_STEPS} short, concrete step strings` +
      ' describing how you will accomplish the objective, in order. No prose, no code fences, no keys, just the array.',
  );
  return lines.join('\n');
}

export function parseAgiWorkPlanSteps(text: string): string[] {
  const steps: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || steps.length >= AGIWORK_PLAN_MAX_STEPS) return;
    steps.push(trimmed.slice(0, MAX_AGIWORK_PLAN_STEP_CHARS));
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
  transition: 'start' | 'complete' | 'fail' | 'cancel' | 'stop',
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

export function advanceAgiWorkPlanToStep(
  steps: AgiWorkPlanStep[],
  ordinal: number,
): AgiWorkPlanStep[] {
  if (ordinal < 1 || ordinal > steps.length) return steps;
  return steps.map((step, index) => {
    if (step.status === 'failed' || step.status === 'cancelled') return step;
    if (index < ordinal - 1) return { ...step, status: 'completed' };
    if (index === ordinal - 1 && step.status !== 'completed') {
      return { ...step, status: 'in_progress' };
    }
    return step;
  });
}

const STEP_MARKER_PATTERN = /^[\s>*_#-]*Step\s+(\d{1,2})\s*[:.)]/gim;

export function agiWorkPlanStepMarker(text: string): number | null {
  let latest: number | null = null;
  for (const match of text.matchAll(STEP_MARKER_PATTERN)) {
    const ordinal = Number(match[1]);
    if (Number.isInteger(ordinal) && (latest === null || ordinal > latest)) latest = ordinal;
  }
  return latest;
}

export function agiWorkExecutionDirective(steps: AgiWorkPlanStep[]): string {
  return [
    'Work through this plan in order:',
    ...steps.map((step, index) => `${index + 1}. ${step.description}`),
    'When you begin a step, first write a line of its own that starts with "Step N:" and names the step, so the user can follow your progress.',
  ].join('\n');
}

export const AgiWorkSuppliedPlanSchema = z.object({
  steps: z
    .array(z.string().trim().min(1).max(MAX_AGIWORK_PLAN_STEP_CHARS))
    .min(1)
    .max(AGIWORK_PLAN_MAX_STEPS),
});

export function agiWorkPlanEvent(
  steps: AgiWorkPlanStep[],
  responseModel: string,
  review?: { goal: AgiWorkGoal; awaitingApproval: boolean },
): string {
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
            ...(review ? { goal: review.goal, awaiting_approval: review.awaitingApproval } : {}),
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
  if (goal.excludedTools?.length) {
    detailParts.push(
      `Tools off: ${goal.excludedTools.map((tool) => AGIWORK_TOOL_LABELS[tool]).join(', ')}`,
    );
  }
  return {
    type: 'progress-update',
    progressId: AGIWORK_GOAL_PROGRESS_ID,
    summary: goal.goal,
    ...(detailParts.length > 0 ? { detail: detailParts.join('\n') } : {}),
    status: 'completed',
  };
}

const PLAN_STEP_PROGRESS_STATUS: Partial<
  Record<AgiWorkPlanStepStatus, Extract<AgentEvent, { type: 'progress-update' }>['status']>
> = {
  in_progress: 'running',
  completed: 'completed',
  failed: 'failed',
};

export function agiWorkPlanProgressEvents(steps: AgiWorkPlanStep[]): AgentEvent[] {
  const overview: AgentEvent = {
    type: 'progress-update',
    progressId: AGIWORK_PLAN_OVERVIEW_PROGRESS_ID,
    summary: `Plan · ${steps.length} step${steps.length === 1 ? '' : 's'}`,
    detail: steps.map((step, index) => `${index + 1}. ${step.description}`).join('\n'),
    status: 'completed',
  };
  const started = steps.flatMap((step, index): AgentEvent[] => {
    const status = PLAN_STEP_PROGRESS_STATUS[step.status];
    return status
      ? [
          {
            type: 'progress-update',
            progressId: `${AGIWORK_PLAN_PROGRESS_ID_PREFIX}${step.id}`,
            summary: `${index + 1}. ${step.description}`,
            status,
          },
        ]
      : [];
  });
  return [overview, ...started];
}
