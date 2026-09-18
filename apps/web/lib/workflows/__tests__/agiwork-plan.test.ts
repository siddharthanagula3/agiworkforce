import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetNeonDb } = vi.hoisted(() => ({ mockGetNeonDb: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  advanceWorkPlanStep,
  applyWorkPlanRevision,
  createWorkPlan,
  loadWorkPlanForRun,
  nextRunnableStep,
  openWorkPlan,
  recordWorkPlanSteps,
  reviseWorkPlan,
  workPlanContextSource,
  workPlanStatusFromSteps,
  WorkPlanRevisionError,
  type WorkPlan,
} from '@/lib/services/work-plan-service';
import type { CloudAgentWorkflowInput } from '../cloud-agent-workflow-input';
import { ensureWorkPlanForRun, settleWorkPlanForRun } from '../steps/work-plan-steps';

interface PlanRow {
  id: string;
  user_id: string;
  run_id: string | null;
  conversation_id: string | null;
  objective: string;
  constraints: string | null;
  deliverable: string | null;
  version: number;
  status: string;
}

interface StepRow {
  step_id: string;
  step_order: number;
  description: string;
  status: string;
  depends_on: string[];
}

interface RevisionRow {
  plan_id: string;
  version: number;
  revised_by: string;
  operations: string;
}

function fakeDb() {
  const plans = new Map<string, PlanRow>();
  const steps = new Map<string, StepRow[]>();
  const revisions: RevisionRow[] = [];
  let nextPlanOrdinal = 0;

  async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text.startsWith('insert into work_plans (')) {
      nextPlanOrdinal += 1;
      const row: PlanRow = {
        id: `plan-${nextPlanOrdinal}`,
        user_id: params[0] as string,
        run_id: (params[1] as string | null) ?? null,
        conversation_id: (params[2] as string | null) ?? null,
        objective: params[3] as string,
        constraints: (params[4] as string | null) ?? null,
        deliverable: (params[5] as string | null) ?? null,
        version: 1,
        status: 'draft',
      };
      plans.set(row.id, row);
      steps.set(row.id, []);
      return [{ ...row }] as T[];
    }

    if (text.startsWith('select id, user_id, run_id')) {
      const [userId, planId, runId] = params as [string, string | null, string | null];
      const found = [...plans.values()].find(
        (row) =>
          row.user_id === userId &&
          (planId === null || row.id === planId) &&
          (runId === null || row.run_id === runId),
      );
      return (found ? [{ ...found }] : []) as T[];
    }

    if (text.startsWith('select step_id')) {
      const [planId] = params as [string];
      return [...(steps.get(planId) ?? [])]
        .sort((left, right) => left.step_order - right.step_order)
        .map((row) => ({ ...row })) as T[];
    }

    if (text.startsWith('delete from work_plan_steps')) {
      const [planId, , kept] = params as [string, string, string[]];
      steps.set(
        planId,
        (steps.get(planId) ?? []).filter((row) => kept.includes(row.step_id)),
      );
      return [] as T[];
    }

    if (text.startsWith('insert into work_plan_steps')) {
      const [planId, , stepId, order, description, status, dependsOn] = params as [
        string,
        string,
        string,
        number,
        string,
        string,
        string[],
      ];
      const rows = steps.get(planId) ?? [];
      const existing = rows.find((row) => row.step_id === stepId);
      if (existing) {
        existing.step_order = order;
        existing.description = description;
        existing.depends_on = dependsOn;
      } else {
        rows.push({
          step_id: stepId,
          step_order: order,
          description,
          status,
          depends_on: dependsOn,
        });
      }
      steps.set(planId, rows);
      return [] as T[];
    }

    if (text.startsWith('insert into work_plan_revisions')) {
      const [planId, , version, revisedBy, operations] = params as [
        string,
        string,
        number,
        string,
        string,
      ];
      revisions.push({ plan_id: planId, version, revised_by: revisedBy, operations });
      return [] as T[];
    }

    if (text.startsWith('update work_plans set objective')) {
      const [planId, userId, objective, constraints, deliverable, expected] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
        number,
      ];
      const row = plans.get(planId);
      if (!row || row.user_id !== userId || row.version !== expected) return [] as T[];
      row.objective = objective;
      row.constraints = constraints;
      row.deliverable = deliverable;
      row.version += 1;
      return [{ ...row }] as T[];
    }

    if (text.startsWith('update work_plan_steps set status')) {
      const [planId, , stepId, status] = params as [string, string, string, string];
      const row = (steps.get(planId) ?? []).find((candidate) => candidate.step_id === stepId);
      if (row) row.status = status;
      return [] as T[];
    }

    if (text.startsWith('update work_plans set status')) {
      const [planId, userId, status] = params as [string, string, string];
      const row = plans.get(planId);
      if (!row || row.user_id !== userId) return [] as T[];
      const settling = text.includes("status not in ('completed', 'cancelled')");
      if (!settling || (row.status !== 'completed' && row.status !== 'cancelled')) {
        row.status = status;
      }
      return [{ status: row.status }] as T[];
    }

    throw new Error(`unexpected sql: ${text}`);
  }

  const db = {
    query,
    execute: async () => 0,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db),
  } as unknown as DatabaseAdapter;

  return { db, plans, steps, revisions };
}

