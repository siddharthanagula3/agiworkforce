import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';
import {
  agiWorkPlanContextSource,
  MAX_AGIWORK_GOAL_CHARS,
  MAX_AGIWORK_GOAL_FIELD_CHARS,
} from '@/app/api/llm/v1/chat/completions/lib/agiwork-plan';
import type { ContextSource } from '@agiworkforce/context';
import { recordWorkPlanSize } from '@/lib/observability/metrics';
import { withSpan } from '@/lib/observability/span';
import type { WorkPlanShape } from '@/lib/observability/work-plan-measures';

export const WORK_PLAN_STATUSES = ['draft', 'active', 'completed', 'failed', 'cancelled'] as const;
export type WorkPlanStatus = (typeof WORK_PLAN_STATUSES)[number];

export const WORK_PLAN_STEP_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type WorkPlanStepStatus = (typeof WORK_PLAN_STEP_STATUSES)[number];

export const WORK_PLAN_REVISION_AUTHORS = ['agent', 'user', 'system'] as const;
export type WorkPlanRevisionAuthor = (typeof WORK_PLAN_REVISION_AUTHORS)[number];

export const MAX_WORK_PLAN_STEPS = 32;
export const MAX_WORK_PLAN_STEP_CHARS = 300;
const MAX_STEP_DEPENDENCIES = 16;
const TERMINAL_STEP_STATUSES: readonly WorkPlanStepStatus[] = ['completed', 'failed', 'cancelled'];

export interface WorkPlanStep {
  id: string;
  description: string;
  status: WorkPlanStepStatus;
  dependsOn: string[];
}

export interface WorkPlan {
  id: string;
  userId: string;
  runId: string | null;
  conversationId: string | null;
  objective: string;
  constraints: string | null;
  deliverable: string | null;
  version: number;
  status: WorkPlanStatus;
  steps: WorkPlanStep[];
}

const StepIdSchema = z.string().trim().min(1).max(64);

export const WorkPlanRevisionOperationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add_step'),
      stepId: StepIdSchema.optional(),
      description: z.string().trim().min(1).max(MAX_WORK_PLAN_STEP_CHARS),
      dependsOn: z.array(StepIdSchema).max(MAX_STEP_DEPENDENCIES).optional(),
      afterStepId: StepIdSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('remove_step'), stepId: StepIdSchema }).strict(),
  z.object({ kind: z.literal('reorder'), stepIds: z.array(StepIdSchema).min(1) }).strict(),
  z
    .object({
      kind: z.literal('revise_step'),
      stepId: StepIdSchema,
      description: z.string().trim().min(1).max(MAX_WORK_PLAN_STEP_CHARS).optional(),
      dependsOn: z.array(StepIdSchema).max(MAX_STEP_DEPENDENCIES).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('revise_objective'),
      objective: z.string().trim().min(1).max(MAX_AGIWORK_GOAL_CHARS).optional(),
      constraints: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).nullable().optional(),
      deliverable: z.string().trim().max(MAX_AGIWORK_GOAL_FIELD_CHARS).nullable().optional(),
    })
    .strict(),
]);

export type WorkPlanRevisionOperation = z.infer<typeof WorkPlanRevisionOperationSchema>;

export class WorkPlanRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkPlanRevisionError';
  }
}

function stepIndex(steps: readonly WorkPlanStep[], stepId: string): number {
  return steps.findIndex((step) => step.id === stepId);
}

