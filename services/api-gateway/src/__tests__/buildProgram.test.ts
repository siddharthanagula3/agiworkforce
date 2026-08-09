/**
 * The gateway's `build` script is plain `tsc` over `tsconfig.json`, and that
 * tsconfig is also the only type gate this package has in CI. It used to
 * `include: ["src/**\/*"]` with nothing excluded, so every test file was part
 * of the emitted CommonJS program: `import.meta.dirname` in one of them broke
 * `pnpm build` with TS1343, which failed the "Build affected deployable
 * JavaScript surfaces" step and took the whole `check` job — and therefore
 * every E2E job gated on it — red.
 *
 * The TS1343 was the loud symptom. The quiet one is that `dist/` shipped test
 * code that `require`s vitest, a devDependency absent from a production
 * install. A test file without `import.meta` would restore that silently, so
 * assert the program's shape rather than trusting the next compile to
 * complain.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const packageRoot = join(__dirname, '..', '..');

function emittedFiles(): string[] {
  const configPath = join(packageRoot, 'tsconfig.json');
  const { config, error } = ts.parseConfigFileTextToJson(
    configPath,
    readFileSync(configPath, 'utf8'),
  );
  expect(error).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, packageRoot);
  expect(parsed.errors).toEqual([]);

  return parsed.fileNames.map((f) => relative(packageRoot, f));
}

describe('gateway build program', () => {
  it('still compiles the service sources, so an include typo cannot empty this check', () => {
    const files = emittedFiles();
    expect(files).toContain(join('src', 'index.ts'));
    expect(files.length).toBeGreaterThan(20);
  });

  it('leaves test files out of the emitted program', () => {
    const tests = emittedFiles().filter(
      (f) => f.endsWith('.test.ts') || f.split(sep).includes('__tests__'),
    );
    expect(tests).toEqual([]);
  });
});