function plan(overrides: Partial<WorkPlan> = {}): WorkPlan {
  return {
    id: 'plan-1',
    userId: 'user-1',
    runId: null,
    conversationId: null,
    objective: 'Ship the pricing page',
    constraints: null,
    deliverable: null,
    version: 1,
    status: 'draft',
    steps: [
      { id: 'step-1', description: 'Draft copy', status: 'pending', dependsOn: [] },
      { id: 'step-2', description: 'Review copy', status: 'pending', dependsOn: ['step-1'] },
    ],
    ...overrides,
  };
}

function workflowInput(overrides: {
  workMode?: string;
  goal?: unknown;
  runId?: string;
}): CloudAgentWorkflowInput {
  return {
    userId: 'user-1',
    runId: overrides.runId ?? 'run-1',
    processed: {
      conversationId: 'conversation-1',
      chatRequest: {
        work_mode: overrides.workMode ?? 'agiwork',
        agi_work_goal: overrides.goal,
      },
    },
  } as unknown as CloudAgentWorkflowInput;
}

describe('applyWorkPlanRevision', () => {
  it('bumps the version once per revision, whatever the operation count', () => {
    const revised = applyWorkPlanRevision(plan(), [
      { kind: 'add_step', description: 'Publish' },
      { kind: 'revise_objective', objective: 'Ship the pricing page by Friday' },
    ]);

    expect(revised.version).toBe(2);
    expect(revised.objective).toBe('Ship the pricing page by Friday');
    expect(revised.steps.map((step) => step.id)).toEqual(['step-1', 'step-2', 'step-3']);
    expect(
      applyWorkPlanRevision(revised, [{ kind: 'remove_step', stepId: 'step-3' }]).version,
    ).toBe(3);
  });

  it('refuses an order that puts a step before what it depends on', () => {
    expect(() =>
      applyWorkPlanRevision(plan(), [{ kind: 'reorder', stepIds: ['step-2', 'step-1'] }]),
    ).toThrow(/ordered before step-1/);

    const withIndependent = applyWorkPlanRevision(plan(), [
      { kind: 'add_step', description: 'Take screenshots' },
    ]);
    const reordered = applyWorkPlanRevision(withIndependent, [
      { kind: 'reorder', stepIds: ['step-3', 'step-1', 'step-2'] },
    ]);
    expect(reordered.steps.map((step) => step.id)).toEqual(['step-3', 'step-1', 'step-2']);
  });

  it('rejects a reorder that is not a permutation of the plan', () => {
    expect(() => applyWorkPlanRevision(plan(), [{ kind: 'reorder', stepIds: ['step-1'] }])).toThrow(
      /exactly once/,
    );
    expect(() =>
      applyWorkPlanRevision(plan(), [{ kind: 'reorder', stepIds: ['step-1', 'step-1'] }]),
    ).toThrow(/exactly once/);
  });

  it('keeps the dependency graph closed and acyclic', () => {
    expect(() =>
      applyWorkPlanRevision(plan(), [
        { kind: 'revise_step', stepId: 'step-1', dependsOn: ['step-9'] },
      ]),
    ).toThrow(/unknown step step-9/);
    expect(() =>
      applyWorkPlanRevision(plan(), [
        { kind: 'revise_step', stepId: 'step-1', dependsOn: ['step-1'] },
      ]),
    ).toThrow(/depend on itself/);
    expect(() =>
      applyWorkPlanRevision(plan(), [
        { kind: 'revise_step', stepId: 'step-1', dependsOn: ['step-2'] },
      ]),
    ).toThrow(/ordered before step-2/);
  });

  it('protects the record of work already done', () => {
    const started = plan({
      steps: [
        { id: 'step-1', description: 'Draft copy', status: 'completed', dependsOn: [] },
        { id: 'step-2', description: 'Review copy', status: 'pending', dependsOn: ['step-1'] },
      ],
    });
    expect(() =>
      applyWorkPlanRevision(started, [{ kind: 'remove_step', stepId: 'step-1' }]),
    ).toThrow(/cancel it instead/);
    expect(() =>
      applyWorkPlanRevision(started, [
        { kind: 'revise_step', stepId: 'step-1', description: 'Draft better copy' },
      ]),
    ).toThrow(/cannot be revised/);
    expect(() =>
      applyWorkPlanRevision(plan(), [{ kind: 'remove_step', stepId: 'step-1' }]),
    ).toThrow(/step-2 depends on step-1/);
    expect(
      applyWorkPlanRevision(started, [{ kind: 'remove_step', stepId: 'step-2' }]).steps.map(
        (step) => step.id,
      ),
    ).toEqual(['step-1']);
  });

  it('refuses to revise a settled plan, or to revise nothing', () => {
    expect(() =>
      applyWorkPlanRevision(plan({ status: 'completed' }), [
        { kind: 'add_step', description: 'One more' },
      ]),
    ).toThrow(/completed plan cannot be revised/);
    expect(() => applyWorkPlanRevision(plan(), [])).toThrow(WorkPlanRevisionError);
  });
});

