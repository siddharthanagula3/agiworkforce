import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangesPanel } from '@/features/git/ChangesPanel';
import { invoke } from '@/lib/tauri-mock';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

const mockInvoke = vi.mocked(invoke);

const STATUS = {
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: ['src/ready.ts'],
  unstaged: ['src/edited.ts'],
  untracked: ['notes.md'],
  conflicts: [],
};

function answer(overrides: Record<string, unknown> = {}) {
  mockInvoke.mockImplementation((command: string) => {
    if (command in overrides) {
      const value = overrides[command];
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    if (command === 'git_status') return Promise.resolve(STATUS);
    if (command === 'git_list_branches') {
      return Promise.resolve([
        { name: 'main', is_current: true, last_commit: 'abc' },
        { name: 'feature', is_current: false, last_commit: 'def' },
      ]);
    }
    if (command === 'git_diff') return Promise.resolve([]);
    return Promise.resolve('ok');
  });
}

function calls(command: string) {
  return mockInvoke.mock.calls.filter(([name]) => name === command);
}

describe('ChangesPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    answer();
  });

  afterEach(cleanup);

  it('asks for a folder when the chat has none', () => {
    render(<ChangesPanel repoPath={null} />);
    expect(screen.getByText(/Choose a folder for this chat/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('says so when the folder is not a repository', async () => {
    answer({ git_status: new Error('could not find repository') });
    render(<ChangesPanel repoPath="/tmp/plain" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a Git repository/);
  });

  it('lists staged and unstaged files under the current branch', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    const staged = await screen.findByRole('region', { name: 'Staged' });
    expect(within(staged).getByText('src/ready.ts')).toBeInTheDocument();
    const changes = screen.getByRole('region', { name: 'Changes' });
    expect(within(changes).getByText('src/edited.ts')).toBeInTheDocument();
    expect(within(changes).getByText('notes.md')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main');
  });

  it('stages and unstages one file through the host', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Stage src/edited.ts' }));
    await waitFor(() =>
      expect(calls('git_add')).toEqual([['git_add', { path: '/repo', files: ['src/edited.ts'] }]]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unstage src/ready.ts' }));
    await waitFor(() =>
      expect(calls('git_reset')).toEqual([
        ['git_reset', { path: '/repo', commit: 'HEAD', mode: 'mixed', files: ['src/ready.ts'] }],
      ]),
    );
  });

  it('unstages everything by naming the staged files, not by resetting the branch', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Unstage all' }));
    await waitFor(() =>
      expect(calls('git_reset')[0]?.[1]).toEqual({
        path: '/repo',
        commit: 'HEAD',
        mode: 'mixed',
        files: ['src/ready.ts'],
      }),
    );
  });

  it('names the file it is about to discard and does nothing until confirmed', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard changes to src/edited.ts' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Discard changes to edited.ts?');
    expect(dialog).toHaveTextContent(/edited\.ts are deleted from disk/);
    expect(calls('git_checkout_files')).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect(calls('git_checkout_files')).toEqual([
        ['git_checkout_files', { path: '/repo', files: ['src/edited.ts'] }],
      ]),
    );
  });

  it('never offers to discard an untracked file, which checkout cannot restore', async () => {
    render(<ChangesPanel repoPath="/repo" />);
    await screen.findByText('notes.md');
    expect(
      screen.queryByRole('button', { name: 'Discard changes to notes.md' }),
    ).not.toBeInTheDocument();
  });

  it('cancelling the discard leaves the file alone', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Discard all' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('git_checkout_files')).toHaveLength(0);
  });

  it('commits the staged files with the message once one is written', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    const commit = await screen.findByRole('button', { name: 'Commit 1 staged' });
    expect(commit).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Commit message' }), {
      target: { value: 'fix: retry once' },
    });
    expect(commit).toBeEnabled();
    fireEvent.click(commit);

    await waitFor(() =>
      expect(calls('git_commit')).toEqual([
        ['git_commit', { path: '/repo', message: 'fix: retry once' }],
      ]),
    );
  });

  it('fetches and pulls through the host and reports what happened', async () => {
    answer({ git_pull: 'Already up to date' });
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fetch' }));
    await waitFor(() => expect(calls('git_fetch')).toEqual([['git_fetch', { path: '/repo' }]]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Fetched from the remote'));

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    await waitFor(() => expect(calls('git_pull')).toEqual([['git_pull', { path: '/repo' }]]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Already up to date'));
  });

  it('tells the user why a fetch or a pull did not happen', async () => {
    answer({
      git_fetch: new Error("remote 'origin' does not exist"),
      git_pull: new Error('Pull stopped before changing any file'),
    });
    render(<ChangesPanel repoPath="/repo" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fetch' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not fetch: remote 'origin' does not exist"),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not pull: Pull stopped before changing any file',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows how far the branch is from the remote', async () => {
    answer({ git_status: { ...STATUS, ahead: 1, behind: 2 } });
    render(<ChangesPanel repoPath="/repo" />);
    expect(await screen.findByText('2 behind, 1 ahead')).toBeInTheDocument();
  });

  it('names the branch and what is lost before deleting it, and waits for the answer', async () => {
    const user = userEvent.setup();
    render(<ChangesPanel repoPath="/repo" />);

    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(await screen.findByRole('option', { name: 'Delete a branch…' }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch to delete' }));
    expect(screen.queryByRole('option', { name: 'main' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'feature' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete branch feature?');
    expect(dialog).toHaveTextContent(/only on feature stop being on any branch/);
    expect(calls('git_delete_branch')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Delete branch' }));
    await waitFor(() =>
      expect(calls('git_delete_branch')).toEqual([
        ['git_delete_branch', { path: '/repo', branchName: 'feature' }],
      ]),
    );
    expect(screen.getByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
  });

  it('keeps the branch when the deletion is cancelled', async () => {
    const user = userEvent.setup();
    render(<ChangesPanel repoPath="/repo" />);

    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await user.click(await screen.findByRole('option', { name: 'Delete a branch…' }));
    await user.click(await screen.findByRole('combobox', { name: 'Branch to delete' }));
    await user.click(await screen.findByRole('option', { name: 'feature' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls('git_delete_branch')).toHaveLength(0);
  });

  it('does not offer to delete a branch when the current one is the only branch', async () => {
    const user = userEvent.setup();
    answer({ git_list_branches: [{ name: 'main', is_current: true, last_commit: 'abc' }] });
    render(<ChangesPanel repoPath="/repo" />);

    await user.click(await screen.findByRole('combobox', { name: 'Branch' }));
    await screen.findByRole('option', { name: 'New branch…' });
    expect(screen.queryByRole('option', { name: 'Delete a branch…' })).not.toBeInTheDocument();
  });

  it('shows the diff of the file chosen from the list', async () => {
    render(<ChangesPanel repoPath="/repo" />);

    // jsdom reports no display for spans, so its accessible name puts a space before the comma.
    fireEvent.click(await screen.findByRole('button', { name: /^src\/edited\.ts ?, modified$/ }));
    await waitFor(() =>
      expect(calls('git_diff')).toContainEqual([
        'git_diff',
        { path: '/repo', filePath: 'src/edited.ts', staged: false },
      ]),
    );
  });
});
