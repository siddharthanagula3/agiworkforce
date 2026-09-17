import { execFileSync } from 'node:child_process';

/**
 * Runs git inside a throwaway fixture directory with the caller's git
 * environment scrubbed.
 *
 * On 2026-09-17 a guard fixture called `git init` with `GIT_WORK_TREE`
 * inherited from the shell. Git recorded that path as `core.worktree` in the
 * repository it found, which was the shared checkout, and from then on
 * `git status` there described a scratch tree: ninety files of uncommitted
 * work read as clean, and a commit would have captured the wrong tree. The
 * fixture's `git add` staged its sandbox into the shared index in the same
 * run.
 *
 * A fixture must not be able to reach the repository it is being run from, so
 * every `GIT_*` variable is dropped rather than trusted, and the sandbox is
 * addressed by `--git-dir` and `--work-tree` explicitly.
 */
const GIT_ENV_PREFIX = 'GIT_';

export function sandboxGitEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith(GIT_ENV_PREFIX)));
}

export function sandboxGit(cwd, args, options = {}) {
  return execFileSync('git', ['--git-dir', '.git', '--work-tree', '.', ...args], {
    ...options,
    cwd,
    env: sandboxGitEnv(),
  });
}

export function initSandboxRepository(cwd, options = {}) {
  execFileSync('git', ['init', '--quiet'], { ...options, cwd, env: sandboxGitEnv() });
}
