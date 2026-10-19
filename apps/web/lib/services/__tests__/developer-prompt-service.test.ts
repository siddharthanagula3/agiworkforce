import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { recordResult, validatePromptModel } from '../developer-prompt-service';

const PROMPT_ID = '0190a000-0000-7000-8000-0000000000f1';
const RUN_ID = '0190a000-0000-7000-8000-0000000000f2';
const CASE_ID = '0190a000-0000-7000-8000-0000000000c1';

function db(checkKind: 'exact' | 'contains' | 'none', expected: string | null) {
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
    if (sql.includes('from public.developer_eval_cases')) return [{ expected_output: expected }];
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
          passed: params?.[9],
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
