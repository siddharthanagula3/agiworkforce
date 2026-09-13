import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listWorkspaceRoots = vi.fn();
const listWorkspaceFiles = vi.fn();
const pickWorkspaceRoot = vi.fn();
const readWorkspaceFile = vi.fn();
const openWorkspacePath = vi.fn();
const revealWorkspacePath = vi.fn();

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
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