function nextStepId(steps: readonly WorkPlanStep[]): string {
  const taken = new Set(steps.map((step) => step.id));
  for (let ordinal = steps.length + 1; ; ordinal += 1) {
    const candidate = `step-${ordinal}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// A step ordered before something it waits for is a race, not a plan, so order
// and graph are validated together after every revision.
function assertDependenciesAreSatisfiable(steps: readonly WorkPlanStep[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (dependency === step.id) {
        throw new WorkPlanRevisionError(`Step ${step.id} cannot depend on itself`);
      }
      if (stepIndex(steps, dependency) === -1) {
        throw new WorkPlanRevisionError(`Step ${step.id} depends on unknown step ${dependency}`);
      }
      if (!seen.has(dependency)) {
        throw new WorkPlanRevisionError(
          `Step ${step.id} is ordered before ${dependency}, which it depends on`,
        );
      }
    }
    seen.add(step.id);
  }
}

function applyOperation(plan: WorkPlan, operation: WorkPlanRevisionOperation): WorkPlan {
  if (operation.kind === 'add_step') {
    if (plan.steps.length >= MAX_WORK_PLAN_STEPS) {
      throw new WorkPlanRevisionError(`A plan holds at most ${MAX_WORK_PLAN_STEPS} steps`);
    }
    const id = operation.stepId ?? nextStepId(plan.steps);
    if (stepIndex(plan.steps, id) !== -1) {
      throw new WorkPlanRevisionError(`Step ${id} already exists`);
    }
    const step: WorkPlanStep = {
      id,
      description: operation.description,
      status: 'pending',
      dependsOn: operation.dependsOn ?? [],
    };
    const steps = [...plan.steps];
    if (operation.afterStepId) {
      const at = stepIndex(steps, operation.afterStepId);
      if (at === -1) {
        throw new WorkPlanRevisionError(`Unknown step ${operation.afterStepId}`);
      }
      steps.splice(at + 1, 0, step);
    } else {
      steps.push(step);
    }
    return { ...plan, steps };
  }

  if (operation.kind === 'remove_step') {
    const at = stepIndex(plan.steps, operation.stepId);
    if (at === -1) throw new WorkPlanRevisionError(`Unknown step ${operation.stepId}`);
    const step = plan.steps[at]!;
    if (step.status !== 'pending') {
      throw new WorkPlanRevisionError(
        `Step ${step.id} is ${step.status} and is a record of work; cancel it instead of removing it`,
      );
    }
    const dependent = plan.steps.find((other) => other.dependsOn.includes(step.id));
    if (dependent) {
      throw new WorkPlanRevisionError(`Step ${dependent.id} depends on ${step.id}`);
    }
    return { ...plan, steps: plan.steps.filter((other) => other.id !== step.id) };
  }

  if (operation.kind === 'reorder') {
    const requested = operation.stepIds;
    if (
      requested.length !== plan.steps.length ||
      new Set(requested).size !== requested.length ||
      requested.some((id) => stepIndex(plan.steps, id) === -1)
    ) {
      throw new WorkPlanRevisionError('A reorder must name every step of the plan exactly once');
    }
    return { ...plan, steps: requested.map((id) => plan.steps[stepIndex(plan.steps, id)]!) };
  }

  if (operation.kind === 'revise_step') {
    const at = stepIndex(plan.steps, operation.stepId);
    if (at === -1) throw new WorkPlanRevisionError(`Unknown step ${operation.stepId}`);
    const current = plan.steps[at]!;
    if (TERMINAL_STEP_STATUSES.includes(current.status)) {
      throw new WorkPlanRevisionError(
        `Step ${current.id} is ${current.status} and cannot be revised`,
      );
    }
    const steps = [...plan.steps];
    steps[at] = {
      ...current,
      description: operation.description ?? current.description,
      dependsOn: operation.dependsOn ?? current.dependsOn,
    };
    return { ...plan, steps };
  }

  return {
    ...plan,
    objective: operation.objective ?? plan.objective,
    constraints: operation.constraints === undefined ? plan.constraints : operation.constraints,
    deliverable: operation.deliverable === undefined ? plan.deliverable : operation.deliverable,
  };
}

// Pure: the caller decides whether the next version is worth writing.
export function applyWorkPlanRevision(
  plan: WorkPlan,
  operations: readonly WorkPlanRevisionOperation[],
): WorkPlan {
  if (operations.length === 0) {
    throw new WorkPlanRevisionError('A revision must carry at least one operation');
  }
  if (plan.status === 'completed' || plan.status === 'cancelled') {
    throw new WorkPlanRevisionError(`A ${plan.status} plan cannot be revised`);
  }
  const revised = operations.reduce(applyOperation, plan);
  if (revised.steps.length === 0 && plan.steps.length > 0) {
    throw new WorkPlanRevisionError('A plan cannot be left without steps');
  }
  assertDependenciesAreSatisfiable(revised.steps);
  return { ...revised, version: plan.version + 1 };
}

/** The first step whose dependencies are all satisfied, or null while none is. */
function observeWorkPlan(shape: WorkPlanShape, plan: WorkPlan): void {
  recordWorkPlanSize({
    shape,
    steps: plan.steps.length,
    completed: plan.steps.filter((step) => step.status === 'completed').length,
  });
}

export function nextRunnableStep(plan: WorkPlan): WorkPlanStep | null {
  const completed = new Set(
    plan.steps.filter((step) => step.status === 'completed').map((step) => step.id),
  );
  return (
    plan.steps.find(
      (step) =>
        step.status === 'pending' &&
        step.dependsOn.every((dependency) => completed.has(dependency)),
    ) ?? null
  );
}

export function workPlanStatusFromSteps(plan: WorkPlan): WorkPlanStatus {
  if (plan.steps.length === 0) return plan.status;
  if (plan.steps.some((step) => step.status === 'failed')) return 'failed';
  if (plan.steps.every((step) => step.status === 'cancelled')) return 'cancelled';
  if (plan.steps.every((step) => TERMINAL_STEP_STATUSES.includes(step.status))) return 'completed';
  if (plan.steps.some((step) => step.status !== 'pending')) return 'active';
  return plan.status === 'draft' ? 'draft' : plan.status;
}

export function workPlanContextSource(plan: WorkPlan): ContextSource {
  return agiWorkPlanContextSource({
    turnId: plan.runId ?? plan.id,
    conversationId: plan.conversationId,
    planId: plan.id,
    version: plan.version,
  });
}

interface WorkPlanRow {
  id: string;
  user_id: string;
  run_id: string | null;
  conversation_id: string | null;
  objective: string;
  constraints: string | null;
  deliverable: string | null;
  version: number | string;
  status: string;
}

interface WorkPlanStepRow {
  step_id: string;
  description: string;
  status: string;
  depends_on: string[] | null;
}

function toWorkPlan(row: WorkPlanRow, stepRows: readonly WorkPlanStepRow[]): WorkPlan {
  return {
    id: row.id,
    userId: row.user_id,
    runId: row.run_id,
    conversationId: row.conversation_id,
    objective: row.objective,
    constraints: row.constraints,
    deliverable: row.deliverable,
    version: Number(row.version),
    status: row.status as WorkPlanStatus,
    steps: stepRows.map((step) => ({
      id: step.step_id,
      description: step.description,
      status: step.status as WorkPlanStepStatus,
      dependsOn: step.depends_on ?? [],
    })),
  };
}

async function readPlan(
  db: DatabaseAdapter,
  params: { userId: string; planId?: string; runId?: string },
): Promise<WorkPlan | null> {
  const [row] = await db.query<WorkPlanRow>(
    `select id, user_id, run_id, conversation_id, objective, constraints, deliverable,
            version, status
       from work_plans
      where user_id = $1
        and ($2::uuid is null or id = $2::uuid)
        and ($3::uuid is null or run_id = $3::uuid)
      limit 1`,
    [params.userId, params.planId ?? null, params.runId ?? null],
  );
  if (!row) return null;

  const steps = await db.query<WorkPlanStepRow>(
    `select step_id, description, status, depends_on
       from work_plan_steps
      where plan_id = $1::uuid and user_id = $2
      order by step_order asc`,
    [row.id, params.userId],
  );
  return toWorkPlan(row, steps);
}

export async function loadWorkPlan(
  db: DatabaseAdapter,
  params: { userId: string; planId: string },
): Promise<WorkPlan | null> {
  return readPlan(db, params);
}

export async function loadWorkPlanForRun(
  db: DatabaseAdapter,
  params: { userId: string; runId: string },
): Promise<WorkPlan | null> {
  return readPlan(db, params);
}

async function writeSteps(db: DatabaseAdapter, plan: WorkPlan): Promise<void> {
  await db.query(
    `delete from work_plan_steps
      where plan_id = $1::uuid and user_id = $2 and not (step_id = any($3::text[]))`,
    [plan.id, plan.userId, plan.steps.map((step) => step.id)],
  );
  for (const [order, step] of plan.steps.entries()) {
    await db.query(
      `insert into work_plan_steps
         (plan_id, user_id, step_id, step_order, description, status, depends_on)
       values ($1::uuid, $2, $3, $4, $5, $6, $7::text[])
       on conflict (plan_id, step_id) do update
         set step_order = excluded.step_order,
             description = excluded.description,
             depends_on = excluded.depends_on,
             updated_at = now()`,
      [plan.id, plan.userId, step.id, order, step.description, step.status, step.dependsOn],
    );
  }
}

async function recordRevision(
  db: DatabaseAdapter,
  plan: WorkPlan,
  operations: readonly WorkPlanRevisionOperation[],
  revisedBy: WorkPlanRevisionAuthor,
): Promise<void> {
  await db.query(
    `insert into work_plan_revisions (plan_id, user_id, version, revised_by, operations, snapshot)
     values ($1::uuid, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      plan.id,
      plan.userId,
      plan.version,
      revisedBy,
      JSON.stringify(operations),
      JSON.stringify({
        objective: plan.objective,
        constraints: plan.constraints,
        deliverable: plan.deliverable,
        status: plan.status,
        steps: plan.steps,
      }),
    ],
  );
}

