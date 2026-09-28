import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parseWorkingTreeStatus,
  type LocalBranchPush,
  type LocalBranches,
  type WorkingTreeChanges,
  type WorkspaceGitState,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
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
const WORKING_TREE_DIFF_LIMIT = 200_000;
const STATUS_ARGS = ['status', '--porcelain=v1', '--untracked-files=all'];
const LOCAL_BRANCH_LIMIT = 500;
const PUSH_TIMEOUT_MS = 120_000;
const PUSH_REMOTE = 'origin';

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
async function git(
  cwd: string,
  args: string[],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd,
    timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    windowsHide: true,
    ...(options.env ? { env: options.env } : {}),
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

export async function readWorkingTreeChanges(
  directory: string,
): Promise<WorkingTreeChanges | null> {
  const root = await findRepositoryRoot(directory);
  if (!root) return null;
  const status = await git(root, STATUS_ARGS);
  const diff = (await gitOrNull(root, ['diff', '--no-color', '--no-ext-diff', 'HEAD'])) ?? '';
  return {
    files: parseWorkingTreeStatus(status),
    diff: diff.slice(0, WORKING_TREE_DIFF_LIMIT),
    diffTruncated: diff.length > WORKING_TREE_DIFF_LIMIT,
  };
}

export async function discardWorkingTreeChanges(
  directory: string,
  paths: readonly string[],
): Promise<string[]> {
  const root = await findRepositoryRoot(directory);
  if (!root)
    throw new Error('This folder is not a git repository, so there is nothing to discard.');
  const changed = new Map(
    parseWorkingTreeStatus(await git(root, STATUS_ARGS)).map((change) => [change.path, change]),
  );
  const chosen = paths.map((path) => {
    const change = changed.get(path);
    if (!change) throw new Error(`${path} has no changes to discard.`);
    if (change.state === 'conflicted') {
      throw new Error(`${path} has a merge conflict. Resolve it before discarding it.`);
    }
    return change;
  });

  const removed = chosen
    .filter((change) => change.state === 'added' || change.state === 'renamed')
    .map((change) => change.path);
  const restored = chosen.flatMap((change) => {
    if (change.state === 'modified' || change.state === 'deleted') return [change.path];
    return change.state === 'renamed' && change.originalPath ? [change.originalPath] : [];
  });
  const cleaned = chosen
    .filter((change) => change.state === 'untracked')
    .map((change) => change.path);

  if (removed.length > 0) await git(root, ['rm', '-f', '--quiet', '--', ...removed]);
  if (restored.length > 0) {
    await git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...restored]);
  }
  if (cleaned.length > 0) await git(root, ['clean', '-f', '--quiet', '--', ...cleaned]);
  return chosen.map((change) => change.path);
}

export async function listLocalBranches(directory: string): Promise<LocalBranches | null> {
  const root = await findRepositoryRoot(directory);
  if (!root) return null;
  const listed = await git(root, [
    'for-each-ref',
    `--count=${LOCAL_BRANCH_LIMIT}`,
    '--sort=-committerdate',
    '--format=%(refname:short)',
    'refs/heads',
  ]);
  return {
    current: await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']),
    branches: listed.split('\n').filter(Boolean),
    remoteUrl: await gitOrNull(root, ['remote', 'get-url', PUSH_REMOTE]),
    baseBranch: await remoteDefaultBranch(root),
  };
}

async function remoteDefaultBranch(root: string): Promise<string | null> {
  const remoteHead = await gitOrNull(root, [
    'symbolic-ref',
    '--short',
    '--quiet',
    `refs/remotes/${PUSH_REMOTE}/HEAD`,
  ]);
  return remoteHead ? remoteHead.slice(PUSH_REMOTE.length + 1) : null;
}

export async function switchLocalBranch(directory: string, branch: string): Promise<string> {
  const root = await findRepositoryRoot(directory);
  if (!root) throw new Error('This folder is not a git repository, so it has no branches.');
  const known = await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  if (!known.split('\n').includes(branch)) {
    throw new Error(`${branch} is not a branch in this repository.`);
  }
  await git(root, ['switch', branch]);
  return branch;
}

export async function pushLocalBranch(directory: string): Promise<LocalBranchPush> {
  const root = await findRepositoryRoot(directory);
  if (!root) throw new Error('This folder is not a git repository, so there is nothing to push.');
  const branch = await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  if (!branch) throw new Error('Check out a branch before opening a pull request.');
  const remoteUrl = await gitOrNull(root, ['remote', 'get-url', PUSH_REMOTE]);
  if (!remoteUrl) throw new Error('This repository has no origin remote to push to.');
  await git(root, ['push', '--set-upstream', PUSH_REMOTE, branch], {
    timeoutMs: PUSH_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return { branch, remoteUrl, baseBranch: await remoteDefaultBranch(root) };
}
