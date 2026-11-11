import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createRun, recordResult, validatePromptModel } from '../developer-prompt-service';

const PROMPT_ID = '0190a000-0000-7000-8000-0000000000f1';
const RUN_ID = '0190a000-0000-7000-8000-0000000000f2';
const CASE_ID = '0190a000-0000-7000-8000-0000000000c1';

interface Frozen {
  caseIds: string[];
  expected: string | null;
}

function db(
  checkKind: 'exact' | 'contains' | 'none',
  expected: string | null,
  options: { caseUpdatedAt?: string; frozen?: Frozen | null; liveExpected?: string | null } = {},
) {
  const {
    caseUpdatedAt = '2026-10-18T00:00:00Z',
    frozen = null,
    liveExpected = expected,
  } = options;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('from public.developer_eval_runs')) {
      return [
        {
          id: RUN_ID,
          version: 1,
          check_kind: checkKind,
          case_count: 1,
          created_at: '2026-10-19T00:00:00Z',
        },
      ];
    }
    if (sql.includes('from public.developer_eval_results') && sql.includes('select')) return [];
    if (sql.includes('from public.developer_eval_run_cases')) {
      if (!frozen) return [];
      if (!sql.includes('case_id = $3')) return [{ present: 1 }];
      return frozen.caseIds.includes(String(params?.[2]))
        ? [{ expected_output: frozen.expected }]
        : [];
    }
    if (sql.includes('from public.developer_eval_cases'))
      return [{ expected_output: liveExpected, updated_at: caseUpdatedAt }];
    if (sql.includes('insert into public.developer_eval_results')) {
      return [
        {
          id: '0190a000-0000-7000-8000-0000000000d1',
          case_id: CASE_ID,
          rendered_input: params?.[3],
          output: params?.[4],
          error: params?.[5],
          latency_ms: params?.[6],
          input_tokens: params?.[7],
          output_tokens: params?.[8],
          expected_output: params?.[9],
          passed: params?.[10],
          grade: null,
        },
      ];
    }
    return [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
}

const input = {
  caseId: CASE_ID,
  renderedInput: 'Route: Refund',
  output: 'Billing team',
  error: null,
  latencyMs: 10,
  inputTokens: 5,
  outputTokens: 2,
};

describe('developer prompt evaluations', () => {
  it('decides pass or fail on the server from the stored expected output', async () => {
    const contains = await recordResult(
      db('contains', 'billing').db,
      'user_1',
      PROMPT_ID,
      RUN_ID,
      input,
    );
    expect(contains.passed).toBe(true);
    const exact = await recordResult(db('exact', 'Billing').db, 'user_1', PROMPT_ID, RUN_ID, input);
    expect(exact.passed).toBe(false);
    const none = await recordResult(db('none', 'Billing').db, 'user_1', PROMPT_ID, RUN_ID, input);
    expect(none.passed).toBeNull();
  });

  it('grades against the expectation frozen at admission, not the case as it is now', async () => {
    const { db: adapter, query } = db('contains', 'billing', {
      frozen: { caseIds: [CASE_ID], expected: 'billing' },
      liveExpected: 'refunds',
      caseUpdatedAt: '2026-10-19T00:00:01Z',
    });
    const graded = await recordResult(adapter, 'user_1', PROMPT_ID, RUN_ID, input);
    expect(graded.passed).toBe(true);
    expect(graded.expectedOutput).toBe('billing');
    const sqls = query.mock.calls.map(([sql]) => sql as string);
    expect(sqls.some((sql) => sql.includes('from public.developer_eval_cases'))).toBe(false);
  });

  it('refuses a result for a case the run was not admitted with', async () => {
    const { db: adapter, query } = db('contains', 'billing', {
      frozen: { caseIds: ['0190a000-0000-7000-8000-0000000000c9'], expected: 'billing' },
    });
    await expect(recordResult(adapter, 'user_1', PROMPT_ID, RUN_ID, input)).rejects.toThrow(
      'Test case not found',
    );
    const sqls = query.mock.calls.map(([sql]) => sql as string);
    expect(sqls.some((sql) => sql.includes('insert into public.developer_eval_results'))).toBe(
      false,
    );
  });

  it('reports a case deleted since admission as not found instead of failing the insert', async () => {
    const { db: adapter, query } = db('contains', 'billing', {
      frozen: { caseIds: [CASE_ID], expected: 'billing' },
    });
    query.mockImplementationOnce(async () => [
      {
        id: RUN_ID,
        version: 1,
        check_kind: 'contains',
        case_count: 1,
        created_at: '2026-10-19T00:00:00Z',
      },
    ]);
    query.mockImplementationOnce(async () => []);
    query.mockImplementationOnce(async () => [{ expected_output: 'billing' }]);
    query.mockImplementationOnce(async () => {
      throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
    });
    await expect(recordResult(adapter, 'user_1', PROMPT_ID, RUN_ID, input)).rejects.toThrow(
      'Test case not found',
    );
  });

  it('leaves a result of a run admitted before snapshots ungraded once its case was edited', async () => {
    const edited = await recordResult(
      db('contains', 'billing', { caseUpdatedAt: '2026-10-19T00:00:01Z' }).db,
      'user_1',
      PROMPT_ID,
      RUN_ID,
      input,
    );
    expect(edited.passed).toBeNull();
    expect(edited.expectedOutput).toBeNull();
    expect(edited.output).toBe('Billing team');
    const untouched = await recordResult(
      db('contains', 'billing').db,
      'user_1',
      PROMPT_ID,
      RUN_ID,
      input,
    );
    expect(untouched.passed).toBe(true);
    expect(untouched.expectedOutput).toBe('billing');
  });

  it('scopes every read and write to the caller', async () => {
    const { db: adapter, query } = db('contains', 'billing');
    await recordResult(adapter, 'user_1', PROMPT_ID, RUN_ID, input);
    for (const [sql, params] of query.mock.calls as unknown as Array<[string, unknown[]]>) {
      expect(sql).toMatch(/user_id/);
      expect(params).toContain('user_1');
    }
  });

  it('refuses a result with neither output nor error, and an unknown model', async () => {
    await expect(
      recordResult(db('contains', null).db, 'user_1', PROMPT_ID, RUN_ID, {
        ...input,
        output: null,
        error: null,
      }),
    ).rejects.toThrow('A result needs an output or an error.');
    expect(validatePromptModel('auto')).toBe('auto');
    expect(() => validatePromptModel('not-a-model')).toThrow('Pick a model from the list.');
  });
});