export interface CreateWorkPlanInput {
  userId: string;
  objective: string;
  constraints?: string | null;
  deliverable?: string | null;
  runId?: string | null;
  conversationId?: string | null;
  steps?: ReadonlyArray<{ description: string; stepId?: string; dependsOn?: string[] }>;
}

function addStepOperations(steps: CreateWorkPlanInput['steps']): WorkPlanRevisionOperation[] {
  return (steps ?? []).map((step) =>
    WorkPlanRevisionOperationSchema.parse({
      kind: 'add_step',
      description: step.description,
      ...(step.stepId ? { stepId: step.stepId } : {}),
      ...(step.dependsOn ? { dependsOn: step.dependsOn } : {}),
    }),
  );
}

// Pin the objective before the steps exist, so a run is accountable to something
// from its first moment; recordWorkPlanSteps fills them in as a revision.
export async function openWorkPlan(
  db: DatabaseAdapter,
  input: Omit<CreateWorkPlanInput, 'steps'>,
): Promise<WorkPlan> {
  return createWorkPlan(db, { ...input, steps: [] });
}

export async function createWorkPlan(
  db: DatabaseAdapter,
  input: CreateWorkPlanInput,
): Promise<WorkPlan> {
  const operations = addStepOperations(input.steps);

  return withSpan('work.plan.create', { domain: 'task' }, async (span) =>
    db.transaction(async (tx) => {
      const [row] = await tx.query<WorkPlanRow>(
        `insert into work_plans (user_id, run_id, conversation_id, objective, constraints, deliverable)
       values ($1, $2::uuid, $3::uuid, $4, $5, $6)
       returning id, user_id, run_id, conversation_id, objective, constraints, deliverable,
                 version, status`,
        [
          input.userId,
          input.runId ?? null,
          input.conversationId ?? null,
          input.objective,
          input.constraints ?? null,
          input.deliverable ?? null,
        ],
      );
      if (!row) throw new WorkPlanRevisionError('The plan could not be created');

      const empty = toWorkPlan(row, []);
      const seeded = operations.reduce(applyOperation, empty);
      assertDependenciesAreSatisfiable(seeded.steps);
      if (seeded.steps.length > 0) await writeSteps(tx, seeded);
      await recordRevision(
        tx,
        seeded,
        operations.length > 0
          ? operations
          : [
              {
                kind: 'revise_objective',
                objective: seeded.objective,
                constraints: seeded.constraints,
                deliverable: seeded.deliverable,
              },
            ],
        'agent',
      );
      span.setAttributes({ 'agi.work.plan.status': seeded.status });
      observeWorkPlan('planned', seeded);
      return seeded;
    }),
  );
}

