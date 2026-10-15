import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MAX_TEXT_READ_BYTES, type WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import {
  WriteConflict,
  editTextFile,
  globFiles,
  grepFiles,
  listDirectory,
  readBinaryFile,
  readTextFile,
  writeTextFile,
} from '../runtime/filesystemService';
import { PathRefused } from '../runtime/pathGuard';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

let sandbox: string;
let root: WorkspaceRoot;

const CREDENTIAL_FILES = [
  '.env.development',
  'config/.env.staging',
  'deploy/id_ecdsa',
  'deploy/id_ed25519_work',
  'certs/server.pem',
  'certs/server.key',
  'certs/signing.p12',
  'certs/signing.PFX',
  '.git-credentials',
  '.pgpass',
  '.aws/credentials',
  '.ssh/config',
  'home/.ssh/known_hosts',
];

const PROTECTED_WRITES = [
  '.git/hooks/pre-commit',
  '.git/config',
  '.GIT/hooks/pre-commit',
  'vendor/lib/.git/hooks/post-checkout',
  '.agiworkforce/hooks.json',
  '.mcp.json',
  'mcp.json',
  '.vscode/mcp.json',
  'packages/app/.mcp.json',
  '.husky/pre-commit',
  '.HUSKY/pre-push',
  '.githooks/pre-commit',
  'lefthook.yml',
  '.lefthook.yaml',
  '.pre-commit-config.yaml',
  'packages/app/.husky/commit-msg',
  '.gitmodules',
  '.GitModules',
];

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
  for (const credential of CREDENTIAL_FILES) {
    await fs.mkdir(path.dirname(path.join(sandbox, credential)), { recursive: true });
    await fs.writeFile(path.join(sandbox, credential), 'needle SECRET=1\n');
  }

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

  it('returns the SHA-256 of the bytes it read', async () => {
    const content = await readTextFile(root, 'src/index.ts');
    expect(content.sha256).toBe(sha256('export const needle = 1;\n'));
  });

  it('returns no SHA-256 for a file it truncated', async () => {
    await fs.writeFile(path.join(sandbox, 'large.txt'), 'a'.repeat(MAX_TEXT_READ_BYTES + 1));
    const content = await readTextFile(root, 'large.txt');
    expect(content.truncated).toBe(true);
    expect(content.sha256).toBeUndefined();
  });

  it.each(CREDENTIAL_FILES)('refuses %s as text and as bytes', async (credential) => {
    await expect(readTextFile(root, credential)).rejects.toMatchObject({ reason: 'denied-file' });
    await expect(readBinaryFile(root, credential)).rejects.toMatchObject({
      reason: 'denied-file',
    });
  });

  it('refuses a credential file reached through a link with a harmless name', async () => {
    await fs.symlink(path.join(sandbox, '.env.development'), path.join(sandbox, 'notes.txt'));
    try {
      await expect(readTextFile(root, 'notes.txt')).rejects.toMatchObject({
        reason: 'denied-file',
      });
    } finally {
      await fs.rm(path.join(sandbox, 'notes.txt'), { force: true });
    }
  });

  it('still reads a public key and a source file whose name starts like a key', async () => {
    await fs.writeFile(path.join(sandbox, 'deploy', 'id_ecdsa.pub'), 'ecdsa-sha2 AAAA\n');
    await fs.writeFile(path.join(sandbox, 'src', 'id_generator.ts'), 'export const id = 1;\n');
    expect((await readTextFile(root, 'deploy/id_ecdsa.pub')).text).toContain('ecdsa-sha2');
    expect((await readTextFile(root, 'src/id_generator.ts')).text).toContain('export const id');
  });
});

