/**
 * suite/index.ts — Mocha glob loader for integration tests.
 *
 * Loaded inside the VS Code extension host by `@vscode/test-electron`.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import * as path from 'path';

export function run(): Promise<void> {
  // Lazy-required so unit tests don't need mocha installed.
  // Install before running: pnpm add -D mocha @types/mocha glob @types/glob
  const Mocha = require('mocha') as new (opts: unknown) => {
    addFile: (file: string) => void;
    run: (cb: (failures: number) => void) => void;
  };
  const { glob } = require('glob') as {
    glob: (pattern: string, opts: unknown) => Promise<string[]>;
  };

  const grep = process.env.AGI_VSCODE_E2E_GREP;
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60_000,
    ...(grep === undefined ? {} : { grep: new RegExp(grep, 'u') }),
  });
  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    glob('**/*.test.js', { cwd: testsRoot }).then(
      (files: string[]) => {
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));
        try {
          mocha.run((failures: number) => {
            if (failures > 0) reject(new Error(`${failures} test(s) failed`));
            else resolve();
          });
        } catch (err) {
          reject(err);
        }
      },
      (err: Error) => reject(err),
    );
  });
}