// Steps already on the plan are left alone, so a resumed turn that replans does
// not erase the record of what already ran.
export async function recordWorkPlanSteps(
  db: DatabaseAdapter,
  params: {
    userId: string;
    planId: string;
    descriptions: readonly string[];
    revisedBy?: WorkPlanRevisionAuthor;
  },
): Promise<WorkPlan | null> {
  const operations = addStepOperations(params.descriptions.map((description) => ({ description })));
  if (operations.length === 0) return null;
  return reviseWorkPlan(db, {
    userId: params.userId,
    planId: params.planId,
    operations,
    revisedBy: params.revisedBy ?? 'agent',
  });
}

export async function settleWorkPlan(
  db: DatabaseAdapter,
  params: { userId: string; planId: string; status: WorkPlanStatus },
): Promise<void> {
  await db.query(
    `update work_plans
        set status = $3
      where id = $1::uuid and user_id = $2 and status not in ('completed', 'cancelled')`,
    [params.planId, params.userId, params.status],
  );
}

export async function reviseWorkPlan(
  db: DatabaseAdapter,
  params: {
    userId: string;
    planId: string;
    operations: readonly WorkPlanRevisionOperation[];
    revisedBy: WorkPlanRevisionAuthor;
    expectedVersion?: number;
  },
): Promise<WorkPlan> {
  return withSpan('work.plan.revise', { domain: 'task' }, async (span) =>
    db.transaction(async (tx) => {
      const current = await readPlan(tx, { userId: params.userId, planId: params.planId });
      if (!current) throw new WorkPlanRevisionError('No such plan');
      if (params.expectedVersion !== undefined && params.expectedVersion !== current.version) {
        throw new WorkPlanRevisionError(
          `The plan moved to version ${current.version} while this revision was being prepared`,
        );
      }

      const revised = applyWorkPlanRevision(current, params.operations);
      const [row] = await tx.query<WorkPlanRow>(
        `update work_plans
          set objective = $3,
              constraints = $4,
              deliverable = $5,
              version = version + 1
        where id = $1::uuid and user_id = $2 and version = $6
       returning id, user_id, run_id, conversation_id, objective, constraints, deliverable,
                 version, status`,
        [
          params.planId,
          params.userId,
          revised.objective,
          revised.constraints,
          revised.deliverable,
          current.version,
        ],
      );
      if (!row) throw new WorkPlanRevisionError('The plan changed while this revision was applied');

      const written = {
        ...revised,
        version: Number(row.version),
        status: row.status as WorkPlanStatus,
      };
      await writeSteps(tx, written);
      await recordRevision(tx, written, params.operations, params.revisedBy);
      span.setAttributes({ 'agi.work.plan.status': written.status });
      observeWorkPlan('revised', written);
      return written;
    }),
  );
}

