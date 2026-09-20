import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  APP_DIR,
  QUOTA_PATH,
  REPO_ROOT,
  checkVoiceSessionMetering,
  readMeteredOperations,
  readSettlements,
} from './check-voice-session-metering.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const QUOTA_SOURCE = `
const TRANSCRIPTION_OPERATION = 'transcription';
const LIVE_VOICE_SESSION_OPERATION = 'voice_live_session';

const CONSUMPTION_QUERIES = Object.freeze({
  voice_minutes: {
    sql: \`select coalesce(sum(
              case
                when usage->>'operation' = '\${TRANSCRIPTION_OPERATION}'
                then (usage->>'estimatedAudioSeconds')::double precision
                when usage->>'operation' = '\${LIVE_VOICE_SESSION_OPERATION}'
                then (usage->>'billedSeconds')::double precision
                else 0 end
            ), 0) as consumed\`,
    toUnits: (raw) => raw,
  },
});
`;

function closeRoute({ carriesBilled }) {
  return `
export async function POST() {
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    usage: {
      operation: 'voice_live_session',
      sessionId,
      ${carriesBilled ? 'billedSeconds,' : 'sessionSeconds,'}
    },
  });
}
`;
}

function createRoute({ carriesBilled }) {
  return `
export async function POST() {
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'failed',
    actualCostCents: 0,
    usage: { operation: 'voice_live_session', reason${carriesBilled ? ', billedSeconds' : ''} },
  });
}
`;
}

const TRANSCRIBE_ROUTE = `
export async function POST() {
  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: 'completed',
    usage: { operation: 'transcription', estimatedAudioSeconds: estimatedSeconds },
  });
}
`;

function tree({ closeCarriesBilled = true, releaseCarriesBilled = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'voice-metering-'));
  roots.push(root);
  write(root, QUOTA_PATH, QUOTA_SOURCE);
  write(
    root,
    `${APP_DIR}/voice/live/sessions/[sessionId]/close/route.ts`,
    closeRoute({ carriesBilled: closeCarriesBilled }),
  );
  write(
    root,
    `${APP_DIR}/voice/live/sessions/route.ts`,
    createRoute({ carriesBilled: releaseCarriesBilled }),
  );
  write(root, `${APP_DIR}/llm/v1/audio/transcriptions/route.ts`, TRANSCRIBE_ROUTE);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the counted operations and their fields come from the quota query', () => {
  assert.deepEqual(readMeteredOperations(QUOTA_SOURCE), [
    { operation: 'transcription', field: 'estimatedAudioSeconds' },
    { operation: 'voice_live_session', field: 'billedSeconds' },
  ]);
});

test('a settlement is read with the outcome it carries', () => {
  const settlements = readSettlements(closeRoute({ carriesBilled: true }));
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].outcome, 'completed');
  assert.match(settlements[0].usage, /voice_live_session/);
});

test('a tree that writes the summed field on every finished session passes', () => {
  assert.deepEqual(checkVoiceSessionMetering(tree()), []);
});

test('a finished session settled without the summed field is refused', () => {
  const failures = checkVoiceSessionMetering(tree({ closeCarriesBilled: false }));
  assert.ok(
    failures.some((failure) => failure.includes('without billedSeconds')),
    failures.join('\n'),
  );
});

test('a released session that spends the allowance is refused', () => {
  const failures = checkVoiceSessionMetering(tree({ releaseCarriesBilled: true }));
  assert.ok(
    failures.some((failure) => failure.includes('a refused session spends the allowance')),
    failures.join('\n'),
  );
});

test('an operation the allowance counts that nothing settles is refused', () => {
  const root = tree();
  rmSync(path.join(root, `${APP_DIR}/llm`), { recursive: true, force: true });
  assert.ok(
    checkVoiceSessionMetering(root).some((failure) => failure.includes('settles transcription')),
  );
});

test('the repository itself passes', () => {
  assert.deepEqual(checkVoiceSessionMetering(REPO_ROOT), []);
});
