import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  prepareProtocolTypesTarget,
  removeOrphanedCheckoutTargets,
} from './protocol-types-target.mjs';

function fixtureDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'agi-protocol-types-fixture-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const temp = join(directory, 'tmp');
  const checkouts = join(directory, 'checkouts');
  mkdirSync(temp);
  mkdirSync(checkouts);
  return { temp, checkouts };
}

test('a caller that already chose a cargo target folder keeps the build inside it', (t) => {
  const { temp, checkouts } = fixtureDirectory(t);
  const callerTarget = join(checkouts, 'candidate', 'target');

  const targetDir = prepareProtocolTypesTarget({
    repoRoot: join(checkouts, 'candidate'),
    env: { CARGO_TARGET_DIR: callerTarget },
    tmpdir: temp,
  });

  assert.equal(targetDir, join(callerTarget, 'protocol-types'));
  assert.deepEqual(readdirSync(temp), []);
});

test('each checkout reuses one recorded build folder in the temp folder', (t) => {
  const { temp, checkouts } = fixtureDirectory(t);
  const first = join(checkouts, 'first');
  const second = join(checkouts, 'second');
  mkdirSync(first);
  mkdirSync(second);

  const firstTarget = prepareProtocolTypesTarget({ repoRoot: first, env: {}, tmpdir: temp });
  const again = prepareProtocolTypesTarget({ repoRoot: first, env: {}, tmpdir: temp });
  const secondTarget = prepareProtocolTypesTarget({ repoRoot: second, env: {}, tmpdir: temp });

  assert.equal(again, firstTarget);
  assert.notEqual(secondTarget, firstTarget);
  assert.match(firstTarget, /agi-protocol-types-target-[0-9a-f]{12}$/);
  assert.equal(readdirSync(temp).length, 2);
});

test('build folders whose checkout was removed are deleted and all others stay', (t) => {
  const { temp, checkouts } = fixtureDirectory(t);
  const kept = join(checkouts, 'kept');
  const removed = join(checkouts, 'removed');
  mkdirSync(kept);
  mkdirSync(removed);
  const keptTarget = prepareProtocolTypesTarget({ repoRoot: kept, env: {}, tmpdir: temp });
  const removedTarget = prepareProtocolTypesTarget({ repoRoot: removed, env: {}, tmpdir: temp });
  writeFileSync(join(removedTarget, 'build-output'), 'fixture');
  rmSync(removed, { recursive: true });
  const unrecorded = join(temp, 'agi-protocol-types-target-0123456789ab');
  const unrelated = join(temp, 'agi-protocol-types-target-notes');
  mkdirSync(unrecorded);
  mkdirSync(unrelated);

  assert.deepEqual(removeOrphanedCheckoutTargets(temp), [removedTarget]);
  assert.equal(existsSync(removedTarget), false);
  assert.equal(existsSync(keptTarget), true);
  assert.equal(existsSync(unrecorded), true);
  assert.equal(existsSync(unrelated), true);
});

test('preparing any checkout clears build folders left by removed checkouts', (t) => {
  const { temp, checkouts } = fixtureDirectory(t);
  const candidate = join(checkouts, 'run-candidate');
  mkdirSync(candidate);
  const leftover = prepareProtocolTypesTarget({ repoRoot: candidate, env: {}, tmpdir: temp });
  rmSync(candidate, { recursive: true });

  prepareProtocolTypesTarget({
    repoRoot: join(checkouts, 'next'),
    env: { CARGO_TARGET_DIR: join(checkouts, 'next', 'target') },
    tmpdir: temp,
  });

  assert.equal(existsSync(leftover), false);
});
