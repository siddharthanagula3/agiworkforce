
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
