import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scanScript = fileURLToPath(new URL('./scan-skills-with-vetting.mjs', import.meta.url));

function fixture(t, scannerBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-vetting-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const packageDir = path.join(root, 'skill');
  fs.mkdirSync(packageDir);
  fs.writeFileSync(path.join(packageDir, 'SKILL.md'), '# fixture\n');

  const scanner = path.join(root, 'fake-skillspector');
  fs.writeFileSync(scanner, scannerBody, { mode: 0o755 });
  return { packageDir, scanner };
}

// A skill that stalls the scanner must fail the gate, not stall it: the vetting
// job otherwise hangs until the workflow timeout and produces no verdict at all.
test('a scanner that hangs on a package fails the gate instead of hanging it', (t) => {
  const { packageDir, scanner } = fixture(t, '#!/bin/sh\nsleep 120\n');

  const result = spawnSync(process.execPath, [scanScript, packageDir], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      SKILLSPECTOR_BIN: scanner,
      SKILL_VETTING_SCAN_TIMEOUT_MS: '2000',
    },
  });

  assert.equal(result.signal, null, 'the gate had to be killed instead of exiting on its own');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /timed out after 2000ms/);
  assert.match(result.stderr, /Skill vetting failed for 1 package/);
});

test('a nonzero scanner exit still reads the verdict from the written report', (t) => {
  const { packageDir, scanner } = fixture(
    t,
    '#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\n' +
      'printf \'{"risk_score":90,"risk_assessment":{"recommendation":"DO_NOT_INSTALL"}}\' > "$2"\n' +
      'exit 1\n',
  );

  const result = spawnSync(process.execPath, [scanScript, packageDir], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, SKILLSPECTOR_BIN: scanner },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /DO_NOT_INSTALL \(risk score 90\)/);
  assert.doesNotMatch(result.stderr, /timed out/);
});

test('a clean package passes the gate', (t) => {
  const { packageDir, scanner } = fixture(
    t,
    '#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\n' +
      'printf \'{"risk_score":3,"risk_assessment":{"recommendation":"SAFE"}}\' > "$2"\n',
  );

  const result = spawnSync(process.execPath, [scanScript, packageDir], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, SKILLSPECTOR_BIN: scanner },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SAFE \(risk score 3\)/);
});
