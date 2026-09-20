import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditAppendOnly,
  committedLock,
  digestsOf,
  LOCK_FILE,
} from './lib/prompt-versions-append-only.mjs';

const PUBLISHED = { 'chat.system@1': 'sha256:aaa', 'chat.system@2': 'sha256:bbb' };

function lockSource(digests) {
  return `${JSON.stringify({ schemaVersion: 1, digests }, null, 2)}\n`;
}

function repository(digests) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-versions-'));
  const file = path.join(root, LOCK_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lockSource(digests));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '--quiet');
  git('config', 'user.email', 'guard@example.test');
  git('config', 'user.name', 'guard');
  git('add', LOCK_FILE);
  git('commit', '--quiet', '-m', 'publish');
  return root;
}

test('reads the lock as it was committed, and says so when there is none', () => {
  const root = repository(PUBLISHED);

  assert.deepEqual(digestsOf(committedLock(root)), PUBLISHED);
  assert.equal(committedLock(root, 'HEAD', 'apps/web/lib/prompts/absent.json'), null);
  assert.equal(committedLock(fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'))), null);
});

test('a lock that parses to no digest is a broken instrument, not an empty lock', () => {
  assert.throws(() => digestsOf(lockSource({})), /measuring nothing/u);
  assert.throws(() => digestsOf('{"schemaVersion":1}'), /measuring nothing/u);
});

test('adding a version passes', () => {
  const verdict = auditAppendOnly(PUBLISHED, { ...PUBLISHED, 'chat.system@3': 'sha256:ccc' });

  assert.equal(verdict.passed, true);
  assert.equal(verdict.added, 1);
  assert.equal(verdict.published, 2);
});

test('rewriting a published version fails even though the lock agrees with itself', () => {
  const verdict = auditAppendOnly(PUBLISHED, { ...PUBLISHED, 'chat.system@1': 'sha256:zzz' });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /chat\.system@1 was published as sha256:aaa/u);
});

test('dropping a published version fails', () => {
  const verdict = auditAppendOnly(PUBLISHED, { 'chat.system@2': 'sha256:bbb' });

  assert.equal(verdict.passed, false);
  assert.match(verdict.problems.join('\n'), /chat\.system@1 was published and has been dropped/u);
});

test('the repository is append-only against its own HEAD', () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const committed = committedLock(repoRoot);
  if (committed === null) return;

  const current = digestsOf(fs.readFileSync(path.join(repoRoot, LOCK_FILE), 'utf8'));
  assert.deepEqual(auditAppendOnly(digestsOf(committed), current).problems, []);
});
