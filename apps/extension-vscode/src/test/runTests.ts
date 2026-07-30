/**
 * runTests.ts — Entry point for `@vscode/test-electron` integration tests.
 *
 * Invoke via `pnpm test:integration`. Downloads the latest stable VS Code,
 * launches it with this extension installed, and runs Mocha against the
 * suite at `src/test/suite/`.
 *
 * IMPORTANT: the `test:integration` script runs `node esbuild.js` AFTER the
 * tsc test compile so `out/extension.js` is the real shipped esbuild bundle.
 * The tsc-emitted per-file `out/extension.js` is NOT loadable in the extension
 * host — it `require()`s workspace packages (`@agiworkforce/types`, …) whose
 * entry points are ESM TypeScript source, so module load throws, VS Code marks
 * the extension "active" anyway, and zero commands register. Always test the
 * bundle that ships.
 *
 * Smoke-only today: asserts activation succeeds + at least one command resolves.
 * This catches the "extension fails to load" class of bugs that vitest unit
 * tests against the mock cannot surface (provider registration, command
 * registration order, activation event wiring).
 *
 * Prerequisites (one-time install):
 *   pnpm add -D mocha @types/mocha glob @types/glob
 *
 * The `@vscode/test-electron` dep is already declared in package.json:devDependencies.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { resolveVsCodeExecutablePath } from './resolveVsCodeExecutable';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // VS Code binds a Unix domain socket under the user-data dir; the OS caps
    // socket paths at ~103 chars, so a deeply nested checkout (e.g. a git
    // worktree) makes the default in-repo `.vscode-test/user-data` path fail
    // with `listen EINVAL`. Always use a short per-run dir under the OS tmpdir.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-vsc-'));
    const downloadedExecutablePath = await downloadAndUnzipVSCode({
      version: 'stable',
      extensionDevelopmentPath,
    });
    const vscodeExecutablePath = resolveVsCodeExecutablePath(downloadedExecutablePath);

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      // Open with no workspace; smoke test triggers activation via command.
      launchArgs: [
        '--disable-extensions',
        '--disable-workspace-trust',
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

void main();