describe('plan readiness', () => {
  it('offers only a step whose dependencies are all completed', () => {
    expect(nextRunnableStep(plan())?.id).toBe('step-1');

    const inProgress = plan({
      steps: [
        { id: 'step-1', description: 'Draft copy', status: 'in_progress', dependsOn: [] },
        { id: 'step-2', description: 'Review copy', status: 'pending', dependsOn: ['step-1'] },
      ],
    });
    expect(nextRunnableStep(inProgress)).toBeNull();

    const unblocked = plan({
      steps: [
        { id: 'step-1', description: 'Draft copy', status: 'completed', dependsOn: [] },
        { id: 'step-2', description: 'Review copy', status: 'pending', dependsOn: ['step-1'] },
      ],
    });
    expect(nextRunnableStep(unblocked)?.id).toBe('step-2');
  });

  it('reads the plan status off its steps', () => {
    expect(workPlanStatusFromSteps(plan())).toBe('draft');
    expect(
      workPlanStatusFromSteps(
        plan({
          steps: [{ id: 'step-1', description: 'a', status: 'completed', dependsOn: [] }],
        }),
      ),
    ).toBe('completed');
    expect(
      workPlanStatusFromSteps(
        plan({
          steps: [
            { id: 'step-1', description: 'a', status: 'completed', dependsOn: [] },
            { id: 'step-2', description: 'b', status: 'failed', dependsOn: [] },
          ],
        }),
      ),
    ).toBe('failed');
    expect(
      workPlanStatusFromSteps(
        plan({
          steps: [
            { id: 'step-1', description: 'a', status: 'in_progress', dependsOn: [] },
            { id: 'step-2', description: 'b', status: 'pending', dependsOn: [] },
          ],
        }),
      ),
    ).toBe('active');
  });

  it('names the plan and its version as a context source', () => {
    const source = workPlanContextSource(plan({ version: 4, conversationId: 'conversation-1' }));
    expect(source.sourceClass).toBe('current_task_state');
    expect(source.provenance.locator).toBe('work_plans/plan-1@4');
    expect(source.trust.isInstruction).toBe(true);
  });
});

