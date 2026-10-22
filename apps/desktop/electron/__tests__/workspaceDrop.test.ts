import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const messageBoxes: {
  message: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}[] = [];
const APPROVE = 1;
const CANCEL = 0;
const messageBoxResponse = { value: APPROVE };

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: async (_window: unknown, options: (typeof messageBoxes)[number]) => {
      messageBoxes.push(options);
      return { response: messageBoxResponse.value };
    },
  },
}));

const grantRoot = vi.fn(async (path: string) => ({ id: 'r1', path }));
class WorkspaceGrantRefused extends Error {}
vi.mock('../runtime/workspaceStore', () => ({
  grantRoot: (path: string) => grantRoot(path),
  WorkspaceGrantRefused,
}));

const { handleWorkspaceDrop } = await import('../workspaceDrop');

const window = { isDestroyed: () => false } as never;
const onGranted = vi.fn();

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIRECTORY = dirname(THIS_FILE);
const MISSING_PATH = join(THIS_DIRECTORY, 'no-such-entry-for-this-test');

beforeEach(() => {
  messageBoxes.length = 0;
  messageBoxResponse.value = APPROVE;
  grantRoot.mockClear();
  onGranted.mockClear();
});

describe('a drop on the window', () => {
  it('asks for a grant on a dropped folder and records the approval', async () => {
    await handleWorkspaceDrop(window, [THIS_DIRECTORY], onGranted);

    expect(messageBoxes).toHaveLength(1);
    expect(grantRoot).toHaveBeenCalledWith(THIS_DIRECTORY);
    expect(onGranted).toHaveBeenCalledWith('r1');
  });

  // What is granted is where the dropped name leads. A link named for one
  // folder and pointing at another used to be shown by its own name.
  it('shows the folder a dropped link leads to, says it was a link, and grants that folder', async () => {
    const scratch = await realpath(await mkdtemp(join(tmpdir(), 'agi-drop-')));
    try {
      await mkdir(join(scratch, 'Documents'));
      await symlink(join(scratch, 'Documents'), join(scratch, 'tpl'));

      await handleWorkspaceDrop(window, [join(scratch, 'tpl')], onGranted);

      const [prompt] = messageBoxes as Array<{ message: string; detail?: string }>;
      const lines = (prompt?.detail ?? '').split('\n').filter((line) => line !== '');
      expect(prompt?.message).toBe('Let AGI Desktop open this folder?');
      expect(lines).toContain(`Folder: ${join(scratch, 'Documents')}`);
      expect(lines.at(-1)).toMatch(
        new RegExp(`^You dropped: ${join(scratch, 'tpl')}, which is a link`, 'u'),
      );
      expect(grantRoot).toHaveBeenCalledWith(join(scratch, 'Documents'));
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('names a folder dropped as itself once, with no word about a link', async () => {
    await handleWorkspaceDrop(window, [THIS_DIRECTORY], onGranted);

    const [prompt] = messageBoxes as Array<{ detail?: string }>;
    expect(prompt?.detail).toContain(`Folder: ${THIS_DIRECTORY}`);
    expect(prompt?.detail).not.toContain('You dropped');
  });

  it('leaves dropped files to the page rather than prompting for them', async () => {
    await handleWorkspaceDrop(window, [THIS_FILE], onGranted);

    expect(messageBoxes).toHaveLength(0);
    expect(grantRoot).not.toHaveBeenCalled();
  });

  // Return and Escape both land on the default, and a drop is easy to make by
  // accident, so the button a stray key presses must be the one that grants
  // nothing.
  it('makes Cancel the button a stray Return or Escape presses', async () => {
    await handleWorkspaceDrop(window, [THIS_DIRECTORY], onGranted);

    const [prompt] = messageBoxes;
    expect(prompt?.buttons?.[prompt.defaultId ?? -1]).toBe('Cancel');
    expect(prompt?.buttons?.[prompt.cancelId ?? -1]).toBe('Cancel');
    expect(prompt?.buttons?.[APPROVE]).toBe('Approve folder');
  });

  it('grants nothing when the prompt is declined', async () => {
    messageBoxResponse.value = CANCEL;

    await handleWorkspaceDrop(window, [THIS_DIRECTORY], onGranted);

    expect(grantRoot).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('reports a refusal from the store instead of failing silently', async () => {
    grantRoot.mockRejectedValueOnce(new WorkspaceGrantRefused('That location is too broad.'));

    await handleWorkspaceDrop(window, [THIS_DIRECTORY], onGranted);

    expect(messageBoxes).toHaveLength(2);
    expect(messageBoxes[1]?.message).toBe('That location is too broad.');
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('ignores a path that no longer exists', async () => {
    await handleWorkspaceDrop(window, [MISSING_PATH], onGranted);

    expect(messageBoxes).toHaveLength(0);
  });

  it('asks once for a folder a touch drag delivered twice', async () => {
    await handleWorkspaceDrop(window, [THIS_DIRECTORY, THIS_DIRECTORY], onGranted);

    expect(messageBoxes).toHaveLength(1);
    expect(grantRoot).toHaveBeenCalledTimes(1);
  });

  it('stops prompting once the window this drop landed on is gone', async () => {
    const closing = { isDestroyed: () => messageBoxes.length >= 1 } as never;
    messageBoxResponse.value = CANCEL;

    await handleWorkspaceDrop(closing, [THIS_DIRECTORY, dirname(THIS_DIRECTORY)], onGranted);

    expect(messageBoxes).toHaveLength(1);
  });
});
