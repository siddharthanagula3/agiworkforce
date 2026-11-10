import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listWorkspaceRoots = vi.fn();
const listWorkspaceFiles = vi.fn();
const pickWorkspaceRoot = vi.fn();
const readWorkspaceFile = vi.fn();
const openWorkspacePath = vi.fn();
const revealWorkspacePath = vi.fn();
let workspaceChanged: (() => void) | null = null;
const onWorkspaceChanged = (listener: () => void) => {
  workspaceChanged = listener;
  return () => {
    workspaceChanged = null;
  };
};

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
  onWorkspaceChanged,
  listWorkspaceFiles,
  pickWorkspaceRoot,
  readWorkspaceFile,
  openWorkspacePath,
  revealWorkspacePath,
}));

const { LocalFolderAttachDialog } = await import('../components/LocalFolderAttachDialog');

const root = {
  id: 'root-1',
  path: '/Users/me/project',
  name: 'project',
  grantedAtMs: 0,
  lastOpenedAtMs: 0,
};

const entry = {
  name: 'notes.md',
  path: 'notes.md',
  kind: 'file' as const,
  sizeBytes: 10,
  modifiedAtMs: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  listWorkspaceRoots.mockResolvedValue([root]);
  listWorkspaceFiles.mockResolvedValue([entry]);
  openWorkspacePath.mockResolvedValue({ path: entry.path, opened: true });
  revealWorkspacePath.mockResolvedValue({ path: entry.path, opened: true });
});

describe('LocalFolderAttachDialog row actions', () => {
  it('rereads the approved folders when one is dropped on the window while it is open', async () => {
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);
    await screen.findByRole('button', { name: 'Open notes.md with the default app' });
    expect(listWorkspaceRoots).toHaveBeenCalledTimes(1);

    act(() => workspaceChanged?.());

    await waitFor(() => expect(listWorkspaceRoots).toHaveBeenCalledTimes(2));
  });

  it('opens a row with the default app', async () => {
    const user = userEvent.setup();
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    await user.click(
      await screen.findByRole('button', { name: 'Open notes.md with the default app' }),
    );

    await waitFor(() => expect(openWorkspacePath).toHaveBeenCalledWith('root-1', 'notes.md'));
  });

  it('reveals a row in the file manager', async () => {
    const user = userEvent.setup();
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Show notes.md in Finder' }));

    await waitFor(() => expect(revealWorkspacePath).toHaveBeenCalledWith('root-1', 'notes.md'));
  });

  it('reports a refusal instead of doing nothing visible', async () => {
    const user = userEvent.setup();
    openWorkspacePath.mockRejectedValue(new Error('nope'));
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    await user.click(
      await screen.findByRole('button', { name: 'Open notes.md with the default app' }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('leaves attaching to the row itself', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    readWorkspaceFile.mockResolvedValue(new File(['x'], 'notes.md', { type: 'text/markdown' }));
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={onAttach} />);

    await user.click(await screen.findByRole('button', { name: 'notes.md' }));

    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1));
    expect(openWorkspacePath).not.toHaveBeenCalled();
  });
});

describe('LocalFolderAttachDialog listing custody', () => {
  it('drops a folder listing that finishes after another folder was chosen', async () => {
    const user = userEvent.setup();
    const second = { ...root, id: 'root-2', name: 'other', path: '/Users/me/other' };
    const firstListing = { ...entry, name: 'first.md', path: 'first.md' };
    const secondListing = { ...entry, name: 'second.md', path: 'second.md' };
    let resolveFirst: (value: unknown) => void = () => undefined;
    listWorkspaceRoots.mockResolvedValue([root, second]);
    listWorkspaceFiles.mockImplementation((rootId: string) =>
      rootId === 'root-1'
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve([secondListing]),
    );
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'other' }));
    await screen.findByRole('button', { name: 'second.md' });

    await act(async () => {
      resolveFirst([firstListing]);
    });

    expect(screen.queryByRole('button', { name: 'first.md' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'second.md' })).toBeInTheDocument();
  });

  it('keeps showing the loading state when the retired listing fails', async () => {
    const user = userEvent.setup();
    const second = { ...root, id: 'root-2', name: 'other', path: '/Users/me/other' };
    let rejectFirst: (reason: unknown) => void = () => undefined;
    let resolveSecond: (value: unknown) => void = () => undefined;
    listWorkspaceRoots.mockResolvedValue([root, second]);
    listWorkspaceFiles.mockImplementation((rootId: string) =>
      rootId === 'root-1'
        ? new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
        : new Promise((resolve) => {
            resolveSecond = resolve;
          }),
    );
    render(<LocalFolderAttachDialog open onClose={vi.fn()} onAttach={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'other' }));
    await act(async () => {
      rejectFirst(new Error('gone'));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond([entry]);
    });
    expect(await screen.findByRole('button', { name: 'notes.md' })).toBeInTheDocument();
  });
});
