import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXECUTOR_PATH,
  MIGRATIONS_DIR,
  REPO_ROOT,
  STORE_PATH,
  checkImageJobStates,
  readSqlStatuses,
  readTerminalShape,
} from './check-image-job-states.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function migration({ statuses, classified }) {
  return `
create table if not exists public.image_generation_jobs (
  id uuid primary key,
  status text not null default 'queued'
    check (status = any (array[${statuses.map((status) => `'${status}'`).join(', ')}])),
  terminal_at timestamptz,
  constraint image_generation_jobs_terminal_shape check (
${classified
  .map(
    (entry) =>
      `    (status = '${entry.status}' and terminal_at is ${entry.terminal ? 'not null' : 'null'})`,
  )
  .join('\n    or\n')}
  )
);
`;
}

function store(statuses) {
  return `
export type ImageJobStatus = ${statuses.map((status) => `'${status}'`).join(' | ')};

export async function failImageGenerationJob() {
  await db.query(\`update public.image_generation_jobs set status = 'failed' where id = $1\`);
}
`;
}

function executor(statuses) {
  return `
export type PublicImageJobStatus = ${statuses.map((status) => `'${status}'`).join(' | ')};
`;
}

const STATUSES = ['queued', 'processing', 'completed', 'failed', 'canceled'];
const CLASSIFIED = STATUSES.map((status) => ({
  status,
  terminal: status !== 'queued' && status !== 'processing',
}));

function makeRoot({
  sqlStatuses = STATUSES,
  classified = CLASSIFIED,
  storeStatuses = STATUSES,
  publicStatuses = STATUSES,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'image-job-states-'));
  roots.push(root);
  write(
    root,
    path.join(MIGRATIONS_DIR, '0001_durable_image_generation_jobs.sql'),
    migration({ statuses: sqlStatuses, classified }),
  );
  write(root, STORE_PATH, store(storeStatuses));
  write(root, EXECUTOR_PATH, executor(publicStatuses));
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('agreeing copies pass', () => {
  assert.deepEqual(checkImageJobStates(makeRoot()), []);
});

test('a status the snapshot type never learned is reported', () => {
  const failures = checkImageJobStates(
    makeRoot({ publicStatuses: STATUSES.filter((status) => status !== 'canceled') }),
  );
  assert.ok(
    failures.some((failure) => failure === 'the public snapshot type is missing canceled'),
    failures.join('; '),
  );
});

test('a status the store invents beyond the schema is reported', () => {
  const failures = checkImageJobStates(
    makeRoot({ storeStatuses: [...STATUSES, 'moderated'], sqlStatuses: STATUSES }),
  );
  assert.ok(
    failures.some((failure) => failure.includes('declares moderated, which SQL refuses')),
    failures.join('; '),
  );
});

test('a status no clause says how to end is reported', () => {
  const failures = checkImageJobStates(
    makeRoot({
      sqlStatuses: [...STATUSES, 'refused'],
      storeStatuses: [...STATUSES, 'refused'],
      publicStatuses: [...STATUSES, 'refused'],
    }),
  );
  assert.ok(
    failures.some((failure) => failure.includes('does not say when refused is over')),
    failures.join('; '),
  );
});

test('the newest migration wins when a later one widens the vocabulary', () => {
  const root = makeRoot();
  write(
    root,
    path.join(MIGRATIONS_DIR, '0002_widen_image_generation_jobs.sql'),
    `
alter table public.image_generation_jobs
  add constraint image_generation_jobs_status_check check (
    status = any (array['queued', 'processing', 'completed', 'failed', 'canceled', 'refused'])
  );
`,
  );
  assert.deepEqual(readSqlStatuses(root), [...STATUSES, 'refused'].sort());
  const failures = checkImageJobStates(root);
  assert.ok(
    failures.some((failure) => failure.includes('is missing refused')),
    failures.join('; '),
  );
});

test('the checked-in image job vocabulary agrees', () => {
  assert.deepEqual(checkImageJobStates(REPO_ROOT), []);
  const { terminal } = readTerminalShape(REPO_ROOT);
  assert.ok(terminal.includes('completed') && terminal.includes('canceled'));
});
