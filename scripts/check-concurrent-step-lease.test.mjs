import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-concurrent-step-lease.mjs',
);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'step-lease-'));
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

function run(root) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [script, '--root', root], { encoding: 'utf8' }),
    };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const CLAIM = `
export async function claim(db, input) {
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      \`select * from public.cloud_agent_execution_operations
        where run_id = $1 and user_id = $2 and operation_key = $3
        for update\`,
      [input.runId, input.userId, input.operationKey],
    );
    if (!rows[0]) {
      return tx.query(
        \`insert into public.cloud_agent_execution_operations (
           run_id, user_id, operation_key, status, lease_token, lease_expires_at
         ) values ($1, $2, $3, 'running', $4, now() + make_interval(secs => $5))
         returning *\`,
        [input.runId, input.userId, input.operationKey, input.leaseToken, 60],
      );
    }
    return tx.query(
      \`update public.cloud_agent_execution_operations
          set attempt = attempt + 1, lease_token = $3
        where id = $1 and user_id = $2 and status = 'running'
        returning *\`,
      [rows[0].id, input.userId, input.leaseToken],
    );
  });
}
`;

const COMPLETE = `
export function complete(db, input) {
  return db.query(
    \`update public.cloud_agent_execution_operations
        set status = 'completed', lease_token = null
      where id = $1 and user_id = $2 and lease_token = $3 and status = 'running'
      returning *\`,
    [input.operationId, input.userId, input.leaseToken],
  );
}
`;

test('passes a claim that locks the row and a completion that holds the lease', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM,
      'apps/web/lib/services/complete.ts': COMPLETE,
    }),
  );

  assert.equal(result.code, 0);
  assert.match(result.output, /3 step ledger writes/);
});

test('fails a completion that never proves it holds the lease', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM,
      'apps/web/lib/services/complete.ts': `
export function complete(db, input) {
  return db.query(
    \`update public.cloud_agent_execution_operations
        set status = 'completed'
      where id = $1 and user_id = $2\`,
    [input.operationId, input.userId],
  );
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /complete\.ts/);
  assert.match(result.output, /without the lease/);
});

test('does not borrow a row lock from another transaction', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM,
      'apps/web/lib/services/unsafe-transaction.ts': `
export function complete(db, input) {
  return db.transaction(async (tx) => tx.query(
    \`update public.cloud_agent_execution_operations
        set status = 'completed'
      where id = $1 and user_id = $2\`,
    [input.operationId, input.userId],
  ));
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /unsafe-transaction\.ts/);
  assert.match(result.output, /without the lease/);
});

test('fails a claim that writes a running row without minting a lease', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM,
      'apps/web/lib/services/start.ts': `
export function start(db, input) {
  return db.query(
    \`insert into public.cloud_agent_execution_operations (run_id, user_id, operation_key, status)
     values ($1, $2, $3, 'running') returning *\`,
    [input.runId, input.userId, input.operationKey],
  );
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /without minting a lease/);
});

test('accepts settling an operation whose outcome was never observed', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM,
      'apps/web/lib/services/reconcile.ts': `
export function reconcile(db, input) {
  return db.query(
    \`update public.cloud_agent_execution_operations
        set status = $4, lease_token = null
      where run_id = $1 and user_id = $2 and operation_key = $3
        and status = 'outcome_unknown'
      returning *\`,
    [input.runId, input.userId, input.operationKey, input.status],
  );
}
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('fails when the claim path stops locking the ledger row', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/execution.ts': CLAIM.replace('\n        for update', ''),
      'apps/web/lib/services/complete.ts': COMPLETE,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /no longer locks the ledger row/);
});

test('fails when no step ledger write is found at all', () => {
  const result = run(
    fixture({ 'apps/web/lib/services/noop.ts': 'export const noop = () => null;\n' }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /table name is stale/);
});
