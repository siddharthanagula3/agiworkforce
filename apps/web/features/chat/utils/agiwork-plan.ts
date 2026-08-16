
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

export interface AgiWorkGoalInput {
  goal: string;
  constraints?: string;
  deliverable?: string;
}

export function buildAgiWorkGoalInput(
  message: string,
  fields?: { constraints?: string; deliverable?: string },
): AgiWorkGoalInput | undefined {
  const goal = message.trim();
  if (!goal) return undefined;
  const constraints = fields?.constraints?.trim();
  const deliverable = fields?.deliverable?.trim();
  return {
    goal,
    ...(constraints ? { constraints } : {}),
    ...(deliverable ? { deliverable } : {}),
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
