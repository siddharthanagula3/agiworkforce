import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readIndexedSourceText } from '../retrieval-search-service';

async function capturedSql(): Promise<string> {
  const query = vi.fn(async () => []);
  await readIndexedSourceText(
    { db: { query } as never, userId: 'user-1', organizationId: null, healthSpaceProjectId: null },
    {
      sourceId: '11111111-1111-4111-8111-111111111111',
      kinds: ['library_file'],
      maxChars: 60_000,
    },
  );
  return (query.mock.calls[0] as unknown as [string])[0];
}

/**
 * Walks a `with` list at the top level: every CTE is `name as ( ... )`, and
 * the next token after its closing parenthesis is a comma before another CTE
 * or the final select. The database mocks accept any string, so a missing
 * comma between two CTEs reached production as a syntax error on every call.
 * The text was also run through a real Postgres (PREPARE and EXPLAIN against
 * the retrieval tables) when this test was written.
 */
function cteNames(sql: string): string[] {
  let rest = sql.trim();
  expect(rest.toLowerCase().startsWith('with ')).toBe(true);
  rest = rest.slice(5);
  const names: string[] = [];
  for (;;) {
    const head = /^\s*([a-z_][a-z0-9_]*)\s+as\s*\(/i.exec(rest);
    if (!head) throw new Error(`expected "name as (" at: ${rest.slice(0, 60)}`);
    names.push(head[1]!);
    let depth = 1;
    let index = head[0].length;
    for (; index < rest.length && depth > 0; index += 1) {
      if (rest[index] === '(') depth += 1;
      if (rest[index] === ')') depth -= 1;
    }
    if (depth !== 0) throw new Error(`unbalanced parentheses in CTE ${head[1]}`);
    rest = rest.slice(index).trimStart();
    if (rest.startsWith(',')) {
      rest = rest.slice(1);
      continue;
    }
    if (/^select\b/i.test(rest)) return names;
    throw new Error(`CTE ${head[1]} is followed by "${rest.slice(0, 30)}", not a comma or select`);
  }
}

describe('the open_file query text', () => {
  it('is a well-formed CTE list ending in one select', async () => {
    expect(cteNames(await capturedSql())).toEqual([
      'health_space_documents',
      'ordered',
      'positioned',
    ]);
  });

  it('rejects the missing comma that shipped once', () => {
    expect(() =>
      cteNames('with a as (select 1)\n positioned as (select 2) select * from positioned'),
    ).toThrow(/not a comma or select/);
  });
});
