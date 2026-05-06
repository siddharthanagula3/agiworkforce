/**
 * runTests.ts — Entry point for `@vscode/test-electron` integration tests.
 *
 * Invoke via `pnpm test:integration`. Downloads the latest stable VS Code,
 * launches it with this extension installed, and runs Mocha against the
 * suite at `src/test/suite/`.
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

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Open with no workspace; smoke test triggers activation via command.
      launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

void main();
