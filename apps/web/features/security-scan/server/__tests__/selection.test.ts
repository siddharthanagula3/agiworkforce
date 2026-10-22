import { describe, expect, it } from 'vitest';

import {
  SecurityScanScopeError,
  isScannableSourcePath,
  packScanBatches,
  parseGitLsFilesStage,
  parseScanScope,
  rankCandidateFiles,
} from '../selection';

const OBJECT = '0123456789abcdef0123456789abcdef01234567';

function lsFiles(entries: [mode: string, path: string][]): string {
  return entries.map(([mode, path]) => `${mode} ${OBJECT} 0\t${path}\0`).join('');
}

describe('parseGitLsFilesStage', () => {
  it('keeps regular files and drops symlinks, submodules and a truncated tail', () => {
    const output = `${lsFiles([
      ['100644', 'src/app.ts'],
      ['100755', 'bin/run.sh'],
      ['120000', 'src/link.ts'],
      ['160000', 'vendor/sub'],
    ])}100644 ${OBJECT} 0\tsrc/trunc`;
    expect(parseGitLsFilesStage(output).map((file) => file.path)).toEqual([
      'src/app.ts',
      'bin/run.sh',
    ]);
  });
});

describe('isScannableSourcePath', () => {
  it('accepts source and workflow files and skips tests, vendored and generated code', () => {
    expect(isScannableSourcePath('src/api/users.ts')).toBe(true);
    expect(isScannableSourcePath('Dockerfile')).toBe(true);
    expect(isScannableSourcePath('.github/workflows/ci.yml')).toBe(true);
    expect(isScannableSourcePath('config/app.yml')).toBe(false);
    expect(isScannableSourcePath('node_modules/x/index.js')).toBe(false);
    expect(isScannableSourcePath('src/users.test.ts')).toBe(false);
    expect(isScannableSourcePath('dist/app.min.js')).toBe(false);
    expect(isScannableSourcePath('types/index.d.ts')).toBe(false);
    expect(isScannableSourcePath('README.md')).toBe(false);
  });
});

describe('rankCandidateFiles', () => {
  it('puts security-relevant paths first and honours the scope', () => {
    const files = [
      { path: 'src/utils/format.ts' },
      { path: 'src/api/auth/login.ts' },
      { path: 'web/server.ts' },
      { path: 'README.md' },
    ];
    expect(rankCandidateFiles(files, null)).toEqual([
      'src/api/auth/login.ts',
      'web/server.ts',
      'src/utils/format.ts',
    ]);
    expect(rankCandidateFiles(files, 'src')).toEqual([
      'src/api/auth/login.ts',
      'src/utils/format.ts',
    ]);
  });
});

describe('parseScanScope', () => {
  it('normalises a folder inside the repository', () => {
    expect(parseScanScope(undefined)).toBeNull();
    expect(parseScanScope('  ')).toBeNull();
    expect(parseScanScope('./src/api/')).toBe('src/api');
  });

  it('refuses a path that leaves the repository', () => {
    for (const value of ['../etc', '/etc', '~/x', 'src/../..', 'a//b', 'a\\b', 42]) {
      expect(() => parseScanScope(value)).toThrow(SecurityScanScopeError);
    }
  });
});

describe('packScanBatches', () => {
  it('fills batches to the byte limit and stops at the batch count', () => {
    const files = ['a', 'b', 'c', 'd'].map((path) => ({ path, content: 'x'.repeat(40) }));
    const { batches, skipped } = packScanBatches(files, { maxBatchBytes: 100, maxBatches: 1 });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.files.map((file) => file.path)).toEqual(['a', 'b']);
    expect(skipped).toBe(2);
  });
});
