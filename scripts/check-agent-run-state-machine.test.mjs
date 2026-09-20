import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  MIGRATIONS_DIR,
  REAPER_PATH,
  REPO_ROOT,
  SERVICE_PATH,
  checkAgentRunStateMachine,
  readSqlStates,
  readVocabulary,
  runStateWrites,
} from './check-agent-run-state-machine.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const CREATE = `
create table public.cloud_agent_runs (
  id uuid primary key,
  state text not null default 'queued' check (
    state in ('queued', 'running', 'completed', 'cancelled')
  )
);
`;

const WIDEN = `
alter table public.cloud_agent_runs
  add constraint cloud_agent_runs_state_check check (
    state in ('queued', 'running', 'completed', 'cancelled', 'planning', 'paused')
  );
`;

const CONTRACT = `
export const AGENT_TASK_STATE_LABELS: Readonly<Record<AgentTaskState, string>> = Object.freeze({
  queued: 'Queued',
  running: 'Working',
  completed: 'Completed',
  cancelled: 'Cancelled',
  planning: 'Planning',
  paused: 'Paused',
});

export const TERMINAL_AGENT_TASK_STATES: ReadonlySet<AgentTaskState> = new Set<AgentTaskState>([
  'completed',
  'cancelled',
]);
`;

const SERVICE = `
export const EXECUTOR_HELD_TASK_STATES: readonly AgentTaskState[] = Object.freeze([
  'queued',
  'planning',
  'running',
]);

export const HUMAN_HELD_TASK_STATES: readonly AgentTaskState[] = Object.freeze(['paused']);

const RUN_HAS_NOT_ENDED = 'state <> all($3::text[])';

const park = \`update public.cloud_agent_runs
    set state = 'paused', updated_at = now()
  where id = $1 and user_id = $2 and \${RUN_HAS_NOT_ENDED}\`;

const settle = \`update public.cloud_agent_runs
    set state = 'completed', updated_at = now()
  where id = $1 and user_id = $2\`;
`;

const REAPER = `
import { EXECUTOR_HELD_TASK_STATES } from './cloud-agent-run-service';
const REAPABLE_STATE_VALUES = [...EXECUTOR_HELD_TASK_STATES];
const sweep = 'update public.cloud_agent_runs set state = \\'failed\\' where state = any($3::text[])';
`;

function fixture(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-run-state-'));
  roots.push(root);
  write(root, path.join(MIGRATIONS_DIR, '0061_cloud_agent_runs.sql'), overrides.create ?? CREATE);
  write(root, path.join(MIGRATIONS_DIR, '0196_work_states.sql'), overrides.widen ?? WIDEN);
  write(root, CONTRACT_PATH, overrides.contract ?? CONTRACT);
  write(root, SERVICE_PATH, overrides.service ?? SERVICE);
  write(root, REAPER_PATH, overrides.reaper ?? REAPER);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('reads the states from the newest constraint, not the one that created the table', () => {
  const { states, source } = readSqlStates(fixture());
  assert.deepEqual(states, ['queued', 'running', 'completed', 'cancelled', 'planning', 'paused']);
  assert.equal(source, '0196_work_states.sql');
});

test('reads the declared vocabulary and every classification', () => {
  const vocabulary = readVocabulary(fixture());
  assert.deepEqual(vocabulary.terminal, ['completed', 'cancelled']);
  assert.deepEqual(vocabulary.executorHeld, ['queued', 'planning', 'running']);
  assert.deepEqual(vocabulary.humanHeld, ['paused']);
  assert.equal(vocabulary.declared.length, 6);
});

test('passes on a tree where every declared state is classified once', () => {
  const { errors } = checkAgentRunStateMachine(fixture());
  assert.deepEqual(errors, []);
});

test('fails when a state the database stores is left unclassified', () => {
  const service = SERVICE.replace("  'planning',\n", '');
  const { errors } = checkAgentRunStateMachine(fixture({ service }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /planning is neither an ending/);
});

test('fails when the sweep names a live state instead of reading the classification', () => {
  const reaper = REAPER.replace('state = any($3::text[])', "state in ('queued', 'running')");
  const { errors } = checkAgentRunStateMachine(fixture({ reaper }));
  assert.ok(errors.some((error) => /names queued directly/.test(error)));
  assert.ok(errors.some((error) => /names running directly/.test(error)));
});

test('fails when the sweep stops reading the classification at all', () => {
  const reaper = 'const REAPABLE_STATE_VALUES = [];';
  const { errors } = checkAgentRunStateMachine(fixture({ reaper }));
  assert.ok(errors.some((error) => /does not sweep from EXECUTOR_HELD_TASK_STATES/.test(error)));
});

test('fails when a declared state cannot be stored by the database', () => {
  const contract = CONTRACT.replace('  paused:', "  timed_out: 'Timed out',\n  paused:");
  const { errors } = checkAgentRunStateMachine(fixture({ contract }));
  assert.ok(errors.some((error) => /timed_out is a declared task state/.test(error)));
});

test('fails when the database stores a state the contract never declared', () => {
  const widen = WIDEN.replace("'paused'", "'paused', 'archived'");
  const { errors } = checkAgentRunStateMachine(fixture({ widen }));
  assert.ok(errors.some((error) => /archived is stored by the database/.test(error)));
});

test('fails when one state is claimed by two holders', () => {
  const service = SERVICE.replace(
    "Object.freeze(['paused'])",
    "Object.freeze(['paused', 'running'])",
  );
  const { errors } = checkAgentRunStateMachine(fixture({ service }));
  assert.ok(errors.some((error) => /running is classified twice/.test(error)));
});

test('reads the state a statement writes and whether it refuses an ended run', () => {
  const writes = runStateWrites(SERVICE);
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((write) => [write.target, write.guarded]),
    [
      ['paused', true],
      ['completed', false],
    ],
  );
});

test('lets a statement write an ending without a guard, since an ending is not a restart', () => {
  const { errors } = checkAgentRunStateMachine(fixture());
  assert.deepEqual(errors, []);
});

test('fails when a statement parks an ended run back into live work', () => {
  const service = SERVICE.replace(' and ${RUN_HAS_NOT_ENDED}', '');
  const { errors } = checkAgentRunStateMachine(fixture({ service }));
  assert.ok(errors.some((error) => /setting cloud_agent_runs\.state to paused/.test(error)));
});

test('the repository itself satisfies the guard', () => {
  const { errors } = checkAgentRunStateMachine(REPO_ROOT);
  assert.deepEqual(errors, []);
});
