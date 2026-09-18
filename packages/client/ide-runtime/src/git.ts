/**
 * Git semantics shared by every surface: the same porcelain columns, the same
 * ahead/behind direction, the same in-progress operation and the same way of
 * naming a head. A surface supplies git's raw output; none of them re-decide
 * what it means.
 */

export const GIT_OPERATIONS = [
  'none',
  'merge',
  'rebase',
  'cherry-pick',
  'bisect',
  'revert',
] as const;
export type GitOperation = (typeof GIT_OPERATIONS)[number];

/**
 * The ref whose presence means each operation is in progress, in the order a
 * caller should probe them: an interrupted rebase can leave MERGE_HEAD behind,
 * so the more specific state is asked about first.
 */
export const GIT_OPERATION_PROBES: readonly (readonly [string, GitOperation])[] = [
  ['REBASE_HEAD', 'rebase'],
  ['CHERRY_PICK_HEAD', 'cherry-pick'],
  ['REVERT_HEAD', 'revert'],
  ['MERGE_HEAD', 'merge'],
  ['BISECT_LOG', 'bisect'],
];

export interface GitStatusCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/**
 * Count `git status --porcelain` lines.
 *
 * Column one is the index and column two is the worktree, so the line must not
 * be trimmed on the left: an unstaged edit arrives as a leading space, and
 * shifting it left reports the change as staged. An unmerged path occupies both
 * columns and is neither staged nor unstaged, it is conflicted.
 */
export function countPorcelainStatus(lines: readonly string[]): GitStatusCounts {
  const counts: GitStatusCounts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };

  for (const line of lines) {
    if (line.length < 2) continue;
    const index = line[0] ?? ' ';
    const worktree = line[1] ?? ' ';
    if (index === '?' && worktree === '?') {
      counts.untracked += 1;
      continue;
    }
    if (CONFLICT_CODES.has(`${index}${worktree}`)) {
      counts.conflicted += 1;
      continue;
    }
    if (index !== ' ') counts.staged += 1;
    if (worktree !== ' ') counts.unstaged += 1;
  }

  return counts;
}

/**
 * Read `git rev-list --left-right --count <upstream>...HEAD`: the left column
 * counts commits only the upstream has (behind) and the right column commits
 * only HEAD has (ahead). Reading them the other way round is the usual bug.
 */
export function parseAheadBehind(raw: string | null): { ahead: number; behind: number } {
  if (!raw) return { ahead: 0, behind: 0 };
  const [behindRaw, aheadRaw] = raw.trim().split(/\s+/);
  return {
    ahead: Number.parseInt(aheadRaw ?? '0', 10) || 0,
    behind: Number.parseInt(behindRaw ?? '0', 10) || 0,
  };
}

export interface GitHead {
  branch: string | null;
  headSha: string | null;
}

export function isDetachedHead(head: GitHead): boolean {
  return head.branch === null;
}

export const SHORT_SHA_LENGTH = 7;

/**
 * One label for a head, matching the CLI's own rendering: a detached HEAD and a
 * branch with no commits yet read as themselves rather than as "no branch".
 */
export function describeGitHead(head: GitHead): string {
  if (head.branch) {
    return head.headSha ? head.branch : `${head.branch} (no commits yet)`;
  }
  if (!head.headSha) return 'HEAD (no commits yet)';
  return `detached at ${head.headSha.slice(0, SHORT_SHA_LENGTH)}`;
}
