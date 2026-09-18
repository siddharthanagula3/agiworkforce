import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WorkspaceGitState, WorkspaceRoot } from '@agiworkforce/local-runtime-contract';
import {
  countPorcelainStatus,
  describeGitHead,
  GIT_OPERATION_PROBES,
  isDetachedHead,
  parseAheadBehind,
} from '@agiworkforce/ide-runtime/git';

const run = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Runs git with an argument array.
 *
 * Never build a command string here. `execFile` without a shell means a branch
 * name containing a semicolon is a branch name, not a second command, and that
 * property is the reason this wrapper exists at all.
 *
 * Only trailing whitespace is stripped. `status --porcelain` encodes the index
 * in column one and the worktree in column two, so an unstaged edit arrives as
 * a leading space; trimming both ends shifts every status left by one and
 * reports it as staged.
 */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    windowsHide: true,
  });
  return stdout.trimEnd();
}

async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

export async function findRepositoryRoot(directory: string): Promise<string | null> {
  return gitOrNull(directory, ['rev-parse', '--show-toplevel']);
}

async function detectOperation(cwd: string): Promise<WorkspaceGitState['operation']> {
  const gitDir = await gitOrNull(cwd, ['rev-parse', '--git-dir']);
  if (!gitDir) return 'none';

  for (const [ref, operation] of GIT_OPERATION_PROBES) {
    // The workspace contract has no `revert` state, so a revert reads as none.
    if (operation === 'revert') continue;
    const found = await gitOrNull(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    if (found) return operation;
  }
  return 'none';
}

export async function readGitState(directory: string): Promise<WorkspaceGitState | null> {
  const root = await findRepositoryRoot(directory);
  if (!root) return null;

  const branch = await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  const headSha = await gitOrNull(root, ['rev-parse', 'HEAD']);
  const upstream = await gitOrNull(root, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const remotesRaw = await gitOrNull(root, ['remote']);
  const statusRaw = await gitOrNull(root, ['status', '--porcelain']);
  const aheadBehindRaw = upstream
    ? await gitOrNull(root, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`])
    : null;
  const worktree = (await gitOrNull(root, ['rev-parse', '--show-toplevel'])) ?? root;

  const counts = countPorcelainStatus(statusRaw ? statusRaw.split('\n').filter(Boolean) : []);
  const { ahead, behind } = parseAheadBehind(aheadBehindRaw);

  return {
    root,
    branch,
    detachedHead: isDetachedHead({ branch, headSha }),
    headSha,
    upstream,
    remotes: remotesRaw ? remotesRaw.split('\n').filter(Boolean) : [],
    ahead,
    behind,
    staged: counts.staged,
    unstaged: counts.unstaged,
    untracked: counts.untracked,
    operation: await detectOperation(root),
    worktree,
  };
}

/** The head label the CLI and the VS Code extension show for the same checkout. */
export async function readGitHeadLabel(directory: string): Promise<string | null> {
  const root = await findRepositoryRoot(directory);
  if (!root) return null;
  return describeGitHead({
    branch: await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']),
    headSha: await gitOrNull(root, ['rev-parse', 'HEAD']),
  });
}

export async function readWorkspaceGit(root: WorkspaceRoot): Promise<WorkspaceGitState | null> {
  return readGitState(root.path);
}

export async function readWorkingTreeDiff(
  directory: string,
  paths: readonly string[],
): Promise<string | null> {
  if (paths.length === 0) return null;
  return gitOrNull(directory, ['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', ...paths]);
}