describe('durable plan persistence', () => {
  it('writes the objective, the steps and one revision row per version', async () => {
    const { db, plans, revisions } = fakeDb();
    const created = await createWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      runId: 'run-1',
      steps: [{ description: 'Draft copy' }, { description: 'Review copy' }],
    });

    expect(created.steps.map((step) => step.description)).toEqual(['Draft copy', 'Review copy']);
    expect(plans.get(created.id)?.objective).toBe('Ship the pricing page');
    expect(revisions).toHaveLength(1);

    const revised = await reviseWorkPlan(db, {
      userId: 'user-1',
      planId: created.id,
      operations: [{ kind: 'add_step', description: 'Publish', dependsOn: ['step-2'] }],
      revisedBy: 'user',
    });

    expect(revised.version).toBe(2);
    expect(revisions.map((row) => row.version)).toEqual([1, 2]);
    expect(revisions[1]?.revised_by).toBe('user');

    const reloaded = await loadWorkPlanForRun(db, { userId: 'user-1', runId: 'run-1' });
    expect(reloaded?.version).toBe(2);
    expect(reloaded?.steps.map((step) => step.id)).toEqual(['step-1', 'step-2', 'step-3']);
    expect(reloaded?.steps[2]?.dependsOn).toEqual(['step-2']);
  });

  it('reorders persisted steps and keeps each step its own status', async () => {
    const { db } = fakeDb();
    const created = await createWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      steps: [
        { description: 'Draft copy' },
        { description: 'Take screenshots' },
        { description: 'Review copy', dependsOn: ['step-1'] },
      ],
    });

    await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created.id,
      stepId: 'step-1',
      transition: 'start',
    });
    await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created.id,
      stepId: 'step-1',
      transition: 'complete',
    });

    const reordered = await reviseWorkPlan(db, {
      userId: 'user-1',
      planId: created.id,
      operations: [{ kind: 'reorder', stepIds: ['step-2', 'step-1', 'step-3'] }],
      revisedBy: 'user',
    });

    expect(reordered.steps.map((step) => step.id)).toEqual(['step-2', 'step-1', 'step-3']);
    expect(reordered.steps.map((step) => step.status)).toEqual(['pending', 'completed', 'pending']);

    const reloaded = await loadWorkPlanForRun(db, { userId: 'user-1', runId: 'run-1' });
    expect(reloaded).toBeNull();
    const byId = await reviseWorkPlan(db, {
      userId: 'user-1',
      planId: created.id,
      operations: [{ kind: 'revise_objective', deliverable: 'A live page' }],
      revisedBy: 'agent',
    });
    expect(byId.version).toBe(3);
    expect(byId.deliverable).toBe('A live page');
  });

  it('refuses a revision prepared against a version that has since moved', async () => {
    const { db } = fakeDb();
    const created = await createWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      steps: [{ description: 'Draft copy' }],
    });
    await reviseWorkPlan(db, {
      userId: 'user-1',
      planId: created.id,
      operations: [{ kind: 'add_step', description: 'Publish' }],
      revisedBy: 'agent',
    });

    await expect(
      reviseWorkPlan(db, {
        userId: 'user-1',
        planId: created.id,
        operations: [{ kind: 'add_step', description: 'Announce' }],
        revisedBy: 'user',
        expectedVersion: created.version,
      }),
    ).rejects.toThrow(/moved to version 2/);
  });

  it('will not start a step whose dependencies have not finished', async () => {
    const { db } = fakeDb();
    const created = await createWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      steps: [{ description: 'Draft copy' }, { description: 'Review copy', dependsOn: ['step-1'] }],
    });

    await expect(
      advanceWorkPlanStep(db, {
        userId: 'user-1',
        planId: created.id,
        stepId: 'step-2',
        transition: 'start',
      }),
    ).rejects.toThrow(/waits for step-1/);

    await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created.id,
      stepId: 'step-1',
      transition: 'start',
    });
    const completed = await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created.id,
      stepId: 'step-1',
      transition: 'complete',
    });
    expect(completed.status).toBe('active');

    const started = await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created.id,
      stepId: 'step-2',
      transition: 'start',
    });
    expect(started.steps[1]?.status).toBe('in_progress');
  });

  it('records the planning turn steps onto a plan opened with only an objective', async () => {
    const { db } = fakeDb();
    const opened = await openWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      runId: 'run-1',
    });
    expect(opened.steps).toEqual([]);
    expect(opened.objective).toBe('Ship the pricing page');

    const filled = await recordWorkPlanSteps(db, {
      userId: 'user-1',
      planId: opened.id,
      descriptions: ['Draft copy', 'Review copy'],
    });
    expect(filled?.version).toBe(2);
    expect(filled?.steps.map((step) => step.description)).toEqual(['Draft copy', 'Review copy']);
    expect(
      await recordWorkPlanSteps(db, { userId: 'user-1', planId: opened.id, descriptions: [] }),
    ).toBeNull();
  });
});

