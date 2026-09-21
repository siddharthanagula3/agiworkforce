import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  POOL_TABLES,
  SURFACE_PREDICATES,
  checkUsagePoolIsShared,
  poolStatements,
  surfaceSplits,
} from './check-usage-pool-is-shared.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'usage-pool-'));
  for (const [name, source] of Object.entries(files)) {
    const full = path.join(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

const SHARED_POOL = `
select coalesce(sum(amount_microusd), 0)::bigint as used_microusd
  from credit_transactions
 where user_id = $1 and transaction_type = 'deduction' and created_at >= $2;
`;

const SPLIT_POOL = `
select coalesce(sum(amount_microusd), 0)::bigint as used_microusd
  from credit_transactions
 where user_id = $1 and source_surface = $3 and created_at >= $2;
`;

test('a rolling window summed per account passes', () => {
  const root = fixture({ 'apps/web/lib/server/rolling.ts': `const sql = \`${SHARED_POOL}\`;` });
  assert.deepEqual(checkUsagePoolIsShared(root).violations, []);
});

test('a rolling window summed per surface fails', () => {
  const root = fixture({ 'apps/web/lib/server/rolling.ts': `const sql = \`${SPLIT_POOL}\`;` });
  const { violations } = checkUsagePoolIsShared(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].predicate, 'source_surface');
  assert.equal(violations[0].file, 'apps/web/lib/server/rolling.ts');
});

test('every declared surface predicate is caught, not only the first', () => {
  for (const predicate of SURFACE_PREDICATES) {
    const sql = `select sum(credits_used_microusd) from token_credits where user_id = $1 and ${predicate} = $2`;
    assert.equal(surfaceSplits(sql).length, 1, predicate);
  }
});

test('an allowance table that only holds a surface column is not a split of the pool', () => {
  const root = fixture({
    'apps/web/db/neon/0001_pool.sql': `
create table public.token_credits (
  user_id text not null,
  source_surface text,
  credits_used_microusd bigint not null default 0
);
`,
  });
  assert.deepEqual(checkUsagePoolIsShared(root).violations, []);
});

test('a comment naming a surface is not a predicate', () => {
  const sql = `-- source_surface is deliberately not consulted here
select sum(amount_microusd) from credit_transactions where user_id = $1`;
  assert.deepEqual(surfaceSplits(sql), []);
});

test('a statement that names no pool table is not examined', () => {
  assert.deepEqual(poolStatements('select * from conversations where source_surface = $1'), []);
});

test('both pool tables are covered', () => {
  for (const table of POOL_TABLES) {
    const sql = `select sum(x) from ${table} where user_id = $1 and client_type = $2`;
    assert.equal(surfaceSplits(sql).length, 1, table);
  }
});
