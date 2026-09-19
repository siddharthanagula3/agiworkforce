import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-worktask-scope.mjs',
);

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worktask-scope-'));
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

const SCOPED = `
export async function readRun(db, runId, userId) {
  return db.query(
    \`select * from public.cloud_agent_runs where id = $1 and user_id = $2 limit 1\`,
    [runId, userId],
  );
}
`;

test('passes a Work read that names the owner', () => {
  const result = run(fixture({ 'apps/web/lib/services/run.ts': SCOPED }));
  assert.equal(result.code, 0);
  assert.match(result.output, /1 Work task statements/);
});

test('fails a Work read scoped only by run id', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/app/api/runs/route.ts': `
export async function GET(request) {
  return db.query(\`select * from public.cloud_agent_runs where id = $1\`, [request.runId]);
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /app\/api\/runs\/route\.ts/);
  assert.match(result.output, /cloud_agent_runs/);
});

test('fails an insert that never records whose run it is', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/events.ts': `
export function record(db, runId, payload) {
  return db.execute(
    \`insert into public.cloud_agent_events (run_id, payload) values ($1, $2)\`,
    [runId, payload],
  );
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /cloud_agent_events/);
});

test('does not accept a scope column that only appears in the returning list', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/sweep.ts': `
export function sweep(db) {
  return db.query(
    \`update public.cloud_agent_runs set state = 'failed' where state = 'running' returning id, user_id\`,
  );
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /sweep\.ts/);
});

test('ignores test files, which model the boundary rather than cross it', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/run.test.ts': `
it('refuses a foreign run', () => {
  db.query(\`select * from public.cloud_agent_runs where id = $1\`, ['other']);
});
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('accepts a CTE insert whose column list names the owner', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/start.ts': `
export function start(db, input) {
  return db.query(
    \`with inserted as (
       insert into public.cloud_agent_runs (user_id, request_id, state)
       values ($1, $2, 'running')
       on conflict (user_id, request_id) do nothing
       returning *
     )
     select * from inserted\`,
    [input.userId, input.requestId],
  );
}
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('lets the named sweep run unscoped only while it stays bounded', () => {
  const bounded = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/cloud-agent-run-reaper.ts': `
export function reap(db) {
  return db.query(
    \`update public.cloud_agent_runs set state = 'failed'
       where id in (select id from public.cloud_agent_runs
                     where updated_at < now() - make_interval(secs => $1) limit $2)\`,
  );
}
`,
    }),
  );
  assert.equal(bounded.code, 0);

  const unbounded = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/cloud-agent-run-reaper.ts': `
export function reap(db) {
  return db.query(\`update public.cloud_agent_runs set state = 'failed' where state = 'running'\`);
}
`,
    }),
  );
  assert.equal(unbounded.code, 1);
  assert.match(unbounded.output, /unbounded sweep/);
});

test('does not extend the sweep exemption to any other module', () => {
  const result = run(
    fixture({
      'apps/web/lib/services/run.ts': SCOPED,
      'apps/web/lib/services/other-reaper.ts': `
export function reap(db) {
  return db.query(
    \`update public.cloud_agent_runs set state = 'failed'
       where updated_at < now() - make_interval(secs => $1) limit $2\`,
  );
}
`,
    }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /other-reaper\.ts/);
});

test('fails when no Work task statement is found at all', () => {
  const result = run(
    fixture({ 'apps/web/lib/services/noop.ts': 'export const noop = () => null;\n' }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /table list is stale/);
});