describe('starting a developer evaluation run', () => {
  function runDb(caseRows: Array<Record<string, unknown>>) {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('from public.developer_prompt_versions')) return [{ version: 2 }];
      if (sql.includes('from public.developer_eval_cases')) return caseRows;
      if (sql.includes('insert into public.developer_eval_runs')) {
        return [
          {
            id: RUN_ID,
            version: params?.[2],
            check_kind: params?.[3],
            case_count: params?.[4],
            created_at: '2026-10-19T00:00:00Z',
          },
        ];
      }
      return [];
    });
    const execute = vi.fn();
    const adapter = { query, execute } as unknown as DatabaseAdapter;
    const transaction = vi.fn(async (work: (tx: DatabaseAdapter) => Promise<unknown>) =>
      work(adapter),
    );
    return {
      db: { ...(adapter as object), transaction } as unknown as DatabaseAdapter,
      query,
      execute,
      transaction,
    };
  }

  it('returns the exact cases it counted so the run cannot miss one', async () => {
    const rows = [
      { id: CASE_ID, variables: { ticket: 'Refund' }, expected_output: 'Billing', position: 0 },
      {
        id: '0190a000-0000-7000-8000-0000000000c2',
        variables: { ticket: 'Crash' },
        expected_output: 'Support',
        position: 1,
      },
    ];
    const { db: adapter, transaction } = runDb(rows);
    const run = await createRun(adapter, 'user_1', PROMPT_ID, {
      version: 2,
      checkKind: 'contains',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(run.caseCount).toBe(2);
    expect(run.cases.map((entry) => entry.id)).toEqual(rows.map((entry) => entry.id));
    expect(run.cases[1]).toMatchObject({
      variables: { ticket: 'Crash' },
      expectedOutput: 'Support',
    });
  });

  it('freezes the cases it counted in the transaction that creates the run', async () => {
    const rows = [
      { id: CASE_ID, variables: { ticket: 'Refund' }, expected_output: 'Billing', position: 0 },
      {
        id: '0190a000-0000-7000-8000-0000000000c2',
        variables: { ticket: 'Crash' },
        expected_output: null,
        position: 1,
      },
    ];
    const { db: adapter, execute } = runDb(rows);
    const run = await createRun(adapter, 'user_1', PROMPT_ID, {
      version: 2,
      checkKind: 'contains',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.developer_eval_run_cases');
    expect(params[0]).toBe(RUN_ID);
    expect(params[1]).toBe('user_1');
    expect(JSON.parse(String(params[2]))).toEqual(run.cases);
    expect(run.cases).toHaveLength(run.caseCount);
  });

  it('refuses a run with no cases', async () => {
    await expect(
      createRun(runDb([]).db, 'user_1', PROMPT_ID, { version: 2, checkKind: 'contains' }),
    ).rejects.toThrow('Add at least one test case first.');
  });
});
