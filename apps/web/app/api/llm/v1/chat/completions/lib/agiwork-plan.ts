import type { AgentEvent } from '@agiworkforce/types/protocol';
import { z } from 'zod';

/**
 * AGI Work goal intake + plan surface (CAP-048).
 *
 * Two independent, purely additive channels carry the shape of an AGI Work run:
 *
 *   1. A DURABLE journal record. The goal and the committed plan steps are
 *      emitted as ordinary `progress-update` agent events, so they are persisted
 *      into `cloud_agent_events` alongside every other event with NO new event
 *      variant and NO schema migration. `/tasks` reconstructs "which task this
 *      run is" and "what it planned" from these — see the sentinel progress ids
 *      below. A client that does not know the sentinels simply renders them as
 *      ordinary progress rows, so nothing regresses.
 *
 *   2. A LIVE `x_agiwork_plan` SSE delta, emitted whole on every change
 *      (last-write-wins, exactly like `x_research_plan`). It carries richer
 *      per-step status so the active composer can show a live plan queue. A
 *      client that ignores unknown `x_` deltas sees the run exactly as it did
 *      before this event existed.
 *
 * The plan is VISIBILITY-ONLY in v1: emitting it never gates tool execution.
 */

/** A model can drift; keep the plan a short, readable queue rather than a wall. */
export const AGIWORK_PLAN_MIN_STEPS = 3;
export const AGIWORK_PLAN_MAX_STEPS = 6;
const MAX_PLAN_STEP_CHARS = 300;

export const MAX_AGIWORK_GOAL_CHARS = 2000;
export const MAX_AGIWORK_GOAL_FIELD_CHARS = 1000;

/**
 * Progress ids the durable journal reserves for AGI Work's goal + plan rows.
 * `/tasks` matches on these to lift them out of the ordinary progress list into
 * dedicated Goal and Plan sections. Kept as plain literals (not shared with the
 * UI package) so the API route never imports React — the wire contract is the
 * source of truth, mirrored by a guard test on each side, the same way the
 * `x_research_plan` snake_case contract is mirrored across server and client.
 */
export const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';
export const AGIWORK_PLAN_PROGRESS_ID_PREFIX = 'agiwork:plan:';

/**
 * The structured goal the composer captures in AGI Work mode. `goal` is the
 * headline objective; the two optional fields let a user pin down scope and the
 * concrete artifact they expect without a modal wall.
 */
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

/**
 * Server-side normalization of the client-sent goal. The composer is trusted to
 * shape it, but this is a model-facing, wire-arriving value, so it is validated
 * here rather than fed to the plan turn raw. Returns null for anything that is
 * not a usable goal — the caller then runs AGI Work without a stored goal
 * instead of storing garbage.
 */
export function parseAgiWorkGoal(raw: unknown): AgiWorkGoal | null {
  const parsed = AgiWorkGoalSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Compact one-line label for a run, used where only a headline fits. */
export function agiWorkGoalHeadline(goal: AgiWorkGoal): string {
  return goal.goal;
}

/**
 * The tool-free planning directive. Mirrors the research planning turn: one
 * model call that commits to the concrete steps this run will take, returned as
 * a JSON array of short strings. The goal's optional scope/deliverable fields
 * are threaded in so the plan reflects them.
 */
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

/**
 * Parse the planning turn's reply into ordered plan-step descriptions.
 *
 * Preferred shape is a JSON array of strings; a plain numbered/bulleted list is
 * accepted as a fallback because models drift. Anything unparseable yields an
 * empty plan, and the caller then proceeds WITHOUT inventing steps the model
 * never committed to.
 */
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
    // Strip a leading list marker: "1.", "1)", "-", "*", "•".
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
    if (line !== rawLine) push(line);
  }
  return steps;
}

/** Turn parsed step descriptions into a fresh, all-pending plan. */
export function buildAgiWorkPlan(descriptions: string[]): AgiWorkPlanStep[] {
  return descriptions.map((description, index) => ({
    id: `agiwork-plan-${index + 1}`,
    description,
    status: 'pending' as const,
  }));
}

/**
 * Advance the plan's live status without ever claiming per-step completion we
 * cannot observe. A tool loop's steps do not map onto plan steps, so this marks
 * the plan coarsely and honestly:
 *   - `start`: the first pending step becomes `in_progress`.
 *   - `complete`: every non-terminal step becomes `completed` (the run finished).
 *   - `fail` / `cancel`: the in-progress step takes that terminal status; steps
 *     never reached stay `pending`.
 */
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

/**
 * Build the additive `x_agiwork_plan` SSE frame. Carries the WHOLE plan every
 * time (last-write-wins), snake_case on the wire to match the `x_research_plan`
 * convention.
 */
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

/**
 * Durable journal event carrying the run's goal. Emitted once at run start as a
 * `progress-update` so it lands in `cloud_agent_events` with no new variant.
 */
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

/**
 * Durable journal events carrying the committed plan, one `progress-update` per
 * step. `/tasks` lifts these out of the progress list into a Plan section by the
 * reserved progress-id prefix.
 */
export function agiWorkPlanProgressEvents(steps: AgiWorkPlanStep[]): AgentEvent[] {
  return steps.map((step, index) => ({
    type: 'progress-update',
    progressId: `${AGIWORK_PLAN_PROGRESS_ID_PREFIX}${step.id}`,
    summary: `${index + 1}. ${step.description}`,
    status: 'completed',
  }));
}
