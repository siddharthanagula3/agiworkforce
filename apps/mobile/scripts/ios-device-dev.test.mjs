import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ios-device-dev.sh');

function runScript({ skipReset = false } = {}) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-ios-dev-'));
  const binDir = path.join(sandbox, 'bin');
  const derivedData = path.join(sandbox, 'DerivedData');
  const log = path.join(sandbox, 'commands.log');

  fs.mkdirSync(binDir);
  fs.mkdirSync(derivedData, { recursive: true });
  fs.mkdirSync(path.join(derivedData, 'AGIWorkforce-abcdef'), { recursive: true });
  fs.mkdirSync(path.join(derivedData, 'SomeOtherApp-123456'), { recursive: true });

  fs.writeFileSync(
    path.join(binDir, 'pnpm'),
    `#!/usr/bin/env bash\necho "pnpm $*" >> "${log}"\nls -d "${derivedData}"/AGIWorkforce-* >> "${log}" 2>&1 || echo "no-derived-data" >> "${log}"\n`,
    { mode: 0o755 },
  );
  for (const stub of ['security', 'xcrun', 'tee']) {
    fs.writeFileSync(
      path.join(binDir, stub),
      '#!/usr/bin/env bash\ncat >/dev/null 2>&1 || true\n',
      {
        mode: 0o755,
      },
    );
  }

  execFileSync('bash', [scriptPath], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      HOME: sandbox,
      AGI_SKIP_IOS_SIGNING_IDENTITY_CHECK: '1',
      AGI_IOS_DERIVED_DATA_DIR: derivedData,
      ...(skipReset ? { AGI_IOS_SKIP_DERIVED_DATA_RESET: '1' } : {}),
    },
    stdio: 'ignore',
  });

  return {
    lines: fs.readFileSync(log, 'utf8').trim().split('\n'),
    derivedData,
  };
}

test('the DerivedData reset runs between prebuild and run:ios, and only touches this app', () => {
  const { lines, derivedData } = runScript();

  const prebuildIndex = lines.findIndex((line) => line.includes('expo prebuild'));
  const runIndex = lines.findIndex((line) => line.includes('expo run:ios'));
  assert.ok(prebuildIndex >= 0, 'prebuild must run');
  assert.ok(runIndex > prebuildIndex, 'run:ios must follow prebuild');

  assert.match(lines[prebuildIndex + 1], /AGIWorkforce-abcdef/);
  assert.match(lines[runIndex + 1], /No such file or directory|no-derived-data/);

  assert.ok(
    fs.existsSync(path.join(derivedData, 'SomeOtherApp-123456')),
    'the reset must not wipe unrelated projects',
  );
});

test('the reset is opt-out-able for an iteration that does not need it', () => {
  const { lines } = runScript({ skipReset: true });
  const runIndex = lines.findIndex((line) => line.includes('expo run:ios'));
  assert.match(lines[runIndex + 1], /AGIWorkforce-abcdef/);
});