describe('the cloud agent workflow hook', () => {
  beforeEach(() => {
    mockGetNeonDb.mockReset();
  });

  it('opens one plan per run, pinned to the goal the run was given', async () => {
    const { db, plans } = fakeDb();
    mockGetNeonDb.mockReturnValue(db);
    const input = workflowInput({
      goal: { goal: 'Ship the pricing page', constraints: 'No new deps', deliverable: 'A URL' },
    });

    await ensureWorkPlanForRun(input);
    await ensureWorkPlanForRun(input);

    const rows = [...plans.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objective: 'Ship the pricing page',
      constraints: 'No new deps',
      deliverable: 'A URL',
      run_id: 'run-1',
      conversation_id: 'conversation-1',
    });
  });

  it('opens nothing outside AGI Work, and nothing without a parseable goal', async () => {
    const { db, plans } = fakeDb();
    mockGetNeonDb.mockReturnValue(db);

    await ensureWorkPlanForRun(workflowInput({ workMode: 'chat', goal: { goal: 'Anything' } }));
    await ensureWorkPlanForRun(workflowInput({ goal: undefined }));

    expect([...plans.values()]).toHaveLength(0);
  });

  it('closes the plan on the run outcome without overruling what the steps say', async () => {
    const { db, plans } = fakeDb();
    mockGetNeonDb.mockReturnValue(db);
    const input = workflowInput({ goal: { goal: 'Ship the pricing page' } });

    await ensureWorkPlanForRun(input);
    const [created] = [...plans.values()];
    await recordWorkPlanSteps(db, {
      userId: 'user-1',
      planId: created!.id,
      descriptions: ['Draft copy'],
    });
    await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created!.id,
      stepId: 'step-1',
      transition: 'start',
    });
    await advanceWorkPlanStep(db, {
      userId: 'user-1',
      planId: created!.id,
      stepId: 'step-1',
      transition: 'fail',
    });

    await settleWorkPlanForRun(input, 'completed');
    expect(plans.get(created!.id)?.status).toBe('failed');
  });

  it('never lets a plan write end the run', async () => {
    mockGetNeonDb.mockImplementation(() => {
      throw new Error('no database');
    });
    const input = workflowInput({ goal: { goal: 'Ship the pricing page' } });

    await expect(ensureWorkPlanForRun(input)).resolves.toBeUndefined();
    await expect(settleWorkPlanForRun(input, 'failed')).resolves.toBeUndefined();
  });
});
