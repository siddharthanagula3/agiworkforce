import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { isProtectedCleanupPath, TRACKED_STALE } from './clean-repo.mjs';

const cleanupScript = fileURLToPath(new URL('./clean-repo.mjs', import.meta.url));

test('the live audit evidence ledger is protected from cleanup', () => {
  assert.equal(isProtectedCleanupPath('audit'), true);
  assert.equal(isProtectedCleanupPath('audit/inventory.json'), true);
  assert.equal(
    TRACKED_STALE.some((candidate) => candidate === 'audit' || candidate.startsWith('audit/')),
    false,
  );
});

test('dry-run and apply both preserve the live audit evidence ledger', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-repo-audit-'));
  const inventoryPath = path.join(fixtureRoot, 'audit', 'inventory.json');
  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
  fs.writeFileSync(inventoryPath, '{}\n');
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  for (const args of [[], ['--apply']]) {
    const result = spawnSync(process.execPath, [cleanupScript, ...args], {
      cwd: fixtureRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(inventoryPath), true);
    assert.doesNotMatch(result.stdout, /(?:git rm -r|removing) audit(?:\s|$)/);
  }
});
