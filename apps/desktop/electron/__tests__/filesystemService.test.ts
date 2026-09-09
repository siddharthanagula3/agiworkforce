import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import {
  createDirectory,
  globFiles,
  globToRegExp,
  grepFiles,
  listDirectory,
  readTextFile,
  statPath,
  writeTextFile,
} from '../runtime/filesystemService';
import { PathRefused } from '../runtime/pathGuard';

let sandbox: string;
let root: WorkspaceRoot;

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-fs-')));

  await fs.mkdir(path.join(sandbox, 'src', 'nested'), { recursive: true });
  await fs.mkdir(path.join(sandbox, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(sandbox, 'README.md'), '# Title\nneedle here\n');
  await fs.writeFile(path.join(sandbox, 'src', 'index.ts'), 'export const needle = 1;\n');
  await fs.writeFile(path.join(sandbox, 'src', 'nested', 'deep.ts'), 'const x = 2;\n');
  await fs.writeFile(path.join(sandbox, 'node_modules', 'pkg', 'index.js'), 'needle in vendor\n');
  await fs.writeFile(path.join(sandbox, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]));
  await fs.writeFile(path.join(sandbox, '.env'), 'SECRET=1\n');

  root = { id: 'r', path: sandbox, name: 'sandbox', grantedAtMs: 0, lastOpenedAtMs: 0 };
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('listDirectory', () => {
  it('lists directories before files, each alphabetically', async () => {
    const entries = await listDirectory(root, '');
    const kinds = entries.map((entry) => entry.kind);
    expect(kinds.indexOf('file')).toBeGreaterThan(kinds.lastIndexOf('directory'));
    expect(entries.map((entry) => entry.name)).toContain('README.md');
  });

  it('reports paths relative to the root', async () => {
    const entries = await listDirectory(root, 'src');
    expect(entries.map((entry) => entry.path)).toContain('src/index.ts');
  });

  it('refuses a path that is not a directory', async () => {
    await expect(listDirectory(root, 'README.md')).rejects.toBeInstanceOf(PathRefused);
  });
});

describe('readTextFile', () => {
  it('reads a text file', async () => {
    const content = await readTextFile(root, 'src/index.ts');
    expect(content.text).toBe('export const needle = 1;\n');
    expect(content.truncated).toBe(false);
  });

  it('refuses a binary file', async () => {
    await expect(readTextFile(root, 'logo.png')).rejects.toBeInstanceOf(PathRefused);
  });

  it('refuses a credential file inside an approved root', async () => {
    await expect(readTextFile(root, '.env')).rejects.toMatchObject({ reason: 'denied-file' });
  });

  it('refuses a directory', async () => {
    await expect(readTextFile(root, 'src')).rejects.toBeInstanceOf(PathRefused);
  });
});

describe('writeTextFile', () => {
  it('creates missing parent directories and writes', async () => {
    const stat = await writeTextFile(root, 'out/generated/file.ts', 'const written = true;\n');
    expect(stat.path).toBe('out/generated/file.ts');
    const back = await readTextFile(root, 'out/generated/file.ts');
    expect(back.text).toBe('const written = true;\n');
  });

  it('refuses to write a credential file', async () => {
    await expect(writeTextFile(root, '.npmrc', 'token=1')).rejects.toMatchObject({
      reason: 'denied-file',
    });
  });

  it('refuses to write outside the root', async () => {
    await expect(writeTextFile(root, '../escaped.txt', 'x')).rejects.toBeInstanceOf(PathRefused);
  });
});

describe('statPath', () => {
  it('flags a binary file', async () => {
    expect((await statPath(root, 'logo.png')).binary).toBe(true);
    expect((await statPath(root, 'README.md')).binary).toBe(false);
  });

  it('reports directories', async () => {
    expect((await statPath(root, 'src')).kind).toBe('directory');
  });
});

describe('createDirectory', () => {
  it('creates a nested directory', async () => {
    const stat = await createDirectory(root, 'a/b/c');
    expect(stat.kind).toBe('directory');
    expect(stat.path).toBe('a/b/c');
  });
});

describe('globToRegExp', () => {
  it('keeps a single star inside one path segment', () => {
    expect(globToRegExp('*.ts').test('index.ts')).toBe(true);
    expect(globToRegExp('*.ts').test('src/index.ts')).toBe(false);
  });

  it('lets a double star cross separators', () => {
    expect(globToRegExp('**/*.ts').test('src/nested/deep.ts')).toBe(true);
  });

  it('escapes regex metacharacters rather than honouring them', () => {
    expect(globToRegExp('a+b.txt').test('a+b.txt')).toBe(true);
    expect(globToRegExp('a+b.txt').test('aab.txt')).toBe(false);
    expect(globToRegExp('file.(1)').test('file.(1)')).toBe(true);
  });

  it('matches a single character for a question mark', () => {
    expect(globToRegExp('a?.ts').test('ab.ts')).toBe(true);
    expect(globToRegExp('a?.ts').test('abc.ts')).toBe(false);
  });
});

describe('globFiles', () => {
  it('finds files by pattern and skips vendor directories', async () => {
    const found = await globFiles(root, '**/*.ts');
    const paths = found.map((entry) => entry.path);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/nested/deep.ts');
    expect(paths.some((entry) => entry.startsWith('node_modules/'))).toBe(false);
  });
});

describe('grepFiles', () => {
  it('finds matches with line and column, skipping vendor and binary files', async () => {
    const matches = await grepFiles(root, 'needle');
    const paths = matches.map((match) => match.path);

    expect(paths).toContain('README.md');
    expect(paths).toContain('src/index.ts');
    expect(paths.some((entry) => entry.startsWith('node_modules/'))).toBe(false);

    const readme = matches.find((match) => match.path === 'README.md');
    expect(readme?.line).toBe(2);
    expect(readme?.column).toBe(1);
  });

  it('returns nothing for an empty query rather than every line', async () => {
    expect(await grepFiles(root, '')).toEqual([]);
  });
});
