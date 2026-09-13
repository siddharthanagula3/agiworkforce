import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRoot } from '@agiworkforce/local-runtime-contract';

const openPath = vi.fn<(target: string) => Promise<string>>();
const showItemInFolder = vi.fn<(target: string) => void>();

vi.mock('electron', () => ({ shell: { openPath, showItemInFolder } }));

const { openWithDefaultApplication, revealInFileManager } = await import('../runtime/appsService');
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
