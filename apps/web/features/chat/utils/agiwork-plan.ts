/**
 * Client-side reduction of the additive `x_agiwork_plan` SSE event (CAP-048).
 *
 * The server re-emits the WHOLE plan on every change (last-write-wins, like
 * `x_research_plan`), so reduction is a replace, not a merge — a client that
 * joined late still ends up with the complete queue.
 *
 * Every field is validated: the payload is model-influenced server output
 * arriving over the wire, so a malformed step is dropped rather than rendered.
 * A payload with no usable step returns null, which callers treat as "no
 * update" so a garbage event cannot erase a good plan.
 */

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

/**
 * The structured goal the composer captures in AGI Work mode and sends with the
 * request. `goal` is the composed message (the headline objective); the two
 * optional fields let the user pin down scope and the concrete deliverable. The
 * server re-validates it (see `AgiWorkGoalSchema`) before storing or planning.
 */
export interface AgiWorkGoalInput {
  goal: string;
  constraints?: string;
  deliverable?: string;
}

/**
 * Build the wire goal from the composed message plus the optional fields, or
 * return undefined when there is nothing worth sending. Trims and drops empty
 * optional fields so `{ goal }` and `{ goal, constraints: '' }` are identical.
 */
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
    // Bound: the loop emits at most a handful of steps, but the wire is not
    // trusted to stay that way.
    if (steps.length >= MAX_STEPS) break;
  }

  return steps.length > 0 ? steps : null;
}

/** Count of steps in a terminal status, for a compact "3/5 done" summary. */
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