describe('writeTextFile', () => {
  it('creates missing parent directories and writes', async () => {
    const stat = await writeTextFile(root, 'out/generated/file.ts', 'const written = true;\n');
    expect(stat).toMatchObject({
      path: 'out/generated/file.ts',
      name: 'file.ts',
      kind: 'file',
      binary: false,
      readOnly: false,
    });
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

  it('writes over the version it read and returns the SHA-256 of what it wrote', async () => {
    await fs.writeFile(path.join(sandbox, 'edited.ts'), 'const version = 1;\n');
    const read = await readTextFile(root, 'edited.ts');

    const write = await writeTextFile(root, 'edited.ts', 'const version = 2;\n', read.sha256);

    expect(write.sha256).toBe(sha256('const version = 2;\n'));
    expect(await fs.readFile(path.join(sandbox, 'edited.ts'), 'utf8')).toBe('const version = 2;\n');
  });

  it('refuses to write over a change made after the read, and leaves that change on disk', async () => {
    await fs.writeFile(path.join(sandbox, 'contested.ts'), 'const version = 1;\n');
    const read = await readTextFile(root, 'contested.ts');
    await fs.writeFile(path.join(sandbox, 'contested.ts'), 'const agent = true;\n');

    await expect(
      writeTextFile(root, 'contested.ts', 'const version = 2;\n', read.sha256),
    ).rejects.toBeInstanceOf(WriteConflict);
    expect(await fs.readFile(path.join(sandbox, 'contested.ts'), 'utf8')).toBe(
      'const agent = true;\n',
    );
  });

  it('refuses to write a file deleted after the read, and creates nothing', async () => {
    await fs.mkdir(path.join(sandbox, 'gone'), { recursive: true });
    await fs.writeFile(path.join(sandbox, 'gone', 'file.ts'), 'const version = 1;\n');
    const read = await readTextFile(root, 'gone/file.ts');
    await fs.rm(path.join(sandbox, 'gone'), { recursive: true });

    await expect(
      writeTextFile(root, 'gone/file.ts', 'const version = 2;\n', read.sha256),
    ).rejects.toBeInstanceOf(WriteConflict);
    await expect(fs.stat(path.join(sandbox, 'gone'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to write over a file that became a directory after the read', async () => {
    await fs.writeFile(path.join(sandbox, 'swapped.ts'), 'const version = 1;\n');
    const read = await readTextFile(root, 'swapped.ts');
    await fs.rm(path.join(sandbox, 'swapped.ts'));
    await fs.mkdir(path.join(sandbox, 'swapped.ts'));

    await expect(
      writeTextFile(root, 'swapped.ts', 'const version = 2;\n', read.sha256),
    ).rejects.toBeInstanceOf(WriteConflict);
    expect((await fs.stat(path.join(sandbox, 'swapped.ts'))).isDirectory()).toBe(true);
  });

  it('replaces a file whole when no version is given', async () => {
    await fs.writeFile(path.join(sandbox, 'replaced.ts'), 'const version = 1;\n');

    await writeTextFile(root, 'replaced.ts', 'const version = 3;\n');

    expect(await fs.readFile(path.join(sandbox, 'replaced.ts'), 'utf8')).toBe(
      'const version = 3;\n',
    );
  });

  it.each(PROTECTED_WRITES)('refuses to write %s and leaves nothing behind', async (target) => {
    await expect(writeTextFile(root, target, '#!/bin/sh\n')).rejects.toMatchObject({
      reason: 'denied-file',
    });
    await expect(fs.stat(path.join(sandbox, target))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses git metadata reached through a link with a harmless name', async () => {
    await fs.mkdir(path.join(sandbox, 'linked', '.git', 'hooks'), { recursive: true });
    await fs.symlink(path.join(sandbox, 'linked', '.git'), path.join(sandbox, 'linked', 'meta'));
    await expect(
      writeTextFile(root, 'linked/meta/hooks/pre-commit', '#!/bin/sh\n'),
    ).rejects.toMatchObject({ reason: 'denied-file' });
    await expect(
      fs.stat(path.join(sandbox, 'linked', '.git', 'hooks', 'pre-commit')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  // Dots taken out as text read `lnk/../config` as `config`, while the
  // kernel follows the link first and writes `.git/config`. A page's path may
  // hold no `..` at all, so there is nothing to take out.
  it('refuses a path that steps back out of a link into git metadata', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'dots-after-link-'));
    const inside: WorkspaceRoot = { ...root, id: 'dots-after-link', path: folder };
    await fs.mkdir(path.join(folder, '.git', 'info'), { recursive: true });
    await fs.writeFile(path.join(folder, '.git', 'config'), '[core]\n');
    await fs.symlink('.git/info', path.join(folder, 'lnk'));

    for (const target of ['lnk/../config', 'src/../lnk/../config', 'lnk/exclude']) {
      await expect(writeTextFile(inside, target, 'escaped\n'), target).rejects.toBeInstanceOf(
        PathRefused,
      );
    }
    expect(await fs.readFile(path.join(folder, '.git', 'config'), 'utf8')).toBe('[core]\n');
    expect(await fs.readdir(folder)).toEqual(['.git', 'lnk']);
    expect(await fs.readdir(path.join(folder, '.git', 'info'))).toEqual([]);
  });

  it('refuses a write through a link that carries a protected name, wherever it points', async () => {
    await fs.writeFile(path.join(sandbox, 'servers.json'), '{}\n');
    await fs.mkdir(path.join(sandbox, 'named'), { recursive: true });
    await fs.symlink(path.join(sandbox, 'servers.json'), path.join(sandbox, 'named', '.mcp.json'));

    await expect(writeTextFile(root, 'named/.mcp.json', '{"evil":true}\n')).rejects.toMatchObject({
      reason: 'denied-file',
    });
    expect(await fs.readFile(path.join(sandbox, 'servers.json'), 'utf8')).toBe('{}\n');
  });

  it('refuses a write into a git directory the repository keeps under another name', async () => {
    const folder = path.join(sandbox, 'separate');
    await fs.mkdir(path.join(folder, 'gitdata', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(folder, '.git'), 'gitdir: ./gitdata\n');
    const separate: WorkspaceRoot = { ...root, id: 'separate', path: folder };

    await expect(
      writeTextFile(separate, 'gitdata/hooks/pre-commit', '#!/bin/sh\n'),
    ).rejects.toMatchObject({ reason: 'denied-file' });
    await expect(
      fs.stat(path.join(folder, 'gitdata', 'hooks', 'pre-commit')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await writeTextFile(separate, 'src/app.ts', 'export {};\n')).path).toBe('src/app.ts');
  });

  it('refuses a link to a file outside the folder that does not exist yet', async () => {
    const outside = path.join(path.dirname(sandbox), `agi-escape-${path.basename(sandbox)}.txt`);
    await fs.mkdir(path.join(sandbox, 'dangling'), { recursive: true });
    await fs.symlink(outside, path.join(sandbox, 'dangling', 'notes.txt'));

    await expect(writeTextFile(root, 'dangling/notes.txt', 'escaped\n')).rejects.toMatchObject({
      reason: 'traversal',
    });
    await expect(fs.stat(outside)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['.mcp.json', '.husky/pre-commit'])(
    'refuses a harmlessly named link to %s when that file does not exist yet',
    async (target) => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'unmade-'));
      const inside: WorkspaceRoot = { ...root, id: 'unmade', path: folder };
      await fs.symlink(path.join(folder, target), path.join(folder, 'notes.txt'));

      await expect(writeTextFile(inside, 'notes.txt', '{"evil":true}\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
      await expect(fs.lstat(path.join(folder, target))).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('refuses a path whose parent directory is a link to somewhere that does not exist', async () => {
    const outside = path.join(path.dirname(sandbox), `agi-escape-dir-${path.basename(sandbox)}`);
    await fs.mkdir(path.join(sandbox, 'parents'), { recursive: true });
    await fs.symlink(outside, path.join(sandbox, 'parents', 'build'));

    await expect(
      writeTextFile(root, 'parents/build/deep/out.txt', 'escaped\n'),
    ).rejects.toMatchObject({ reason: 'traversal' });
    await expect(fs.stat(outside)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  /** Runs `swap` once, at the first open the write makes, which is after every check before it. */
  function atTheOpen(swap: () => Promise<void>) {
    const openFile = fs.open.bind(fs);
    let swapped = false;
    const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      if (!swapped) {
        swapped = true;
        await swap();
      }
      return openFile(...(args as Parameters<typeof fs.open>));
    });
    return { restore: () => spy.mockRestore(), ran: () => swapped };
  }

  it('writes nothing when a link takes the place of the file after it was checked', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'swapped-'));
    const inside: WorkspaceRoot = { ...root, id: 'swapped', path: folder };
    const outside = path.join(path.dirname(sandbox), `agi-swap-${path.basename(sandbox)}.txt`);
    const seam = atTheOpen(() => fs.symlink(outside, path.join(folder, 'report.txt')));

    try {
      await expect(writeTextFile(inside, 'report.txt', 'escaped\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      seam.restore();
    }
    expect(seam.ran()).toBe(true);
    await expect(fs.stat(outside)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  // Node cannot open relative to a directory it already holds, so the check
  // and the open name the path twice. What was opened is looked at before any
  // byte is written, an existing file is never truncated by the open, and
  // what a refused write made is taken back.
  describe('when the directory is swapped for a link after the check', () => {
    async function swapParentDuringWrite(prepareOutside: (outside: string) => Promise<void>) {
      const folder = await fs.mkdtemp(path.join(sandbox, 'parent-swap-'));
      const inside: WorkspaceRoot = { ...root, id: 'parent-swap', path: folder };
      const outside = await fs.mkdtemp(path.join(path.dirname(sandbox), 'agi-parent-swap-'));
      await fs.mkdir(path.join(folder, 'reports'));
      await prepareOutside(outside);
      const seam = atTheOpen(async () => {
        await fs.rename(path.join(folder, 'reports'), path.join(folder, 'reports-moved'));
        await fs.symlink(outside, path.join(folder, 'reports'));
      });
      try {
        await expect(
          writeTextFile(inside, 'reports/summary.txt', 'escaped\n'),
        ).rejects.toMatchObject({ reason: 'traversal' });
      } finally {
        seam.restore();
      }
      expect(seam.ran()).toBe(true);
      return { folder, outside };
    }

    it('leaves a file that already exists at the new place exactly as it was', async () => {
      const { outside } = await swapParentDuringWrite((directory) =>
        fs.writeFile(path.join(directory, 'summary.txt'), 'kept as it was\n'),
      );
      try {
        expect(await fs.readFile(path.join(outside, 'summary.txt'), 'utf8')).toBe(
          'kept as it was\n',
        );
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });

    it('takes back the empty file the open had to create there, and leaves nothing behind', async () => {
      const { folder, outside } = await swapParentDuringWrite(async () => undefined);
      try {
        expect(await fs.readdir(outside)).toEqual([]);
        expect(await fs.readdir(path.join(folder, 'reports-moved'))).toEqual([]);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  it('leaves none of the folders it made when the write is then refused', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'made-then-refused-'));
    const inside: WorkspaceRoot = { ...root, id: 'made-then-refused', path: folder };
    const seam = atTheOpen(() =>
      fs.symlink('/etc/hosts', path.join(folder, 'm1', 'm2', 'report.txt')),
    );

    try {
      await expect(writeTextFile(inside, 'm1/m2/report.txt', 'x\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      seam.restore();
    }
    expect(seam.ran()).toBe(true);
    expect((await fs.lstat(path.join(folder, 'm1', 'm2', 'report.txt'))).isSymbolicLink()).toBe(
      true,
    );
    await fs.rm(path.join(folder, 'm1', 'm2', 'report.txt'));

    const resolvePath = fs.realpath.bind(fs);
    let made = false;
    const elsewhere = vi.spyOn(fs, 'realpath').mockImplementation(async (...args) => {
      const asked = String(args[0]);
      if (asked.endsWith(path.join('n1', 'n2'))) {
        made = existsSync(asked);
        return '/somewhere/else';
      }
      return resolvePath(...(args as Parameters<typeof fs.realpath>)) as Promise<string>;
    });
    try {
      await expect(writeTextFile(inside, 'n1/n2/report.txt', 'x\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      elsewhere.mockRestore();
    }
    expect(made).toBe(true);
    expect(await fs.readdir(folder)).toEqual(['m1']);
  });

  it('refuses a folder on the way that turns out to be a link, and makes nothing through it', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'linked-parent-'));
    const inside: WorkspaceRoot = { ...root, id: 'linked-parent', path: folder };
    const outside = await fs.mkdtemp(path.join(path.dirname(sandbox), 'agi-linked-parent-'));
    const makeFolder = fs.mkdir.bind(fs);
    const raced = vi.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
      if (String(args[0]).endsWith(`${path.sep}build`)) {
        await fs.symlink(outside, String(args[0]));
      }
      return makeFolder(...(args as Parameters<typeof fs.mkdir>));
    });

    try {
      await expect(writeTextFile(inside, 'build/deep/out.txt', 'x\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      raced.mockRestore();
    }
    try {
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('says a file is shared through a hard link, rather than that it moved, and leaves it alone', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'hard-link-'));
    const inside: WorkspaceRoot = { ...root, id: 'hard-link', path: folder };
    const outside = path.join(path.dirname(sandbox), `agi-hard-link-${path.basename(sandbox)}.txt`);
    await fs.writeFile(outside, 'kept as it was\n');
    await fs.link(outside, path.join(folder, 'notes.txt'));

    try {
      await expect(writeTextFile(inside, 'notes.txt', 'escaped\n')).rejects.toMatchObject({
        reason: 'shared-file',
        message: expect.stringMatching(
          /^notes\.txt is shared with another location through a hard link/u,
        ),
      });
      expect(await fs.readFile(outside, 'utf8')).toBe('kept as it was\n');
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it('writes nothing when another file takes the place of the name after the open', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'leaf-swap-'));
    const inside: WorkspaceRoot = { ...root, id: 'leaf-swap', path: folder };
    await fs.writeFile(path.join(folder, 'notes.txt'), 'first file\n');
    const resolvePath = fs.realpath.bind(fs);
    const openFile = fs.open.bind(fs);
    let opened = false;
    let swapped = false;
    const open = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      opened = true;
      return openFile(...(args as Parameters<typeof fs.open>));
    });
    const swap = vi.spyOn(fs, 'realpath').mockImplementation(async (...args) => {
      if (opened && !swapped) {
        swapped = true;
        await fs.rename(path.join(folder, 'notes.txt'), path.join(folder, 'notes-moved.txt'));
        await fs.writeFile(path.join(folder, 'notes.txt'), 'second file\n');
      }
      return resolvePath(...(args as Parameters<typeof fs.realpath>)) as Promise<string>;
    });

    try {
      await expect(writeTextFile(inside, 'notes.txt', 'escaped\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      swap.mockRestore();
      open.mockRestore();
    }
    expect(swapped).toBe(true);
    expect(await fs.readFile(path.join(folder, 'notes-moved.txt'), 'utf8')).toBe('first file\n');
    expect(await fs.readFile(path.join(folder, 'notes.txt'), 'utf8')).toBe('second file\n');
  });

  it('replaces the whole of an existing file, leaving none of a longer one behind', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'shorter-'));
    const inside: WorkspaceRoot = { ...root, id: 'shorter', path: folder };
    await fs.writeFile(path.join(folder, 'notes.txt'), 'a much longer first version\n');

    await writeTextFile(inside, 'notes.txt', 'short\n');

    expect(await fs.readFile(path.join(folder, 'notes.txt'), 'utf8')).toBe('short\n');
  });

  // The new contents go into a file of their own first, and the name is moved
  // onto it only once it is whole. Emptying the file and then writing it
  // would lose what was there to a full disk or a process that died.
  describe('replacing a file all at once', () => {
    const isBeside = (target: unknown) => path.basename(String(target)).startsWith('.agi-write-');

    /** Runs `during` while the new contents are being written, before the name is moved. */
    function whileWriting(during: (handle: fs.FileHandle) => Promise<void>) {
      const openFile = fs.open.bind(fs);
      let ran = false;
      const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const handle = await openFile(...(args as Parameters<typeof fs.open>));
        if (!isBeside(args[0])) return handle;
        const writeFile = handle.writeFile.bind(handle);
        handle.writeFile = (async (...written: Parameters<typeof handle.writeFile>) => {
          ran = true;
          await during(handle);
          return writeFile(...written);
        }) as typeof handle.writeFile;
        return handle;
      });
      return { restore: () => spy.mockRestore(), ran: () => ran };
    }

    const outOfSpace = () =>
      Promise.reject(
        Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }),
      );

    it('keeps what was there when the new contents cannot be written', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'disk-full-'));
      const inside: WorkspaceRoot = { ...root, id: 'disk-full', path: folder };
      await fs.writeFile(path.join(folder, 'notes.txt'), 'the only copy\n');
      const seam = whileWriting(async (handle) => {
        await handle.write('half of');
        await outOfSpace();
      });

      try {
        await expect(writeTextFile(inside, 'notes.txt', 'half of the new\n')).rejects.toMatchObject(
          { code: 'ENOSPC' },
        );
      } finally {
        seam.restore();
      }
      expect(seam.ran()).toBe(true);
      expect(await fs.readFile(path.join(folder, 'notes.txt'), 'utf8')).toBe('the only copy\n');
      expect(await fs.readdir(folder)).toEqual(['notes.txt']);
    });

    it('leaves no file and no folder behind when a new file cannot be written', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'disk-full-new-'));
      const inside: WorkspaceRoot = { ...root, id: 'disk-full-new', path: folder };
      const seam = whileWriting(outOfSpace);

      try {
        await expect(writeTextFile(inside, 'a/b/notes.txt', 'new\n')).rejects.toMatchObject({
          code: 'ENOSPC',
        });
      } finally {
        seam.restore();
      }
      expect(seam.ran()).toBe(true);
      expect(await fs.readdir(folder)).toEqual([]);
    });

    it('keeps the permissions of the file it replaces and leaves nothing beside it', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'kept-mode-'));
      const inside: WorkspaceRoot = { ...root, id: 'kept-mode', path: folder };
      await fs.writeFile(path.join(folder, 'run.sh'), '#!/bin/sh\n', { mode: 0o750 });
      await fs.chmod(path.join(folder, 'run.sh'), 0o750);

      await writeTextFile(inside, 'run.sh', '#!/bin/sh\necho done\n');

      expect((await fs.stat(path.join(folder, 'run.sh'))).mode & 0o777).toBe(0o750);
      expect(await fs.readFile(path.join(folder, 'run.sh'), 'utf8')).toBe('#!/bin/sh\necho done\n');
      expect(await fs.readdir(folder)).toEqual(['run.sh']);
    });

    it('does not move the name when another file took it while the contents were written', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'late-swap-'));
      const inside: WorkspaceRoot = { ...root, id: 'late-swap', path: folder };
      await fs.writeFile(path.join(folder, 'notes.txt'), 'first file\n');
      const seam = whileWriting(async () => {
        await fs.rename(path.join(folder, 'notes.txt'), path.join(folder, 'notes-moved.txt'));
        await fs.writeFile(path.join(folder, 'notes.txt'), 'second file\n');
      });

      try {
        await expect(writeTextFile(inside, 'notes.txt', 'escaped\n')).rejects.toMatchObject({
          reason: 'traversal',
        });
      } finally {
        seam.restore();
      }
      expect(seam.ran()).toBe(true);
      expect(await fs.readFile(path.join(folder, 'notes.txt'), 'utf8')).toBe('second file\n');
      expect((await fs.readdir(folder)).sort()).toEqual(['notes-moved.txt', 'notes.txt']);
    });

    it('does not move the name off a file that gained a second name while the contents were written', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'late-link-'));
      const inside: WorkspaceRoot = { ...root, id: 'late-link', path: folder };
      const outside = path.join(
        path.dirname(sandbox),
        `agi-late-link-${path.basename(sandbox)}.txt`,
      );
      await fs.writeFile(path.join(folder, 'notes.txt'), 'kept as it was\n');
      const seam = whileWriting(() => fs.link(path.join(folder, 'notes.txt'), outside));

      try {
        await expect(writeTextFile(inside, 'notes.txt', 'escaped\n')).rejects.toMatchObject({
          reason: 'shared-file',
        });
        expect(await fs.readFile(outside, 'utf8')).toBe('kept as it was\n');
        expect(await fs.readFile(path.join(folder, 'notes.txt'), 'utf8')).toBe('kept as it was\n');
        expect(await fs.readdir(folder)).toEqual(['notes.txt']);
      } finally {
        seam.restore();
        await fs.rm(outside, { force: true });
      }
    });

    // The rename names the path again, and Node cannot rename into a folder
    // it holds. A folder swapped inside that one call is seen straight after.
    it('empties what it wrote when the folder turns out to have been swapped under the rename', async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'rename-swap-'));
      const inside: WorkspaceRoot = { ...root, id: 'rename-swap', path: folder };
      const outside = await fs.mkdtemp(path.join(path.dirname(sandbox), 'agi-rename-swap-'));
      await fs.mkdir(path.join(folder, 'reports'));
      const renameFile = fs.rename.bind(fs);
      const seam = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        await renameFile(from, to);
        await renameFile(path.join(folder, 'reports'), path.join(folder, 'reports-moved'));
        await fs.symlink(outside, path.join(folder, 'reports'));
      });

      try {
        await expect(
          writeTextFile(inside, 'reports/summary.txt', 'escaped\n'),
        ).rejects.toMatchObject({ reason: 'traversal' });
        expect(await fs.readdir(outside)).toEqual([]);
        expect(await fs.readFile(path.join(folder, 'reports-moved', 'summary.txt'), 'utf8')).toBe(
          '',
        );
      } finally {
        seam.mockRestore();
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });

  // llm-guardrail-allow: the fixture is made with mkfifo, which Windows does not have
  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO where the file should be instead of waiting for a reader',
    async () => {
      const folder = await fs.mkdtemp(path.join(sandbox, 'pipe-'));
      const inside: WorkspaceRoot = { ...root, id: 'pipe', path: folder };
      execFileSync('mkfifo', [path.join(folder, 'notes.txt')]);

      await expect(writeTextFile(inside, 'notes.txt', 'escaped\n')).rejects.toMatchObject({
        reason: 'traversal',
      });
    },
  );

  it('still writes through a link to a file that exists inside the folder', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'linked-file-'));
    const inside: WorkspaceRoot = { ...root, id: 'linked-file', path: folder };
    await fs.writeFile(path.join(folder, 'real.txt'), 'before\n');
    await fs.symlink(path.join(folder, 'real.txt'), path.join(folder, 'alias.txt'));

    await writeTextFile(inside, 'alias.txt', 'after\n');

    expect(await fs.readFile(path.join(folder, 'real.txt'), 'utf8')).toBe('after\n');
    expect((await fs.lstat(path.join(folder, 'alias.txt'))).isSymbolicLink()).toBe(true);
  });

  // A volume that ignores case also reads the long s as s and the Kelvin
  // sign as k, so each of these opens the protected or credential file its
  // letters spell. Lower case alone let all of them through.
  it.each([
    '.mcp.j\u017Fon',
    'packages/app/.mcp.j\u017Fon',
    '.githook\u017F/pre-commit',
    '.hus\u212Ay/pre-commit',
    '.pre-commit-con\uFB01g.yaml',
    '.\u1E9Eh/authorized_keys',
    'deploy/id_r\u017Fa',
  ])(
    'refuses to write %s, which a case-folding volume opens as a protected name',
    async (target) => {
      await expect(writeTextFile(root, target, 'x\n')).rejects.toMatchObject({
        reason: 'denied-file',
      });
      await expect(fs.lstat(path.join(sandbox, target))).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('refuses to read a credential file through a spelling the volume folds', async () => {
    await expect(readTextFile(root, 'deploy/id_ecd\u017Fa')).rejects.toMatchObject({
      reason: 'denied-file',
    });
    await expect(readTextFile(root, 'cert\u017F/server.\u212Aey')).rejects.toMatchObject({
      reason: 'denied-file',
    });
  });

  it('refuses a git directory kept under another name when it is reached through a folded spelling', async (context) => {
    const folder = path.join(sandbox, 'folded-gitdir');
    await fs.mkdir(path.join(folder, 'gitstore', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(folder, '.git'), 'gitdir: ./gitstore\n');
    if (!existsSync(path.join(folder, 'git\u017Ftore'))) context.skip();
    const folded: WorkspaceRoot = { ...root, id: 'folded-gitdir', path: folder };

    await expect(
      writeTextFile(folded, 'git\u017Ftore/hook\u017F/pre-commit', '#!/bin/sh\n'),
    ).rejects.toMatchObject({ reason: 'denied-file' });
    await expect(
      fs.stat(path.join(folder, 'gitstore', 'hooks', 'pre-commit')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('still writes files that only resemble protected names', async () => {
    const ignore = await writeTextFile(root, '.gitignore', 'dist\n');
    const settings = await writeTextFile(root, '.vscode/settings.json', '{}\n');
    expect(ignore.path).toBe('.gitignore');
    expect(settings.path).toBe('.vscode/settings.json');
  });
});

// A sandboxed command may rename inside the folder it was given. Reading by
// path after the check let it put a link where the checked file was: in six
// seconds a read returned a file outside the folder 493 times. What was
// opened is now looked at before a byte of it is returned.
// llm-guardrail-allow: the race swaps a file for a symbolic link, which Windows does not let an unprivileged process create
describe.skipIf(process.platform === 'win32')('while a command renames inside the folder', () => {
  const FLIPPER = `
    const fs = require('fs'), p = require('path');
    const [ws, out] = process.argv.slice(1);
    fs.writeFileSync(p.join(ws, 'real.txt'), 'inside');
    fs.symlinkSync(p.join(out, 'secret.txt'), p.join(ws, 'link.txt'));
    fs.copyFileSync(p.join(ws, 'real.txt'), p.join(ws, 'race.txt'));
    fs.symlinkSync(out, p.join(ws, 'dlink'));
    for (;;) {
      fs.renameSync(p.join(ws, 'race.txt'), p.join(ws, 'real.txt'));
      fs.renameSync(p.join(ws, 'link.txt'), p.join(ws, 'race.txt'));
      fs.renameSync(p.join(ws, 'race.txt'), p.join(ws, 'link.txt'));
      fs.renameSync(p.join(ws, 'real.txt'), p.join(ws, 'race.txt'));
      fs.renameSync(p.join(ws, 'd'), p.join(ws, 'dreal'));
      fs.renameSync(p.join(ws, 'dlink'), p.join(ws, 'd'));
      fs.renameSync(p.join(ws, 'd'), p.join(ws, 'dlink'));
      fs.renameSync(p.join(ws, 'dreal'), p.join(ws, 'd'));
    }`;

  it('never returns or lists a file outside it, however the renames fall', async () => {
    const folder = await fs.mkdtemp(path.join(sandbox, 'raced-'));
    const outside = await fs.mkdtemp(path.join(path.dirname(sandbox), 'agi-raced-outside-'));
    const inside: WorkspaceRoot = { ...root, id: 'raced', path: folder };
    await fs.mkdir(path.join(folder, 'd'));
    await fs.writeFile(path.join(folder, 'd', 'f.txt'), 'inside');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'OUTSIDE-SECRET');
    await fs.writeFile(path.join(outside, 'f.txt'), 'OUTSIDE-SECRET-VIA-PARENT');
    await fs.writeFile(path.join(outside, 'only-outside.txt'), 'x');
    const flipper = spawn(process.execPath, ['-e', FLIPPER, folder, outside], { stdio: 'ignore' });
    const seen = { inside: 0, refused: 0, leaked: [] as string[] };
    const attempt = async (name: string, read: () => Promise<string>) => {
      try {
        const text = await read();
        if (text.includes('OUTSIDE') || text.includes('only-outside')) seen.leaked.push(name);
        else seen.inside += 1;
      } catch {
        seen.refused += 1;
      }
    };
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const until = Date.now() + 2_500;
      while (Date.now() < until) {
        await attempt('text leaf', async () => (await readTextFile(inside, 'race.txt')).text);
        await attempt('text parent', async () => (await readTextFile(inside, 'd/f.txt')).text);
        await attempt('bytes leaf', async () =>
          Buffer.from((await readBinaryFile(inside, 'race.txt')).base64, 'base64').toString(),
        );
        await attempt('bytes parent', async () =>
          Buffer.from((await readBinaryFile(inside, 'd/f.txt')).base64, 'base64').toString(),
        );
        await attempt('list', async () =>
          (await listDirectory(inside, 'd')).map((entry) => entry.name).join(','),
        );
      }
    } finally {
      flipper.kill('SIGKILL');
      await fs.rm(outside, { recursive: true, force: true });
    }

    expect(seen.leaked).toEqual([]);
    expect(seen.inside).toBeGreaterThan(50);
  }, 15_000);
});

describe('a path that is not a regular file', () => {
  // llm-guardrail-allow: the fixture is made with mkfifo, which Windows does not have
  it.skipIf(process.platform === 'win32')(
    'refuses a FIFO in the workspace instead of waiting for a writer',
    async () => {
      const fifo = path.join(sandbox, 'src', 'pipe');
      execFileSync('mkfifo', [fifo]);
      try {
        await expect(readTextFile(root, 'src/pipe')).rejects.toBeInstanceOf(PathRefused);
        await expect(readBinaryFile(root, 'src/pipe')).rejects.toBeInstanceOf(PathRefused);
      } finally {
        await fs.rm(fifo, { force: true });
      }
    },
  );
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

  it('never searches the text of a credential file', async () => {
    const paths = (await grepFiles(root, 'needle')).map((match) => match.path);
    for (const credential of CREDENTIAL_FILES) expect(paths).not.toContain(credential);
  });

  // llm-guardrail-allow: the fixture is made with mkfifo, which Windows does not have
  it.skipIf(process.platform === 'win32')(
    'skips a FIFO instead of waiting for a writer',
    async () => {
      const fifo = path.join(sandbox, 'src', 'search-pipe');
      execFileSync('mkfifo', [fifo]);
      try {
        expect((await grepFiles(root, 'needle')).map((match) => match.path)).toContain(
          'src/index.ts',
        );
      } finally {
        await fs.rm(fifo, { force: true });
      }
    },
  );

  it('returns nothing for an empty query rather than every line', async () => {
    expect(await grepFiles(root, '')).toEqual([]);
  });
});

describe('serialized local file editing', () => {
  it('serializes optimistic writes through realpath aliases', async () => {
    const target = path.join(sandbox, 'race.txt');
    const alias = path.join(sandbox, 'race-alias.txt');
    await fs.writeFile(target, 'original');
    await fs.symlink(target, alias);
    const originalRename = fs.rename.bind(fs);
    let release!: () => void;
    let entered!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      if (args[1] === target && ++writes === 1) {
        entered();
        await paused;
      }
      return originalRename(...args);
    });
    try {
      const first = writeTextFile(root, 'race.txt', 'first', sha256('original'));
      await firstEntered;
      const second = writeTextFile(root, 'race-alias.txt', 'second', sha256('original'));
      const secondSettled = second.then(
        () => 'written',
        () => 'refused',
      );
      await Promise.race([secondSettled, new Promise((resolve) => setTimeout(resolve, 50))]);
      release();
      await first;
      expect(await secondSettled).toBe('refused');
      expect(await fs.readFile(target, 'utf8')).toBe('first');
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('reports invalid UTF-8 as read-only and refuses passage edits', async () => {
    const bytes = Buffer.from([0x61, 0xe9, 0x62]);
    await fs.writeFile(path.join(sandbox, 'legacy.txt'), bytes);
    expect(await readTextFile(root, 'legacy.txt')).toMatchObject({ readOnly: true });
    await expect(editTextFile(root, 'legacy.txt', 'a', 'changed', false)).rejects.toThrow(
      'not UTF-8',
    );
    expect(await fs.readFile(path.join(sandbox, 'legacy.txt'))).toEqual(bytes);
  });

  it('serializes edits without reacquiring their own file lock', async () => {
    await fs.writeFile(path.join(sandbox, 'edit-race.txt'), 'left right');
    await Promise.all([
      editTextFile(root, 'edit-race.txt', 'left', 'LEFT', false),
      editTextFile(root, 'edit-race.txt', 'right', 'RIGHT', false),
    ]);
    expect(await fs.readFile(path.join(sandbox, 'edit-race.txt'), 'utf8')).toBe('LEFT RIGHT');
  });
});
