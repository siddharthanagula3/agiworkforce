import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { resolveContained, isContainedIn } from '../pathContainment';

const root = path.resolve('/home/u/project');

describe('resolveContained — happy path', () => {
  it('accepts a simple relative path', () => {
    const r = resolveContained(root, 'src/index.ts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolved).toBe(path.resolve(root, 'src/index.ts'));
  });

  it('accepts the root itself', () => {
    const r = resolveContained(root, '.');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolved).toBe(root);
  });

  it('accepts a deep nested path', () => {
    const r = resolveContained(root, 'a/b/c/d/e/f.txt');
    expect(r.ok).toBe(true);
  });
});

describe('resolveContained — rejection cases', () => {
  it('rejects empty input', () => {
    const r = resolveContained(root, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty-input');
  });

  it('rejects absolute input by default', () => {
    const r = resolveContained(root, '/etc/passwd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('absolute-input');
  });

  it('rejects path traversal via ../', () => {
    const r = resolveContained(root, '../other-project/file.txt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
  });

  it('rejects multi-segment traversal', () => {
    const r = resolveContained(root, '../../etc/passwd');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
  });

  // The classic F-05 case: /home/u/project should NOT contain
  // /home/u/project-evil/foo (without separator check, naive startsWith
  // would accept this).
  it('rejects adjacent-directory bypass (F-05)', () => {
    const r = resolveContained(root, '../project-evil/foo.txt');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
  });
});

describe('resolveContained — allowAbsolute mode', () => {
  it('accepts an absolute path that resolves inside root', () => {
    const inside = path.resolve(root, 'src/index.ts');
    const r = resolveContained(root, inside, { allowAbsolute: true });
    expect(r.ok).toBe(true);
  });

  it('rejects an absolute path outside root even when allowed', () => {
    const r = resolveContained(root, '/etc/passwd', { allowAbsolute: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
  });

  it('rejects adjacent absolute paths (F-05 absolute variant)', () => {
    const r = resolveContained(root, path.resolve('/home/u/project-evil/foo'), {
      allowAbsolute: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
  });
});

describe('isContainedIn', () => {
  it('returns true for absolute paths inside root', () => {
    expect(isContainedIn(root, path.resolve(root, 'a/b'))).toBe(true);
  });

  it('returns false for adjacent directory', () => {
    expect(isContainedIn(root, path.resolve('/home/u/project-evil/a'))).toBe(false);
  });

  it('returns false for empty/invalid input', () => {
    expect(isContainedIn(root, '')).toBe(false);
  });
});
