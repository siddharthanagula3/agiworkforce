import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WorkspaceGitState, WorkspaceRoot } from '@agiworkforce/local-runtime-contract';

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

function countPorcelain(
  lines: string[],
): Pick<WorkspaceGitState, 'staged' | 'unstaged' | 'untracked'> {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of lines) {
    if (line.length < 2) continue;
    const index = line[0];
    const worktree = line[1];
    if (index === '?' && worktree === '?') {
      untracked += 1;
      continue;
    }
    if (index && index !== ' ') staged += 1;
    if (worktree && worktree !== ' ') unstaged += 1;
  }

  return { staged, unstaged, untracked };
}

function parseAheadBehind(raw: string | null): { ahead: number; behind: number } {
  if (!raw) return { ahead: 0, behind: 0 };
  const [behindRaw, aheadRaw] = raw.split(/\s+/);
  return {
    ahead: Number.parseInt(aheadRaw ?? '0', 10) || 0,
    behind: Number.parseInt(behindRaw ?? '0', 10) || 0,
  };
}

async function detectOperation(cwd: string): Promise<WorkspaceGitState['operation']> {
  const gitDir = await gitOrNull(cwd, ['rev-parse', '--git-dir']);
  if (!gitDir) return 'none';

  const probes: Array<[string, WorkspaceGitState['operation']]> = [
    ['MERGE_HEAD', 'merge'],
    ['REBASE_HEAD', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['BISECT_LOG', 'bisect'],
  ];

  for (const [ref, operation] of probes) {
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

  const counts = countPorcelain(statusRaw ? statusRaw.split('\n').filter(Boolean) : []);
  const { ahead, behind } = parseAheadBehind(aheadBehindRaw);

  return {
    root,
    branch,
    detachedHead: branch === null,
    headSha,
    upstream,
    remotes: remotesRaw ? remotesRaw.split('\n').filter(Boolean) : [],
    ahead,
    behind,
    ...counts,
    operation: await detectOperation(root),
    worktree,
  };
}

export async function readWorkspaceGit(root: WorkspaceRoot): Promise<WorkspaceGitState | null> {
  return readGitState(root.path);
}

export { countPorcelain, parseAheadBehind };
