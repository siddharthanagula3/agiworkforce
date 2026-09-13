import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const messageBoxes: { message: string }[] = [];
const messageBoxResponse = { value: 0 };

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: async (_window: unknown, options: { message: string }) => {
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

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIRECTORY = dirname(THIS_FILE);
const MISSING_PATH = join(THIS_DIRECTORY, 'no-such-entry-for-this-test');

beforeEach(() => {
  messageBoxes.length = 0;
  messageBoxResponse.value = 0;
  grantRoot.mockClear();
});

describe('a drop on the window', () => {
  it('asks for a grant on a dropped folder and records the approval', async () => {
    await handleWorkspaceDrop(window, [THIS_DIRECTORY]);

    expect(messageBoxes).toHaveLength(1);
    expect(grantRoot).toHaveBeenCalledWith(THIS_DIRECTORY);
  });

  it('leaves dropped files to the page rather than prompting for them', async () => {
    await handleWorkspaceDrop(window, [THIS_FILE]);

    expect(messageBoxes).toHaveLength(0);
    expect(grantRoot).not.toHaveBeenCalled();
  });

  it('grants nothing when the prompt is declined', async () => {
    messageBoxResponse.value = 1;

    await handleWorkspaceDrop(window, [THIS_DIRECTORY]);

    expect(grantRoot).not.toHaveBeenCalled();
  });

  it('reports a refusal from the store instead of failing silently', async () => {
    grantRoot.mockRejectedValueOnce(new WorkspaceGrantRefused('That location is too broad.'));

    await handleWorkspaceDrop(window, [THIS_DIRECTORY]);

    expect(messageBoxes).toHaveLength(2);
    expect(messageBoxes[1]?.message).toBe('That location is too broad.');
  });

  it('ignores a path that no longer exists', async () => {
    await handleWorkspaceDrop(window, [MISSING_PATH]);

    expect(messageBoxes).toHaveLength(0);
  });
});
