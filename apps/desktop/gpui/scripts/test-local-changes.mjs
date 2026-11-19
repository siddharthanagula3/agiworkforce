import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev/Desktop.app');
const manifest = JSON.parse(
  fs.readFileSync(path.join(bundle, 'Contents/Resources/native-runtime.json'), 'utf8'),
);
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-local-changes-'));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !/TOKEN|KEY|SECRET|PASSWORD|JWT|AGIWORKFORCE|AGI_AUTH|OPENAI|ANTHROPIC|OLLAMA|LMSTUDIO/i.test(
        name,
      ),
  ),
);
try {
  fs.writeFileSync(
    path.join(config, 'config.toml'),
    '[default]\nprovider = "ollama"\nmodel = "fixture-local"\n[ui]\nprivacy_mode = "local"\n[telemetry]\nproduct_analytics = false\ncrash_reports = false\n',
  );
  const result = spawnSync(
    'cargo',
    [
      'test',
      '-p',
      'agiworkforce-desktop-gpui',
      '--no-default-features',
      '--test',
      'changes_runtime',
      'real_local_changes_',
      '--',
      '--ignored',
      '--test-threads=1',
    ],
    {
      cwd: root,
      env: {
        ...env,
        AGIWORKFORCE_HOME: config,
        AGI_GPUI_CHANGES_FIXTURE: '1',
        AGI_GPUI_TEST_RUNTIME: path.join(bundle, 'Contents/MacOS', manifest.executable),
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0);
  process.stdout.write(
    'Packaged local checkpoint review, section staging/reverting, versioned worktree apply, later-edit conflicts, managed worktrees and restart recovery passed.\n',
  );
} finally {
  fs.rmSync(config, { recursive: true, force: true });
}
