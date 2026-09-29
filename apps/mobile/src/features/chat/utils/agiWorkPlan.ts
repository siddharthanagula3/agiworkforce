import type { LifecycleStatus } from '@agiworkforce/types';
import type { AgiWorkGoalInput } from '@/src/features/tasks/agiWorkGoal';

export type AgiWorkPlanStepStatus =
  Extract<LifecycleStatus, 'pending' | 'completed' | 'failed' | 'cancelled'> | 'in_progress';

export interface AgiWorkPlanStep {
  id: string;
  description: string;
  status: AgiWorkPlanStepStatus;
}

export interface AgiWorkPlanReviewState {
  goal: AgiWorkGoalInput;
  awaitingApproval: boolean;
}

export type AgiWorkPlanDecision =
  { kind: 'start'; steps: string[] } | { kind: 'cancel' } | { kind: 'retry'; fromIndex: number };

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

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function readAgiWorkPlanSteps(value: unknown): AgiWorkPlanStep[] | null {
  if (!Array.isArray(value)) return null;
  const steps: AgiWorkPlanStep[] = [];
  const seenIds = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const wire = raw as Record<string, unknown>;
    const id = wire['id'];
    const description = wire['description'];
    const status = wire['status'];
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) continue;
    if (typeof description !== 'string' || description.trim().length === 0) continue;
    if (!isStatus(status) || seenIds.has(id)) continue;
    seenIds.add(id);
    steps.push({ id, description: description.slice(0, MAX_DESCRIPTION_CHARS), status });
    if (steps.length >= MAX_STEPS) break;
  }
  return steps.length > 0 ? steps : null;
}

function readGoal(value: unknown): AgiWorkGoalInput | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const goal = optionalText(record['goal']);
  if (!goal) return null;
  const constraints = optionalText(record['constraints']);
  const deliverable = optionalText(record['deliverable']);
  return {
    goal,
    ...(constraints ? { constraints } : {}),
    ...(deliverable ? { deliverable } : {}),
  };
}

export function readAgiWorkPlanReview(value: unknown): AgiWorkPlanReviewState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { goal?: unknown; awaitingApproval?: unknown };
  const goal = readGoal(record.goal);
  return goal ? { goal, awaitingApproval: record.awaitingApproval === true } : null;
}

export function parseAgiWorkPlanDelta(payload: unknown): {
  steps: AgiWorkPlanStep[] | null;
  review: AgiWorkPlanReviewState | null;
} {
  if (!payload || typeof payload !== 'object') return { steps: null, review: null };
  const record = payload as { steps?: unknown; goal?: unknown; awaiting_approval?: unknown };
  const goal = readGoal(record.goal);
  return {
    steps: readAgiWorkPlanSteps(record.steps),
    review: goal ? { goal, awaitingApproval: record.awaiting_approval === true } : null,
  };
}

export function agiWorkPlanRetryMessage(fromIndex: number, step: AgiWorkPlanStep): string {
  return `Retry step ${fromIndex + 1}: ${step.description}`;
}
