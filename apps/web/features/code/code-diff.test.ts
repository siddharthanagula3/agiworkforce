import { describe, expect, it } from 'vitest';
import { diffByPath, diffLineKind, parseUnifiedDiff } from './code-diff';

const TWO_FILES = [
  'diff --git a/apps/web/README.md b/apps/web/README.md',
  'index 1111111..2222222 100644',
  '--- a/apps/web/README.md',
  '+++ b/apps/web/README.md',
  '@@ -1,3 +1,3 @@',
  ' the first line',
  '-the old line',
  '+the new line',
  'diff --git a/apps/web/next.config.ts b/apps/web/next.config.ts',
  'index 3333333..4444444 100644',
  '--- a/apps/web/next.config.ts',
  '+++ b/apps/web/next.config.ts',
  '@@ -1 +1,2 @@',
  '+export const added = true;',
].join('\n');

describe('parseUnifiedDiff', () => {
  it('splits a diff into one section per file', () => {
    const files = parseUnifiedDiff(TWO_FILES);

    expect(files.map((file) => file.path)).toEqual([
      'apps/web/README.md',
      'apps/web/next.config.ts',
    ]);
    expect(files[0]?.body).toContain('+the new line');
    expect(files[0]?.body).not.toContain('export const added');
  });

  it('names a deleted file from its old path', () => {
    const deleted = [
      'diff --git a/apps/web/gone.ts b/apps/web/gone.ts',
      'deleted file mode 100644',
      '--- a/apps/web/gone.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-export const gone = true;',
    ].join('\n');

    expect(parseUnifiedDiff(deleted).map((file) => file.path)).toEqual(['apps/web/gone.ts']);
  });

  it('falls back to the git header when a section carries no path lines', () => {
    const binary = [
      'diff --git a/apps/web/public/logo.png b/apps/web/public/logo.png',
      'Binary files a/apps/web/public/logo.png and b/apps/web/public/logo.png differ',
    ].join('\n');

    expect(parseUnifiedDiff(binary).map((file) => file.path)).toEqual(['apps/web/public/logo.png']);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('keys the sections by path', () => {
    const byPath = diffByPath(TWO_FILES);

    expect(byPath.get('apps/web/next.config.ts')).toContain('+export const added = true;');
    expect(byPath.has('apps/web/never-touched.ts')).toBe(false);
  });
});

describe('diffLineKind', () => {
  it('separates content lines from the file and hunk headers', () => {
    expect(diffLineKind('+the new line')).toBe('added');
    expect(diffLineKind('-the old line')).toBe('removed');
    expect(diffLineKind(' the first line')).toBe('context');
    expect(diffLineKind('@@ -1,3 +1,3 @@')).toBe('meta');
    expect(diffLineKind('--- a/apps/web/README.md')).toBe('meta');
    expect(diffLineKind('+++ b/apps/web/README.md')).toBe('meta');
    expect(diffLineKind('index 1111111..2222222 100644')).toBe('meta');
    expect(diffLineKind('diff --git a/one b/one')).toBe('meta');
  });
});
