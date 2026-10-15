import { execFile } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  GIT_OPERATION_PROBES,
  isDetachedHead,
  parseAheadBehind,
} from '@agiworkforce/ide-runtime/git';
import { resolveExistingPrefix } from './shellSandbox';

const run = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;
const WORKING_TREE_DIFF_LIMIT = 200_000;
const LOCAL_BRANCH_LIMIT = 500;
const PUSH_TIMEOUT_MS = 120_000;
const PUSH_REMOTE = 'origin';

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

/**
 * The only variables git inherits. Anything else, such as `GIT_DIR`,
 * `GIT_CONFIG_PARAMETERS` or `GIT_EXTERNAL_DIFF`, would let the environment
 * redirect or extend what the host's git does. Mirrors `INHERITED_ENV` in
 * crates/agiworkforce-worktree/src/git.rs.
 */
const INHERITED_ENV = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT'] as const;

/**
 * Repository settings that make a read-only status or diff run a program the
 * repository names. Keys arrive with section and variable lowercased.
 */
const CODE_RUNNING_CONFIG =
  '^(filter\\..+\\.(clean|smudge|process)|diff\\..+\\.(textconv|command)|hook\\..+\\.(command|event)|lfs\\.extension\\..+\\.(clean|smudge)|lfs\\.customtransfer\\..+\\.(path|args)|lfs\\.(.+\\.)?standalonetransferagent|annex\\..+-(command|hook)|remote\\..+\\.annex-(.+-command|shell|rsync-transport)|include\\.path|includeif\\..+\\.path)$';

const INCLUDE_KEY = /^include(if\..+)?\.path$/;

/**
 * Keeps status and diff out of submodule work trees. A submodule's gitfile,
 * config and attributes are all files an agent's command can write, so
 * descending into one runs whatever filter they name. `dirty` still reports a
 * changed submodule commit, which needs nothing from inside the submodule.
 * Only this flag holds: `.gitmodules` `ignore=none` overrides
 * `-c diff.ignoreSubmodules=dirty`.
 */
const IGNORE_SUBMODULES = '--ignore-submodules=dirty';

const STATUS_ARGS = ['status', '--porcelain=v1', '--untracked-files=all', IGNORE_SUBMODULES];

/**
 * Directories every sandboxed command can write, whatever its workspace.
 */
const SHARED_WRITABLE_DIRECTORIES = [
  '/tmp',
  '/private/tmp',
  '/var/folders',
  '/private/var/folders',
];

const refusalsReported = new Set<string>();

export interface WorkspaceGitRead {
  git: WorkspaceGitState | null;
  unavailableReason?: string;
}

function isInside(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative));
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The `PATH` git runs with: its absolute entries outside `cwd` and the
 * directories a sandboxed command can write. Git finds `ssh`, `gpg`,
 * `git-lfs` and credential helpers on `PATH`, so an entry such as a project's
 * `.venv/bin` would run whatever an agent's command planted there. Each entry
 * is compared both as spelled and resolved, since a link can lead into one.
 */
async function hostGitPath(cwd: string): Promise<string[]> {
  const excluded = [cwd, ...SHARED_WRITABLE_DIRECTORIES, os.tmpdir()];
  const writable = [...excluded, ...(await Promise.all(excluded.map(resolveExistingPrefix)))];
  const entries: string[] = [];
  for (const entry of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (entry === '' || !path.isAbsolute(entry)) continue;
    const resolved = await resolveExistingPrefix(entry);
    if (writable.some((directory) => isInside(directory, entry) || isInside(directory, resolved))) {
      continue;
    }
    entries.push(entry);
  }
  return [...new Set(entries)];
}

/**
 * Git's absolute path, taken from the cleaned `PATH`. Given a bare `git` and
 * a workspace `cwd`, libuv on Windows looks in the cwd for `git.exe` before
 * `PATH`, which would run whatever an agent wrote there.
 */
function gitExecutable(searchPath: readonly string[]): string | null {
  return (
    searchPath
      .map((entry) => path.join(entry, process.platform === 'win32' ? 'git.exe' : 'git'))
      .find(isExecutableFile) ?? null
  );
}

/**
 * An empty directory under `~/.agiworkforce/git`, which every sandbox keeps
 * read-only, so no hook can be planted in it. The null device when it cannot
 * be used.
 */
async function emptyHooksDirectory(): Promise<string> {
  const home = os.homedir();
  if (!path.isAbsolute(home)) return NULL_DEVICE;
  const directory = path.join(home, '.agiworkforce', 'git', 'no-hooks');
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || (await fs.readdir(directory)).length > 0) return NULL_DEVICE;
    return directory;
  } catch {
    return NULL_DEVICE;
  }
}

