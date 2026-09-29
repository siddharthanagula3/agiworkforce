import type { LifecycleStatus } from '@agiworkforce/types';
export type AgiWorkPlanStepStatus =
  Extract<LifecycleStatus, 'pending' | 'completed' | 'failed' | 'cancelled'> | 'in_progress';

export interface AgiWorkPlanStep {
  id: string;
  description: string;
  status: AgiWorkPlanStepStatus;
}

export const AGIWORK_EXCLUDABLE_TOOLS = ['web_search', 'code_execution'] as const;
export type AgiWorkExcludableTool = (typeof AGIWORK_EXCLUDABLE_TOOLS)[number];

export interface AgiWorkGoalInput {
  goal: string;
  constraints?: string;
  deliverable?: string;
  excludedTools?: AgiWorkExcludableTool[];
}

export function buildAgiWorkGoalInput(
  message: string,
  fields?: {
    constraints?: string;
    deliverable?: string;
    excludedTools?: readonly AgiWorkExcludableTool[];
  },
): AgiWorkGoalInput | undefined {
  const goal = message.trim();
  if (!goal) return undefined;
  const constraints = fields?.constraints?.trim();
  const deliverable = fields?.deliverable?.trim();
  return {
    goal,
    ...(constraints ? { constraints } : {}),
    ...(deliverable ? { deliverable } : {}),
    ...(fields?.excludedTools?.length ? { excludedTools: [...fields.excludedTools] } : {}),
  };
}

const STATUSES: readonly AgiWorkPlanStepStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
];

const MAX_STEPS = 50;
const MAX_DESCRIPTION_CHARS = 300;

function isStatus(value: unknown): value is AgiWorkPlanStepStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function parseAgiWorkPlanEvent(payload: unknown): AgiWorkPlanStep[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const rawSteps = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) return null;

  const steps: AgiWorkPlanStep[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== 'object') continue;
    const wire = raw as Record<string, unknown>;
    const id = wire['id'];
    const description = wire['description'];
    const status = wire['status'];
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) continue;
    if (typeof description !== 'string' || description.trim().length === 0) continue;
    if (!isStatus(status)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    steps.push({
      id,
      description: description.slice(0, MAX_DESCRIPTION_CHARS),
      status,
    });
    if (steps.length >= MAX_STEPS) break;
  }

  return steps.length > 0 ? steps : null;
}

export function agiWorkPlanProgress(steps: AgiWorkPlanStep[] | undefined): {
  completed: number;
  total: number;
} {
  const list = steps ?? [];
  return {
    completed: list.filter((step) => step.status === 'completed').length,
    total: list.length,
  };
}

export interface AgiWorkPlanReview {
  goal: AgiWorkGoalInput;
  awaitingApproval: boolean;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function parseAgiWorkPlanReview(payload: unknown): AgiWorkPlanReview | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { goal?: unknown; awaiting_approval?: unknown };
  if (!record.goal || typeof record.goal !== 'object') return null;
  const goal = record.goal as Record<string, unknown>;
  const text = optionalText(goal['goal']);
  if (!text) return null;
  const constraints = optionalText(goal['constraints']);
  const deliverable = optionalText(goal['deliverable']);
  const excludedTools = Array.isArray(goal['excludedTools'])
    ? goal['excludedTools'].filter((tool): tool is AgiWorkExcludableTool =>
        (AGIWORK_EXCLUDABLE_TOOLS as readonly unknown[]).includes(tool),
      )
    : [];
  return {
    goal: {
      goal: text,
      ...(constraints ? { constraints } : {}),
      ...(deliverable ? { deliverable } : {}),
      ...(excludedTools.length > 0 ? { excludedTools } : {}),
    },
    awaitingApproval: record.awaiting_approval === true,
  };
}
