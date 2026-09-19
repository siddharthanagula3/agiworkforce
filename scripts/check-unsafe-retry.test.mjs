import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'check-unsafe-retry.mjs');
const CLAIM_PATH = 'apps/web/lib/services/cloud-agent-execution-service.ts';

const CLAIM_SOURCE = `
const MAX_OPERATION_REPLAY_ATTEMPTS = 3;
export const OPERATION_REPLAY_LIMIT_CODE = 'operation_replay_limit';
export async function claimCloudAgentExecutionOperation(db, input) {
  if (input.attempt >= MAX_OPERATION_REPLAY_ATTEMPTS) {
    return { code: OPERATION_REPLAY_LIMIT_CODE };
  }
  if (input.retrySafety === 'unsafe') {
    return db.query(
      \`update public.cloud_agent_execution_operations set status = 'outcome_unknown'
        where id = $1 and user_id = $2 and status = 'running' returning *\`,
    );
  }
  return null;
}
`;

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unsafe-retry-'));
  for (const [relative, source] of Object.entries({ [CLAIM_PATH]: CLAIM_SOURCE, ...files })) {
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

test('passes a caller that states its retry safety', () => {
  const result = run(
    fixture({
      'apps/web/lib/workflows/step.ts': `
export function runTool(db, input) {
  return executeCloudAgentOperation(db, {
    userId: input.userId,
    operationKind: 'tool',
    retrySafety: 'unsafe',
    execute: input.execute,
  });
}
`,
    }),
  );

  assert.equal(result.code, 0);
  assert.match(result.output, /1 Work operation executions/);
});

test('accepts the shorthand property a forwarding wrapper uses', () => {
  const result = run(
    fixture({
      'apps/web/lib/workflows/step.ts': `
export function runTool(db, input, retrySafety) {
  return executeCloudAgentOperation(db, { userId: input.userId, retrySafety, execute: input.run });
}
`,
    }),
  );

  assert.equal(result.code, 0);
});

test('fails a caller that runs an external step without stating retry safety', () => {
  const result = run(
    fixture({
      'apps/web/lib/workflows/step.ts': `
export function runTool(db, input) {
  return executeCloudAgentOperation(db, { userId: input.userId, execute: input.execute });
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /without stating its retry safety/);
});

test('fails a module that re-arms an operation outside the claim path', () => {
  const result = run(
    fixture({
      'apps/web/lib/workflows/step.ts': `
export function runTool(db, input) {
  return executeCloudAgentOperation(db, { retrySafety: 'safe', execute: input.execute });
}
`,
      'apps/web/lib/workflows/retry.ts': `
export function rearm(db, id, userId) {
  return db.query(
    \`update public.cloud_agent_execution_operations set status = 'running' where id = $1 and user_id = $2\`,
    [id, userId],
  );
}
`,
    }),
  );

  assert.equal(result.code, 1);
  assert.match(result.output, /re-arms an operation outside the claim path/);
});

test('fails when the claim path drops its replay bound', () => {
  const root = fixture({
    'apps/web/lib/workflows/step.ts': `
export function runTool(db, input) {
  return executeCloudAgentOperation(db, { retrySafety: 'safe', execute: input.execute });
}
`,
  });
  fs.writeFileSync(
    path.join(root, CLAIM_PATH),
    CLAIM_SOURCE.replace(/MAX_OPERATION_REPLAY_ATTEMPTS/g, 'NO_LIMIT'),
  );

  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /replay attempt bound/);
});

test('fails when the claim path stops parking an unknown outcome', () => {
  const root = fixture({
    'apps/web/lib/workflows/step.ts': `
export function runTool(db, input) {
  return executeCloudAgentOperation(db, { retrySafety: 'safe', execute: input.execute });
}
`,
  });
  fs.writeFileSync(
    path.join(root, CLAIM_PATH),
    CLAIM_SOURCE.replace(/'outcome_unknown'/g, "'running'"),
  );

  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /outcome-unknown parking state/);
});

test('fails when the claim path is gone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unsafe-retry-empty-'));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /claim path moved/);
});
