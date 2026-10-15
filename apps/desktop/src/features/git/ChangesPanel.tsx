import { useConfirmAction } from '@agiworkforce/ui';
import {
  AlertCircle,
  ArrowDownToLine,
  CloudDownload,
  FileMinus,
  FilePlus,
  FileQuestion,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { useGit, type GitStatus } from '../../hooks/useGit';
import { cn } from '../../lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Spinner } from '@/ui/Spinner';
import { GitDiffViewer } from './GitDiffViewer';

type Change = { path: string; kind: 'staged' | 'modified' | 'untracked' | 'conflict' };

const NEW_BRANCH = '__new_branch__';
const DELETE_BRANCH = '__delete_branch__';

const iconButton =
  'inline-flex size-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:opacity-50 pointer-coarse:size-11';

const textButton =
  'inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:opacity-50 pointer-coarse:min-h-11';

function listChanges(status: GitStatus): { staged: Change[]; unstaged: Change[] } {
  return {
    staged: status.staged.map((path) => ({ path, kind: 'staged' })),
    unstaged: [
      ...status.conflicts.map((path) => ({ path, kind: 'conflict' as const })),
      ...status.unstaged.map((path) => ({ path, kind: 'modified' as const })),
      ...status.untracked.map((path) => ({ path, kind: 'untracked' as const })),
    ],
  };
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

function namesOf(paths: string[]): string {
  const shown = paths.slice(0, 3).map(fileName).join(', ');
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

function syncSummary(status: GitStatus): string | null {
  const parts = [
    status.behind > 0 ? `${status.behind} behind` : null,
    status.ahead > 0 ? `${status.ahead} ahead` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function ChangeIcon({ kind }: { kind: Change['kind'] }) {
  const Icon =
    kind === 'conflict'
      ? AlertCircle
      : kind === 'untracked'
        ? FileQuestion
        : kind === 'staged'
          ? FilePlus
          : FileMinus;
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--chat-text-muted)]" />;
}

const KIND_LABEL: Record<Change['kind'], string> = {
  staged: 'staged',
  modified: 'modified',
  untracked: 'new file',
  conflict: 'conflict',
};

export function ChangesPanel({ repoPath }: { repoPath: string | null }) {
  const git = useGit(repoPath);
  const { confirm, dialog } = useConfirmAction();
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [newBranch, setNewBranch] = useState<string | null>(null);
  const [choosingBranchToDelete, setChoosingBranchToDelete] = useState(false);

  if (!repoPath) {
    return (
      <p className="p-4 text-sm text-[var(--chat-text-secondary)]">
        Choose a folder for this chat to review its changes here.
      </p>
    );
  }

  if (!git.status) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 text-sm text-[var(--chat-text-secondary)]">
        {git.error ? (
          <>
            <p role="alert">This folder is not a Git repository, or Git could not read it.</p>
            <p className="font-mono text-xs break-all text-[var(--chat-text-muted)]">{git.error}</p>
            <button type="button" className={textButton} onClick={() => void git.refresh()}>
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Try again
            </button>
          </>
        ) : (
          <Spinner size="sm" />
        )}
      </div>
    );
  }

  const { staged, unstaged } = listChanges(git.status);
  const discardable = unstaged.filter((change) => change.kind === 'modified').map((c) => c.path);
  const canCommit = staged.length > 0 && message.trim().length > 0 && !git.loading;
  const currentBranch = git.status.branch;
  const otherBranches = git.branches.filter((branch) => branch.name !== currentBranch);
  const sync = syncSummary(git.status);

  const askDeleteBranch = (name: string) => {
    setChoosingBranchToDelete(false);
    confirm({
      title: `Delete branch ${name}?`,
      description: `Commits that are only on ${name} stop being on any branch, and this panel cannot bring them back. ${currentBranch} and its files are not changed.`,
      confirmLabel: 'Delete branch',
      destructive: true,
      onConfirm: async () => {
        await git.deleteBranch(name);
      },
    });
  };

  const askDiscard = (paths: string[]) => {
    confirm({
      title:
        paths.length === 1
          ? `Discard changes to ${fileName(paths[0] ?? '')}?`
          : `Discard changes to ${paths.length} files?`,
      description: `Your uncommitted edits to ${namesOf(paths)} are deleted from disk. Git cannot bring them back.`,
      confirmLabel: 'Discard changes',
      destructive: true,
      onConfirm: async () => {
        if ((await git.discard(paths)) && selected && paths.includes(selected.path)) {
          setSelected(null);
        }
      },
    });
  };

  const submitCommit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canCommit) return;
    if (await git.commit(message.trim())) {
      setMessage('');
      setSelected(null);
    }
  };

  const onMessageKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitCommit();
    }
  };

  const submitBranch = async (event: FormEvent) => {
    event.preventDefault();
    const name = newBranch?.trim();
    if (!name) return;
    if (await git.createBranch(name)) setNewBranch(null);
  };

  const renderRow = (change: Change) => {
    const isStaged = change.kind === 'staged';
    const isSelected = selected?.path === change.path && selected.staged === isStaged;
    return (
      <li
        key={`${change.kind}:${change.path}`}
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1',
          isSelected
            ? 'bg-[var(--chat-surface-hover)]'
            : 'hover:bg-[var(--chat-surface-hover)] focus-within:bg-[var(--chat-surface-hover)]',
        )}
      >
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={() => setSelected(isSelected ? null : { path: change.path, staged: isStaged })}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
          title={change.path}
        >
          <ChangeIcon kind={change.kind} />
          <span className="truncate font-mono text-sm text-[var(--chat-text-primary)]">
            {change.path}
          </span>
          <span className="sr-only">, {KIND_LABEL[change.kind]}</span>
        </button>
        <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
          {change.kind === 'modified' && (
            <button
              type="button"
              className={iconButton}
              disabled={git.loading}
              onClick={() => askDiscard([change.path])}
              aria-label={`Discard changes to ${change.path}`}
              title="Discard changes"
            >
              <Undo2 aria-hidden="true" className="size-4" />
            </button>
          )}
          {isStaged ? (
            <button
              type="button"
              className={iconButton}
              disabled={git.loading}
              onClick={() => void git.unstage([change.path])}
              aria-label={`Unstage ${change.path}`}
              title="Unstage"
            >
              <Minus aria-hidden="true" className="size-4" />
            </button>
          ) : (
            change.kind !== 'conflict' && (
              <button
                type="button"
                className={iconButton}
                disabled={git.loading}
                onClick={() => void git.stage([change.path])}
                aria-label={`Stage ${change.path}`}
                title="Stage"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            )
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, changes: Change[], actions: ReactNode): ReactNode =>
    changes.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2 pt-2">
          <h3 className="text-xs font-medium text-[var(--chat-text-secondary)]">
            {title} <span className="text-[var(--chat-text-muted)]">{changes.length}</span>
          </h3>
          <div className="flex items-center">{actions}</div>
        </div>
        <ul className="flex flex-col">{changes.map(renderRow)}</ul>
      </section>
    );

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--chat-text-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--chat-border)] px-3 py-2">
        <GitBranch aria-hidden="true" className="size-4 shrink-0 text-[var(--chat-text-muted)]" />
        {choosingBranchToDelete ? (
          <div className="flex min-w-0 flex-1 gap-1">
            <Select onValueChange={askDeleteBranch} disabled={git.loading}>
              <SelectTrigger aria-label="Branch to delete" className="h-8 min-w-0 flex-1 text-sm">
                <SelectValue placeholder="Choose a branch to delete" />
              </SelectTrigger>
              <SelectContent>
                {otherBranches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              className={textButton}
              onClick={() => setChoosingBranchToDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : newBranch === null ? (
          <Select
            value={git.status.branch}
            onValueChange={(value) => {
              if (value === NEW_BRANCH) setNewBranch('');
              else if (value === DELETE_BRANCH) setChoosingBranchToDelete(true);
              else if (value !== git.status?.branch) void git.checkout(value);
            }}
            disabled={git.loading}
          >
            <SelectTrigger aria-label="Branch" className="h-8 min-w-0 flex-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {git.branches.map((branch) => (
                <SelectItem key={branch.name} value={branch.name}>
                  {branch.name}
                </SelectItem>
              ))}
              {!git.branches.some((branch) => branch.name === git.status?.branch) && (
                <SelectItem value={git.status.branch}>{git.status.branch}</SelectItem>
              )}
              <SelectItem value={NEW_BRANCH}>New branch…</SelectItem>
              {otherBranches.length > 0 && (
                <SelectItem value={DELETE_BRANCH}>Delete a branch…</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <form onSubmit={(event) => void submitBranch(event)} className="flex flex-1 gap-1">
            <input
              autoFocus
              aria-label="New branch name"
              value={newBranch}
              onChange={(event) => setNewBranch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNewBranch(null);
              }}
              placeholder="new-branch-name"
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--chat-border)] bg-[var(--chat-input-bg)] px-2 font-mono text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
            />
            <button type="submit" className={textButton} disabled={!newBranch.trim()}>
              Create
            </button>
            <button type="button" className={textButton} onClick={() => setNewBranch(null)}>
              Cancel
            </button>
          </form>
        )}
        <button
          type="button"
          className={iconButton}
          onClick={() => void git.refresh()}
          disabled={git.loading}
          aria-label="Refresh changes"
          title="Refresh"
        >
          {git.loading ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--chat-border)] px-2 py-1">
        <button
          type="button"
          className={textButton}
          disabled={git.loading}
          onClick={() => void git.fetch()}
        >
          <CloudDownload aria-hidden="true" className="size-3.5" />
          Fetch
        </button>
        <button
          type="button"
          className={textButton}
          disabled={git.loading}
          onClick={() => void git.pull()}
        >
          <ArrowDownToLine aria-hidden="true" className="size-3.5" />
          Pull
        </button>
        {sync && (
          <span className="ml-auto pr-1 text-xs text-[var(--chat-text-secondary)]">
            <span className="sr-only">Compared with the remote: </span>
            {sync}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {staged.length === 0 && unstaged.length === 0 ? (
          <p className="p-3 text-sm text-[var(--chat-text-secondary)]">
            No changes in this folder.
          </p>
        ) : (
          <>
            {section(
              'Staged',
              staged,
              <button
                type="button"
                className={textButton}
                disabled={git.loading}
                onClick={() => void git.unstage(staged.map((change) => change.path))}
              >
                Unstage all
              </button>,
            )}
            {section(
              'Changes',
              unstaged,
              <>
                {discardable.length > 0 && (
                  <button
                    type="button"
                    className={textButton}
                    disabled={git.loading}
                    onClick={() => askDiscard(discardable)}
                  >
                    Discard all
                  </button>
                )}
                <button
                  type="button"
                  className={textButton}
                  disabled={git.loading}
                  onClick={() =>
                    void git.stage(
                      unstaged
                        .filter((change) => change.kind !== 'conflict')
                        .map((change) => change.path),
                    )
                  }
                >
                  Stage all
                </button>
              </>,
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="flex max-h-[50%] min-h-0 flex-1 flex-col border-t border-[var(--chat-border)]">
          <GitDiffViewer
            repoPath={repoPath}
            filePath={selected.path}
            staged={selected.staged}
            className="min-h-0 flex-1 rounded-none border-0"
          />
        </div>
      )}

      <form
        onSubmit={(event) => void submitCommit(event)}
        className="flex flex-col gap-2 border-t border-[var(--chat-border)] p-3"
      >
        <textarea
          aria-label="Commit message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={onMessageKey}
          rows={2}
          placeholder={staged.length > 0 ? 'Commit message' : 'Stage changes to commit them'}
          className="w-full resize-none rounded-md border border-[var(--chat-border)] bg-[var(--chat-input-bg)] px-2 py-1.5 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        />
        <button
          type="submit"
          disabled={!canCommit}
          className="min-h-8 rounded-md bg-[var(--chat-accent-primary)] px-3 text-sm font-medium text-[var(--chat-accent-on-primary)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {staged.length > 0 ? `Commit ${staged.length} staged` : 'Commit'}
        </button>
      </form>
      {dialog}
    </div>
  );
}
