import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetNeonDb } = vi.hoisted(() => ({ mockGetNeonDb: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  createWorkPlan,
  loadWorkPlanForRun,
  openWorkPlan,
  workPlanStatusFromSteps,
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

describe('plan readiness', () => {
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
});

describe('durable plan persistence', () => {
  it('writes the objective, the steps and one revision row', async () => {
    const { db, plans, revisions } = fakeDb();
    const created = await createWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      runId: 'run-1',
      steps: [{ description: 'Draft copy' }, { description: 'Review copy', dependsOn: ['step-1'] }],
    });

    expect(created.steps.map((step) => step.description)).toEqual(['Draft copy', 'Review copy']);
    expect(plans.get(created.id)?.objective).toBe('Ship the pricing page');
    expect(revisions).toHaveLength(1);

    const reloaded = await loadWorkPlanForRun(db, { userId: 'user-1', runId: 'run-1' });
    expect(reloaded?.version).toBe(1);
    expect(reloaded?.steps.map((step) => step.id)).toEqual(['step-1', 'step-2']);
    expect(reloaded?.steps[1]?.dependsOn).toEqual(['step-1']);
  });

  it('refuses a plan whose steps depend on a step that does not exist', async () => {
    const { db } = fakeDb();
    await expect(
      createWorkPlan(db, {
        userId: 'user-1',
        objective: 'Ship the pricing page',
        steps: [{ description: 'Review copy', dependsOn: ['step-9'] }],
      }),
    ).rejects.toThrow(/depends on unknown step step-9/);
  });

  it('opens a plan with only an objective and one revision row', async () => {
    const { db, revisions } = fakeDb();
    const opened = await openWorkPlan(db, {
      userId: 'user-1',
      objective: 'Ship the pricing page',
      runId: 'run-1',
    });
    expect(opened.steps).toEqual([]);
    expect(opened.objective).toBe('Ship the pricing page');
    expect(revisions.map((row) => row.version)).toEqual([1]);
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

  it('closes the plan on the run outcome and never reopens a settled one', async () => {
    const { db, plans } = fakeDb();
    mockGetNeonDb.mockReturnValue(db);
    const input = workflowInput({ goal: { goal: 'Ship the pricing page' } });

    await ensureWorkPlanForRun(input);
    const [created] = [...plans.values()];
    await settleWorkPlanForRun(input, 'completed');
    expect(plans.get(created!.id)?.status).toBe('completed');

    await settleWorkPlanForRun(input, 'failed');
    expect(plans.get(created!.id)?.status).toBe('completed');
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
