import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BACKGROUND_DIR,
  DRAIN_PATH,
  REPO_ROOT,
  ROUTE_DIR,
  STORE_PATH,
  checkImageJobTermination,
  readTerminalTransitions,
} from './check-image-job-termination.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const STORE_SOURCE = `
export async function completeImageGenerationJob(input) {
  return input.db.query(\`update public.image_generation_jobs
    set status = 'completed', terminal_at = now() where id = $1\`);
}

export async function failImageGenerationJob(input) {
  return input.db.query(\`update public.image_generation_jobs
    set status = 'failed', terminal_at = now() where id = $1\`);
}

export async function closeCancelledImageGenerationJob(input) {
  return input.db.query(\`update public.image_generation_jobs
    set status = 'canceled', terminal_at = now() where id = $1\`);
}

export async function requeueImageGenerationJob(input) {
  return input.db.query(\`update public.image_generation_jobs
    set status = 'queued' where id = $1\`);
}
`;

function tree({ cancelCloserInBackground }) {
  const root = mkdtempSync(path.join(tmpdir(), 'image-job-termination-'));
  roots.push(root);
  write(root, STORE_PATH, STORE_SOURCE);
  write(
    root,
    `${BACKGROUND_DIR}/image-job-executor.ts`,
    `import { completeImageGenerationJob, failImageGenerationJob${
      cancelCloserInBackground ? ', closeCancelledImageGenerationJob' : ''
    } } from '@/lib/server/image-generation-jobs';
export async function runImageGenerationJobAttempt() {
  await completeImageGenerationJob({});
  await failImageGenerationJob({});
}
${
  cancelCloserInBackground
    ? 'export async function reconcileCancelledImageGenerationJob() { await closeCancelledImageGenerationJob({}); }'
    : ''
}
`,
  );
  write(
    root,
    DRAIN_PATH,
    cancelCloserInBackground
      ? `import { reconcileCancelledImageGenerationJob } from './image-job-executor';
export async function driveImageGenerationJob() { await reconcileCancelledImageGenerationJob(); }`
      : `export async function driveImageGenerationJob() { return { skipped: 'cancelled' }; }`,
  );
  write(
    root,
    `${ROUTE_DIR}/cancel/route.ts`,
    cancelCloserInBackground
      ? `import { reconcileCancelledImageGenerationJob } from '../lib/image-job-executor';
export async function POST() { await reconcileCancelledImageGenerationJob(); }`
      : `import { closeCancelledImageGenerationJob } from '@/lib/server/image-generation-jobs';
export async function POST() { await closeCancelledImageGenerationJob({}); }`,
  );
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('every ending the store declares is read from its own SQL', () => {
  assert.deepEqual(readTerminalTransitions(STORE_SOURCE), [
    'closeCancelledImageGenerationJob',
    'completeImageGenerationJob',
    'failImageGenerationJob',
  ]);
});

test('a tree whose endings all run off the request path passes', () => {
  assert.deepEqual(checkImageJobTermination(tree({ cancelCloserInBackground: true })), []);
});

test('an ending only a route can reach is refused, and names the route', () => {
  const failures = checkImageJobTermination(tree({ cancelCloserInBackground: false }));
  assert.ok(
    failures.some(
      (failure) =>
        failure.includes('closeCancelledImageGenerationJob') && failure.includes('cancel/route.ts'),
    ),
    failures.join('\n'),
  );
});

test('a drain that skips a cancellation instead of finishing it is refused', () => {
  const root = tree({ cancelCloserInBackground: false });
  assert.ok(
    checkImageJobTermination(root).some((failure) =>
      failure.includes('does not finish a cancellation'),
    ),
  );
});

test('a missing store is a failure rather than a pass', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'image-job-termination-empty-'));
  roots.push(root);
  assert.ok(checkImageJobTermination(root).some((failure) => failure.includes('is missing')));
});

test('the repository itself passes', () => {
  assert.deepEqual(checkImageJobTermination(REPO_ROOT), []);
});