function hostGitEnv(searchPath: readonly string[], systemConfig: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of INHERITED_ENV) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  env['PATH'] = searchPath.join(path.delimiter);
  if (!systemConfig) {
    env['GIT_CONFIG_NOSYSTEM'] = '1';
    env['GIT_ATTR_NOSYSTEM'] = '1';
  }
  env['GIT_TERMINAL_PROMPT'] = '0';
  return env;
}

export interface HostGitInvocation {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface HostGitOptions {
  /**
   * Read the system configuration too, which no sandboxed command can write.
   * A push needs it: Apple's git names its `osxkeychain` credential helper
   * there, without which a push to an HTTPS remote cannot use the
   * credentials the keychain holds.
   */
  systemConfig?: boolean;
}

/**
 * How the host runs git: outside any sandbox, in a work tree an agent's
 * commands can write. Mirrors `HOST_GIT_HARDENING` in
 * crates/agiworkforce-worktree/src/git.rs, so nothing git would execute on its
 * own may run, and `--no-optional-locks` keeps a status from rewriting the
 * index, which is what fires `post-index-change`.
 */
export async function hostGitInvocation(
  cwd: string,
  args: readonly string[],
  options: HostGitOptions = {},
): Promise<HostGitInvocation | null> {
  const searchPath = await hostGitPath(cwd);
  const file = gitExecutable(searchPath);
  if (!file) return null;
  return {
    file,
    args: [
      '-c',
      `core.hooksPath=${await emptyHooksDirectory()}`,
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-c',
      `core.attributesFile=${NULL_DEVICE}`,
      '-c',
      'core.editor=true',
      '-c',
      'core.pager=cat',
      '--no-optional-locks',
      ...args,
    ],
    env: hostGitEnv(searchPath, options.systemConfig === true),
  };
}

interface GitRunOptions extends HostGitOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

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
async function git(cwd: string, args: string[], options: GitRunOptions = {}): Promise<string> {
  const invocation = await hostGitInvocation(cwd, args, options);
  if (!invocation) throw new Error('git was not found on PATH.');
  const { stdout } = await run(invocation.file, invocation.args, {
    cwd,
    env: { ...options.env, ...invocation.env },
    timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
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

function originLabel(root: string, origin: string): string {
  const file = origin.startsWith('file:') ? origin.slice('file:'.length) : origin;
  return path.isAbsolute(file) && isInside(root, file) ? path.relative(root, file) : file;
}

async function includesFromInside(root: string, origin: string, value: string): Promise<boolean> {
  if (value === '') return false;
  const file = origin.startsWith('file:') ? origin.slice('file:'.length) : null;
  let target: string;
  if (value.startsWith('~/')) target = path.join(os.homedir(), value.slice(2));
  else if (path.isAbsolute(value)) target = value;
  else if (file) target = path.resolve(root, path.dirname(file), value);
  else return true;
  const real = await fs.realpath(target).catch(() => target);
  return isInside(root, target) || isInside(root, real);
}

async function writableByCommands(root: string, origin: string): Promise<string | null> {
  if (!origin.startsWith('file:')) return null;
  const file = origin.slice('file:'.length);
  const real = await fs.realpath(file).catch(() => file);
  const realRoot = await fs.realpath(root).catch(() => root);
  const scratch = ['/tmp', '/private/tmp', os.tmpdir()];
  const scratchReal = await Promise.all(scratch.map((dir) => fs.realpath(dir).catch(() => dir)));
  const zones = [root, realRoot, ...scratch, ...scratchReal];
  return zones.some((zone) => isInside(zone, file) || isInside(zone, real)) ? real : null;
}

/**
 * Why a read-only status or diff must not run in `root`, or null when it may,
 * as a clause the page shows after "Git status is off for this folder:". The
 * repository's own configuration can name programs git would run for them,
 * and an agent's command may have written that configuration or a file it
 * includes, so such a repository is reported as unavailable instead.
 */
async function codeRunningConfig(
  root: string,
  options: GitRunOptions = {},
): Promise<string | null> {
  let listing: string;
  try {
    listing = await git(
      root,
      ['config', '--show-scope', '--show-origin', '-z', '--get-regexp', CODE_RUNNING_CONFIG],
      options,
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return null;
    return 'its repository settings could not be read';
  }
  const fields = listing.split('\0');
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const scope = fields[index];
    const origin = fields[index + 1] ?? '';
    const entry = fields[index + 2] ?? '';
    const newline = entry.indexOf('\n');
    const key = newline === -1 ? entry : entry.slice(0, newline);
    const value = newline === -1 ? '' : entry.slice(newline + 1);
    if (scope !== 'local' && scope !== 'worktree') {
      if (INCLUDE_KEY.test(key)) continue;
      const writable = await writableByCommands(root, origin);
      if (writable) {
        return `its git settings run programs (${key} in ${writable}, a file a command can write)`;
      }
      continue;
    }
    if (!INCLUDE_KEY.test(key)) {
      return `its repository settings run programs (${key} in ${originLabel(root, origin)})`;
    }
    if (await includesFromInside(root, origin, value)) {
      return `its repository settings read a file inside the folder (${value} from ${originLabel(root, origin)})`;
    }
  }
  return null;
}

/**
 * Refuses a host git command that changes the work tree or talks to a remote
 * where the repository's settings name programs git would run for it, read
 * from the same configuration that command reads.
 */
async function assertHostGitAllowed(root: string, options: GitRunOptions = {}): Promise<void> {
  const reason = await codeRunningConfig(root, options);
  if (reason) throw new Error(`Git is off for this folder: ${reason}.`);
}

async function refusesHostGit(root: string): Promise<boolean> {
  const reason = await codeRunningConfig(root);
  if (!reason) return false;
  const report = `${root}\0${reason}`;
  if (!refusalsReported.has(report)) {
    refusalsReported.add(report);
    console.warn(`[git] git details for ${root} are unavailable: ${reason}.`);
  }
  return true;
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

async function inspectGit(directory: string): Promise<WorkspaceGitRead> {
  const root = await findRepositoryRoot(directory);
  if (!root) return { git: null };
  const unavailableReason = await codeRunningConfig(root);
  if (unavailableReason) return { git: null, unavailableReason };
  return { git: await stateAt(root) };
}

export async function readGitState(directory: string): Promise<WorkspaceGitState | null> {
  return (await inspectGit(directory)).git;
}

async function stateAt(root: string): Promise<WorkspaceGitState> {
  const branch = await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  const headSha = await gitOrNull(root, ['rev-parse', 'HEAD']);
  const upstream = await gitOrNull(root, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const remotesRaw = await gitOrNull(root, ['remote']);
  const statusRaw = await gitOrNull(root, ['status', '--porcelain', IGNORE_SUBMODULES]);
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

export async function readWorkspaceGit(root: WorkspaceRoot): Promise<WorkspaceGitRead> {
  return inspectGit(root.path);
}

export async function readWorkingTreeDiff(
  directory: string,
  paths: readonly string[],
): Promise<string | null> {
  if (paths.length === 0) return null;
  const root = await findRepositoryRoot(directory);
  if (!root || (await refusesHostGit(root))) return null;
  return gitOrNull(directory, [
    '--literal-pathspecs',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    IGNORE_SUBMODULES,
    'HEAD',
    '--',
    ...paths,
  ]);
}

export async function readWorkingTreeChanges(
  directory: string,
): Promise<WorkingTreeChanges | null> {
  const root = await findRepositoryRoot(directory);
  if (!root) return null;
  await assertHostGitAllowed(root);
  const status = await git(root, STATUS_ARGS);
  const diff =
    (await gitOrNull(root, [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      IGNORE_SUBMODULES,
      'HEAD',
    ])) ?? '';
  return {
    files: parseWorkingTreeStatus(status),
    diff: diff.slice(0, WORKING_TREE_DIFF_LIMIT),
    diffTruncated: diff.length > WORKING_TREE_DIFF_LIMIT,
    folderPrefix: (await gitOrNull(directory, ['rev-parse', '--show-prefix'])) ?? '',
  };
}

export async function discardWorkingTreeChanges(
  directory: string,
  paths: readonly string[],
): Promise<string[]> {
  const root = await findRepositoryRoot(directory);
  if (!root)
    throw new Error('This folder is not a git repository, so there is nothing to discard.');
  await assertHostGitAllowed(root);
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

  if (removed.length > 0) {
    await git(root, ['--literal-pathspecs', 'rm', '-f', '--quiet', '--', ...removed]);
  }
  if (restored.length > 0) {
    await git(root, [
      '--literal-pathspecs',
      'restore',
      '--source=HEAD',
      '--staged',
      '--worktree',
      '--',
      ...restored,
    ]);
  }
  if (cleaned.length > 0) {
    await git(root, ['--literal-pathspecs', 'clean', '-f', '--quiet', '--', ...cleaned]);
  }
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
  await assertHostGitAllowed(root);
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
  const pushing: GitRunOptions = {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    systemConfig: true,
  };
  await assertHostGitAllowed(root, pushing);
  const branch = await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  if (!branch) throw new Error('Check out a branch before opening a pull request.');
  const remoteUrl = await gitOrNull(root, ['remote', 'get-url', PUSH_REMOTE]);
  if (!remoteUrl) throw new Error('This repository has no origin remote to push to.');
  await git(root, ['push', '--set-upstream', PUSH_REMOTE, branch], {
    ...pushing,
    timeoutMs: PUSH_TIMEOUT_MS,
  });
  return { branch, remoteUrl, baseBranch: await remoteDefaultBranch(root) };
}
