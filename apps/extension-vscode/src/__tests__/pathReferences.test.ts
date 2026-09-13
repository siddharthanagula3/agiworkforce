import { describe, expect, it } from 'vitest';
import { describePathReference, findPathReferences } from '../utils/pathReferences';

function first(text: string) {
  const [reference] = findPathReferences(text);
  return reference;
}

describe('findPathReferences', () => {
  it('reads a workspace-relative path with line and column', () => {
    const reference = first('see src/features/app.ts:42:7 for the call');
    expect(reference).toMatchObject({ path: 'src/features/app.ts', line: 42, column: 7 });
    expect(reference?.length).toBe('src/features/app.ts:42:7'.length);
  });

  it('reads an absolute POSIX path with a line only', () => {
    const reference = first('/Users/dev/project/main.rs:19');
    expect(reference).toMatchObject({ path: '/Users/dev/project/main.rs', line: 19 });
    expect(reference?.column).toBeUndefined();
  });

  it('reads a Windows drive path with a backslash separator', () => {
    expect(first('C:\\work\\repo\\src\\index.ts:8:3')).toMatchObject({
      path: 'C:\\work\\repo\\src\\index.ts',
      line: 8,
      column: 3,
    });
  });

  it('reads a Windows drive path written with forward slashes', () => {
    expect(first('D:/build/out/bundle.js:120')).toMatchObject({
      path: 'D:/build/out/bundle.js',
      line: 120,
    });
  });

  it('reads the Node stack-trace frame shape', () => {
    expect(first('    at handler (/srv/app/lib/router.js:88:15)')).toMatchObject({
      path: '/srv/app/lib/router.js',
      line: 88,
      column: 15,
    });
  });

  it('reads the Python traceback shape', () => {
    expect(first('  File "app/service/worker.py", line 63, in run')).toMatchObject({
      path: 'app/service/worker.py',
      line: 63,
    });
  });

  it('reads the TypeScript parenthesised shape', () => {
    expect(first('src/core/setup.ts(31,12): error TS2345: bad argument')).toMatchObject({
      path: 'src/core/setup.ts',
      line: 31,
      column: 12,
    });
  });

  it('reads the Java stack-trace frame shape', () => {
    expect(first('\tat com.example.Main.run(Main.java:204)')).toMatchObject({
      path: 'Main.java',
      line: 204,
    });
  });

  it('reads the C# "line NN" shape', () => {
    expect(first('   at App.Run() in /repo/src/Program.cs:line 27')).toMatchObject({
      path: '/repo/src/Program.cs',
      line: 27,
    });
  });

  it('reads a bare path with no position', () => {
    const reference = first('open packages/ui/theme.css next');
    expect(reference?.path).toBe('packages/ui/theme.css');
    expect(reference?.line).toBeUndefined();
  });

  it('does not treat a URL host or path as a file reference', () => {
    expect(findPathReferences('docs at https://agiworkforce.com/docs/setup.html')).toEqual([]);
  });

  it('does not treat prose abbreviations as file references', () => {
    expect(findPathReferences('i.e. the value, e.g. zero')).toEqual([]);
  });

  it('returns every reference on a line in order', () => {
    const references = findPathReferences('src/a.ts:3 calls src/b.ts:9:2');
    expect(references.map((entry) => entry.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(references[0]?.start).toBe(0);
    expect(references[1]?.start).toBe('src/a.ts:3 calls '.length);
  });

  it('honours the candidate limit', () => {
    const line = Array.from({ length: 20 }, (_unused, index) => `src/f${index}.ts:1`).join(' ');
    expect(findPathReferences(line, 5)).toHaveLength(5);
  });

  it('rejects a position that overflows the accepted range', () => {
    const reference = first('src/a.ts:99999999');
    expect(reference?.path).toBe('src/a.ts');
    expect(reference?.line).toBeUndefined();
  });
});

describe('describePathReference', () => {
  it('renders the three suffix shapes', () => {
    expect(describePathReference({ path: 'a.ts', start: 0, length: 4 })).toBe('a.ts');
    expect(describePathReference({ path: 'a.ts', line: 2, start: 0, length: 6 })).toBe('a.ts:2');
    expect(describePathReference({ path: 'a.ts', line: 2, column: 5, start: 0, length: 8 })).toBe(
      'a.ts:2:5',
    );
  });
});