export async function advanceWorkPlanStep(
  db: DatabaseAdapter,
  params: {
    userId: string;
    planId: string;
    stepId: string;
    transition: 'start' | 'complete' | 'fail' | 'cancel';
  },
): Promise<WorkPlan> {
  return db.transaction(async (tx) => {
    const plan = await readPlan(tx, { userId: params.userId, planId: params.planId });
    if (!plan) throw new WorkPlanRevisionError('No such plan');
    const step = plan.steps.find((candidate) => candidate.id === params.stepId);
    if (!step) throw new WorkPlanRevisionError(`Unknown step ${params.stepId}`);

    if (params.transition === 'start') {
      if (step.status !== 'pending') {
        throw new WorkPlanRevisionError(`Step ${step.id} is already ${step.status}`);
      }
      const blocking = step.dependsOn.filter(
        (dependency) =>
          plan.steps.find((candidate) => candidate.id === dependency)?.status !== 'completed',
      );
      if (blocking.length > 0) {
        throw new WorkPlanRevisionError(`Step ${step.id} waits for ${blocking.join(', ')}`);
      }
    } else if (step.status !== 'in_progress') {
      throw new WorkPlanRevisionError(`Step ${step.id} is ${step.status}, not in progress`);
    }

    const status: WorkPlanStepStatus =
      params.transition === 'start'
        ? 'in_progress'
        : params.transition === 'complete'
          ? 'completed'
          : params.transition === 'fail'
            ? 'failed'
            : 'cancelled';

    await tx.query(
      `update work_plan_steps
          set status = $4,
              started_at = case when $4 = 'in_progress' then now() else started_at end,
              ended_at = case when $4 in ('completed', 'failed', 'cancelled') then now() else ended_at end
        where plan_id = $1::uuid and user_id = $2 and step_id = $3`,
      [params.planId, params.userId, params.stepId, status],
    );

    const advanced = {
      ...plan,
      steps: plan.steps.map((candidate) =>
        candidate.id === step.id ? { ...candidate, status } : candidate,
      ),
    };
    const nextStatus = workPlanStatusFromSteps(advanced);
    const [row] = await tx.query<{ status: string }>(
      `update work_plans set status = $3 where id = $1::uuid and user_id = $2 returning status`,
      [params.planId, params.userId, nextStatus],
    );
    return { ...advanced, status: (row?.status ?? nextStatus) as WorkPlanStatus };
  });
}
