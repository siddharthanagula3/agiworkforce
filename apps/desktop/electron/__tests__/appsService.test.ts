import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';

const openPath = vi.fn<(target: string) => Promise<string>>();
const showItemInFolder = vi.fn<(target: string) => void>();
const openExternal = vi.fn<(url: string) => Promise<void>>();

vi.mock('electron', () => ({ shell: { openPath, showItemInFolder, openExternal } }));

const { editorFileUrl, openInEditor, openWithDefaultApplication, revealInFileManager } =
  await import('../runtime/appsService');
const { PathRefused } = await import('../runtime/pathGuard');

let sandbox: string;
let root: WorkspaceRoot;

beforeAll(async () => {
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-apps-')));
  await fs.writeFile(path.join(sandbox, 'notes.md'), '# notes\n');
  await fs.writeFile(path.join(sandbox, 'install.sh'), 'echo hi\n');
  await fs.writeFile(path.join(sandbox, 'runner'), 'echo hi\n', { mode: 0o755 });
  await fs.mkdir(path.join(sandbox, 'inner'), { recursive: true });
  root = { id: 'r', path: sandbox, name: 'sandbox', grantedAtMs: 0, lastOpenedAtMs: 0 };
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  openPath.mockReset().mockResolvedValue('');
  showItemInFolder.mockReset();
  openExternal.mockReset().mockResolvedValue(undefined);
});

describe('openInEditor', () => {
  it('builds a vscode file link that survives spaces, hashes and drive letters', () => {
    expect(editorFileUrl('/Users/me/My Repo#2')).toBe('vscode://file/Users/me/My%20Repo%232');
    expect(editorFileUrl('C:\\Users\\me\\repo')).toBe('vscode://file/C:/Users/me/repo');
  });

  it('hands the approved folder to the vscode handler', async () => {
    await expect(openInEditor(root)).resolves.toEqual({ path: '', opened: true });
    expect(openExternal).toHaveBeenCalledWith(editorFileUrl(sandbox));
  });

  it('says what to do when no editor claims the link', async () => {
    openExternal.mockRejectedValue(new Error('no handler'));
    await expect(openInEditor(root)).rejects.toBeInstanceOf(PathRefused);
  });

  it('does not open a folder that no longer exists', async () => {
    await expect(openInEditor({ ...root, path: path.join(sandbox, 'missing') })).rejects.toThrow();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe('openWithDefaultApplication', () => {
  it('opens an ordinary file with its absolute path', async () => {
    const result = await openWithDefaultApplication(root, 'notes.md');
    expect(result).toEqual({ path: 'notes.md', opened: true });
    expect(openPath).toHaveBeenCalledWith(path.join(sandbox, 'notes.md'));
  });

  it('opens a folder', async () => {
    await expect(openWithDefaultApplication(root, 'inner')).resolves.toMatchObject({
      opened: true,
    });
  });

  it('refuses a path outside the approved root', async () => {
    await expect(openWithDefaultApplication(root, '../escape.md')).rejects.toBeInstanceOf(
      PathRefused,
    );
    expect(openPath).not.toHaveBeenCalled();
  });

  it('refuses a script by extension so opening cannot become running', async () => {
    await expect(openWithDefaultApplication(root, 'install.sh')).rejects.toBeInstanceOf(
      PathRefused,
    );
    expect(openPath).not.toHaveBeenCalled();
  });

  // A list of what not to open had `.term` and not `.terminal`, which carries
  // a command and opens in Terminal. Only named document types open now.
  it.each([
    'x.terminal',
    'x.term',
    'x.fileloc',
    'x.webloc',
    'x.url',
    'x.action',
    'x.jnlp',
    'x.mobileconfig',
    'x.command',
    'x.html',
    'x.svg',
    'x.py',
    'x.js',
    'x.docm',
    'x.zip',
    'x.TERMINAL',
    'README',
    'x.md.terminal',
  ])('reveals %s and does not open it', async (name) => {
    await fs.writeFile(path.join(sandbox, name), '<plist/>\n');

    await expect(openWithDefaultApplication(root, name)).rejects.toMatchObject({
      reason: 'denied-file',
      message: expect.stringContaining('Reveal it in the file manager'),
    });
    expect(openPath).not.toHaveBeenCalled();
    await expect(revealInFileManager(root, name)).resolves.toMatchObject({ opened: true });
  });

  it.each(['a.txt', 'a.PDF', 'a.png', 'a.docx', 'a.csv', 'a.mp4'])('opens %s', async (name) => {
    await fs.writeFile(path.join(sandbox, name), 'x');

    await expect(openWithDefaultApplication(root, name)).resolves.toMatchObject({ opened: true });
    expect(openPath).toHaveBeenCalledWith(path.join(sandbox, name));
  });

  it('refuses a document that is marked executable, and a folder that may be a bundle', async () => {
    await fs.writeFile(path.join(sandbox, 'run.txt'), '#!/bin/sh\n', { mode: 0o755 });
    await fs.mkdir(path.join(sandbox, 'Tool.app'));
    await fs.mkdir(path.join(sandbox, 'notes.pdf'));

    for (const name of ['run.txt', 'Tool.app', 'notes.pdf']) {
      await expect(openWithDefaultApplication(root, name), name).rejects.toBeInstanceOf(
        PathRefused,
      );
    }
    expect(openPath).not.toHaveBeenCalled();
  });

  it('does not open a link put where the checked file was', async () => {
    const outside = path.join(path.dirname(sandbox), `agi-apps-outside-${path.basename(sandbox)}`);
    await fs.writeFile(`${outside}.md`, 'outside\n');
    await fs.writeFile(path.join(sandbox, 'swapped.md'), 'inside\n');
    const openFile = fs.open.bind(fs);
    let swapped = false;
    const seam = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      if (!swapped) {
        swapped = true;
        await fs.rm(path.join(sandbox, 'swapped.md'));
        await fs.symlink(`${outside}.md`, path.join(sandbox, 'swapped.md'));
      }
      return openFile(...(args as Parameters<typeof fs.open>));
    });

    try {
      await expect(openWithDefaultApplication(root, 'swapped.md')).rejects.toMatchObject({
        reason: 'traversal',
      });
    } finally {
      seam.mockRestore();
      await fs.rm(`${outside}.md`, { force: true });
    }
    expect(swapped).toBe(true);
    expect(openPath).not.toHaveBeenCalled();
  });

  it('refuses an executable file with no telling extension', async () => {
    await expect(openWithDefaultApplication(root, 'runner')).rejects.toBeInstanceOf(PathRefused);
    expect(openPath).not.toHaveBeenCalled();
  });

  it('surfaces an operating-system refusal', async () => {
    openPath.mockResolvedValue('No application is set to open this file.');
    await expect(openWithDefaultApplication(root, 'notes.md')).rejects.toBeInstanceOf(PathRefused);
  });
});

describe('revealInFileManager', () => {
  it('reveals a file inside the approved root', async () => {
    const result = await revealInFileManager(root, 'notes.md');
    expect(result.path).toBe('notes.md');
    expect(showItemInFolder).toHaveBeenCalledWith(path.join(sandbox, 'notes.md'));
  });

  it('reveals an executable, which opening refuses', async () => {
    await expect(revealInFileManager(root, 'install.sh')).resolves.toMatchObject({ opened: true });
  });

  it('refuses a path outside the approved root', async () => {
    await expect(revealInFileManager(root, '../escape.md')).rejects.toBeInstanceOf(PathRefused);
    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it('fails when the file is gone', async () => {
    await expect(revealInFileManager(root, 'missing.md')).rejects.toBeTruthy();
  });
});
