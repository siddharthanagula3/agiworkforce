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
const CODE_RUNNING_KEYS =
  'filter\\..+\\.(clean|smudge|process)|diff\\..+\\.(textconv|command)|hook\\..+\\.(command|event)|lfs\\.extension\\..+\\.(clean|smudge)|lfs\\.customtransfer\\..+\\.(path|args)|lfs\\.(.+\\.)?standalonetransferagent|annex\\..+-(command|hook)|remote\\..+\\.annex-(.+-command|shell|rsync-transport)|include\\.path|includeif\\..+\\.path';

const CODE_RUNNING_KEY = new RegExp(`^(${CODE_RUNNING_KEYS})$`);

/**
 * Settings that decide where a push goes, how the connection is verified and
 * which credentials it carries, as listed in git-config(1): `http.*`, plain or
 * scoped to a URL, and a remote's proxy. Mirrors `CODE_RUNNING_KEYS` in
 * crates/agiworkforce-worktree/src/config_guard.rs.
 */
const TRANSPORT_KEYS =
  'http\\.(.+\\.)?(sslverify|sslcainfo|sslcapath|sslcert|sslkey|sslcertpasswordprotected|sslcerttype|sslkeytype|sslversion|sslcipherlist|sslbackend|schannelcheckrevoke|schannelusesslcainfo|pinnedpubkey|proxy|proxyauthmethod|proxysslcert|proxysslkey|proxysslcertpasswordprotected|proxysslcainfo|emptyauth|proactiveauth|delegation|cookiefile|savecookies|curloptresolve|followredirects)|remote\\..+\\.(proxy|proxyauthmethod)';

/**
 * What only a command that talks to a remote obeys: the programs it runs to
 * reach one, and [`TRANSPORT_KEYS`].
 */
const REMOTE_KEYS = `core\\.(sshcommand|askpass|gitproxy|alternaterefscommand)|credential\\.(.+\\.)?helper|url\\..+\\.(insteadof|pushinsteadof)|protocol\\..+|remote\\..+\\.(uploadpack|receivepack|vcs)|${TRANSPORT_KEYS}`;

/**
 * The programs git runs to sign, which a push does for a push certificate
 * when `push.gpgSign` asks and the remote accepts one. Mirrors the `gpg` keys
 * in `CODE_RUNNING_KEYS` in crates/agiworkforce-worktree/src/config_guard.rs.
 */
const SIGNING_KEYS = 'gpg\\.(.+\\.)?program|gpg\\.ssh\\.defaultkeycommand';

/**
 * Settings that make the repository a partial or promisor clone, which
 * fetches a missing object whenever a status or diff needs one, obeying every
 * setting a fetch obeys.
 */
const PROMISOR_KEYS = 'extensions\\.partialclone|remote\\..+\\.promisor';

const LISTED_CONFIG = `^(${CODE_RUNNING_KEYS}|${REMOTE_KEYS}|${SIGNING_KEYS}|${PROMISOR_KEYS})$`;

const REMOTE_KEY = new RegExp(`^(${REMOTE_KEYS})$`);

const SIGNING_KEY = new RegExp(`^(${SIGNING_KEYS})$`);

const PROMISOR_KEY = new RegExp(`^(${PROMISOR_KEYS})$`);

const TRANSPORT_KEY = new RegExp(`^(${TRANSPORT_KEYS})$`);

const INCLUDE_KEY = /^include(if\..+)?\.path$/;

const GIT_FALSE = /^(false|no|off|[-+]?0+)?$/i;

const MOVE_TO_GLOBAL =
  'If you added that setting yourself, move it to your global git configuration (git config --global), which commands run in this folder cannot change, and try again.';

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
 * commands can write. Mirrors `host_git_hardening` in
 * crates/agiworkforce-worktree/src/git.rs, so nothing git would execute on its
 * own may run, no command recurses into a submodule whose git directory and
 * configuration a command can write, and `--no-optional-locks` keeps a status
 * from rewriting the index, which is what fires `post-index-change`.
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
      'submodule.recurse=false',
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
 * `text` with the user name and password of every URL in it hidden: what
 * precedes the last `@` of the authority, which ends at the first `/`, `?` or
 * `#`. A key scoped to a URL, such as `http.<url>.sslVerify`, can carry one.
 */
function withoutCredentials(text: string): string {
  return text.replace(/:\/\/[^/?#]*@/g, '://(hidden)@');
}

interface ConfigEntry {
  scope: string;
  origin: string;
  key: string;
  value: string;
  valueGiven: boolean;
}

function configEntries(listing: string): ConfigEntry[] {
  const fields = listing.split('\0');
  const entries: ConfigEntry[] = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const entry = fields[index + 2] ?? '';
    const newline = entry.indexOf('\n');
    entries.push({
      scope: fields[index] ?? '',
      origin: fields[index + 1] ?? '',
      key: newline === -1 ? entry : entry.slice(0, newline),
      value: newline === -1 ? '' : entry.slice(newline + 1),
      valueGiven: newline !== -1,
    });
  }
  return entries;
}

/**
 * Whether git fetches a missing object on demand here: the repository is a
 * partial clone, or names a promisor remote. A key with no value is true.
 */
function fetchesOnDemand(entries: readonly ConfigEntry[]): boolean {
  return entries.some(
    (entry) =>
      PROMISOR_KEY.test(entry.key) &&
      (entry.key === 'extensions.partialclone' ||
        !entry.valueGiven ||
        !GIT_FALSE.test(entry.value.trim())),
  );
}

interface ConfigRefusal {
  reason: string;
  local: boolean;
}

type HostGitUse = 'refs' | 'work-tree' | 'push';

/**
 * Why host git must not run in `root`, or null when it may. The repository's
 * own configuration can name programs git would run, or connection settings a
 * fetch obeys, and an agent's command may have written that configuration or
 * a file it includes, so such a repository is reported as unavailable
 * instead. A status or diff obeys connection settings only in a partial or
 * promisor clone, which fetches the objects they need; a push always does,
 * and it also runs the program that signs a push certificate. Reading refs
 * runs nothing at all unless it fetches a missing commit, which only a partial
 * or promisor clone does.
 */
async function codeRunningConfig(
  root: string,
  options: GitRunOptions = {},
  use: HostGitUse = 'work-tree',
): Promise<ConfigRefusal | null> {
  let listing: string;
  try {
    listing = await git(
      root,
      ['config', '--show-scope', '--show-origin', '-z', '--get-regexp', LISTED_CONFIG],
      options,
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return null;
    return { reason: 'its repository settings could not be read', local: false };
  }
  const entries = configEntries(listing);
  const fetches = fetchesOnDemand(entries);
  if (use === 'refs' && !fetches) return null;
  const pushes = use === 'push';
  const reachesRemote = pushes || fetches;
  const obeyed = (key: string) =>
    CODE_RUNNING_KEY.test(key) ||
    (reachesRemote && REMOTE_KEY.test(key)) ||
    (pushes && SIGNING_KEY.test(key));
  for (const { scope, origin, key: rawKey, value } of entries) {
    if (!obeyed(rawKey)) continue;
    const key = withoutCredentials(rawKey);
    const effect = TRANSPORT_KEY.test(rawKey)
      ? 'change where git sends credentials or how it checks the connection'
      : 'run programs';
    if (scope !== 'local' && scope !== 'worktree') {
      if (INCLUDE_KEY.test(rawKey)) continue;
      const writable = await writableByCommands(root, origin);
      if (writable) {
        return {
          reason: `its git settings ${effect} (${key} in ${writable}, a file a command can write)`,
          local: false,
        };
      }
      continue;
    }
    if (!INCLUDE_KEY.test(rawKey)) {
      return {
        reason: `its repository settings ${effect} (${key} in ${originLabel(root, origin)})`,
        local: true,
      };
    }
    if (await includesFromInside(root, origin, value)) {
      return {
        reason: `its repository settings read a file inside the folder (${value} from ${originLabel(root, origin)})`,
        local: false,
      };
    }
  }
  return null;
}

/**
 * Refuses a host git command that changes the work tree or talks to a remote
 * where the repository's settings name programs git would run for it, read
 * from the same configuration that command reads. The app keeps no record of
 * which repository settings the user trusts, so a setting the user added
 * there is refused too; one in the global configuration, which no command in
 * the folder can write, is obeyed.
 */
async function assertHostGitAllowed(
  root: string,
  options: GitRunOptions = {},
  use: HostGitUse = 'work-tree',
): Promise<void> {
  const refusal = await codeRunningConfig(root, options, use);
  if (!refusal) return;
  const remedy = refusal.local ? ` ${MOVE_TO_GLOBAL}` : '';
  throw new Error(`Git is off for this folder: ${refusal.reason}.${remedy}`);
}

async function refusesHostGit(root: string): Promise<boolean> {
  const reason = (await codeRunningConfig(root))?.reason;
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
  const refusal = await codeRunningConfig(root);
  if (refusal) return { git: null, unavailableReason: refusal.reason };
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
  const folderPrefix = await git(directory, ['rev-parse', '--show-prefix']);
  const scopeArgs = folderPrefix ? ['--', folderPrefix] : [];
  const [status, branch, revision] = await Promise.all([
    git(root, ['--literal-pathspecs', ...STATUS_ARGS, ...scopeArgs]),
    gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']),
    gitOrNull(root, ['rev-parse', '--verify', 'HEAD']),
  ]);
  let diff = '';
  let diffTruncated = false;
  let diffUnavailable = false;
  if (revision !== null) {
    try {
      diff = await git(root, [
        '--literal-pathspecs',
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        IGNORE_SUBMODULES,
        revision,
        ...scopeArgs,
      ]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        diffTruncated = true;
        const stdout = (error as { stdout?: unknown }).stdout;
        if (typeof stdout === 'string') diff = stdout;
      } else {
        diffUnavailable = true;
      }
    }
  }
  return {
    files: parseWorkingTreeStatus(status),
    diff: diff.slice(0, WORKING_TREE_DIFF_LIMIT),
    diffTruncated: diffTruncated || diff.length > WORKING_TREE_DIFF_LIMIT,
    folderPrefix,
    comparison: { branch, revision },
    ...(diffUnavailable ? { diffUnavailable: true } : {}),
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
  const folderPrefix = await git(directory, ['rev-parse', '--show-prefix']);
  const folder = path.resolve(root, folderPrefix);
  const inFolder = (file: string): boolean => isInside(folder, path.resolve(root, file));
  const changed = new Map(
    parseWorkingTreeStatus(await git(root, STATUS_ARGS)).map((change) => [change.path, change]),
  );
  const chosen = paths.map((path) => {
    if (!inFolder(path)) throw new Error('The selected file is outside the approved folder.');
    const change = changed.get(path);
    if (!change) throw new Error(`${path} has no changes to discard.`);
    if (change.state === 'conflicted') {
      throw new Error(`${path} has a merge conflict. Resolve it before discarding it.`);
    }
    if (change.originalPath && !inFolder(change.originalPath)) {
      throw new Error('This rename also affects a file outside the approved folder.');
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
  await assertHostGitAllowed(root, {}, 'refs');
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
    remoteUrl: await gitOrNull(root, ['remote', 'get-url', PUSH_REMOTE]).then(
      (url) => url && withoutUrlSecrets(url),
    ),
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

export interface NewBranchRequest {
  title: string;
  prefix: string;
}

const NEW_BRANCH_SLUG_LENGTH = 48;

export function branchSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NEW_BRANCH_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug === '' ? 'changes' : slug;
}

async function createBranchAtHead(root: string, request: NewBranchRequest): Promise<string> {
  const base = `${request.prefix}${branchSlug(request.title)}`;
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const valid = await gitOrNull(root, ['check-ref-format', '--branch', candidate]);
    if (valid === null) throw new Error(`${candidate} is not a valid branch name.`);
    const taken = await gitOrNull(root, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/heads/${candidate}`,
    ]);
    if (taken !== null) continue;
    await git(root, ['switch', '-c', candidate]);
    return candidate;
  }
  throw new Error(`Branches named ${base} already exist. Rename one and try again.`);
}

const SCP_LIKE_URL = /^([^-@/:\s][^@/:\s]*@)?(\[[^\]/\s]+\]|[^-[\]/:@\s][^/:@\s]*):/;

const REMOTE_HELPER_URL = /^([A-Za-z0-9][A-Za-z0-9+.-]*)::/;

const URL_SCHEME = /^([A-Za-z0-9][A-Za-z0-9+.-]*):\/\//;

const URL_USERINFO = /^([A-Za-z0-9][A-Za-z0-9+.-]*):\/\/([^/?#]*)@/;

const SSH_SCHEMES = new Set(['ssh', 'git+ssh', 'ssh+git']);

const PUSHABLE_SCHEMES = new Set(['https', ...SSH_SCHEMES]);

const NETWORK_REMOTE_REMEDY = 'Set origin to an https:// or ssh:// address and try again.';

/**
 * A setting for one protocol outranks `protocol.allow`, whichever file sets
 * it, so the transports that run on this computer are refused by name too.
 */
const PUSH_PROTOCOLS = [
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.file.allow=never',
  '-c',
  'protocol.ext.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
];

function isLocalPath(url: string): boolean {
  const colon = url.indexOf(':');
  const slash = url.indexOf('/');
  return (
    colon === -1 ||
    (slash !== -1 && slash < colon) ||
    (process.platform === 'win32' && /^[A-Za-z]:/.test(url))
  );
}

/**
 * Whether `url` is the scp-like `[user@]host:path` git sends over ssh. Outside
 * a bracketed IPv6 host it may hold no `::` or `://`, which git reads as a
 * remote helper or a scheme, so an address the patterns above misread is
 * refused rather than pushed to.
 */
function isScpLike(url: string): boolean {
  const host = SCP_LIKE_URL.exec(url);
  if (!host) return false;
  const rest = url.slice(host[0].length - 1);
  return !rest.includes('::') && !rest.includes('://');
}

/**
 * `url` as it may leave this module: the user information of a `scheme://`
 * address dropped, except the user name of an ssh address, which carries no
 * secret and names the account the host expects. A password, or an https
 * user name, which is often a token, never leaves.
 */
function withoutUrlSecrets(url: string): string {
  const match = URL_USERINFO.exec(url);
  if (!match) return url;
  const scheme = match[1] ?? '';
  const user = SSH_SCHEMES.has(scheme.toLowerCase()) ? (match[2] ?? '').split(':')[0] : '';
  return `${scheme}://${user ? `${user}@` : ''}${url.slice(match[0].length)}`;
}

function decodedOrSame(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function escapedForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * `text`, such as git's or ssh's output for a push to `url`, with the secret
 * part of `url`'s user information removed wherever it stands before an `@`
 * on its own, whether as written or as git decodes it before handing it to
 * ssh. Where a name character precedes it, it only ends a longer name, such
 * as the address `max@example.com` for the user name `x`, and is kept.
 */
function withoutRemoteSecrets(text: string, url: string): string {
  const userinfo = URL_USERINFO.exec(url)?.[2];
  let redacted = text;
  if (userinfo) {
    const kept = URL_USERINFO.exec(withoutUrlSecrets(url))?.[2];
    const replacement = kept ? `${kept}@` : '';
    for (const form of new Set([userinfo, decodedOrSame(userinfo)])) {
      if (form === kept) continue;
      const standalone = new RegExp(`(?<![A-Za-z0-9._+-])${escapedForRegExp(form)}@`, 'g');
      redacted = redacted.replace(standalone, () => replacement);
    }
  }
  return withoutCredentials(redacted);
}

/**
 * Why the push must not go to `url`, as git resolved it, or null when it may.
 * A push to a repository on this computer runs that repository's own hooks
 * and configuration with none of the host's hardening, and a remote helper is
 * a program on this computer, so only an address git sends over https or ssh
 * is pushed to. It is classified in git's own order, with git's own first
 * characters: a helper's `name::` prefix, then a `scheme://`, then a local
 * path, then the scp-like `[user@]host:path`. The push itself is held to the
 * same protocols, since the configuration can change after this check.
 */
function pushTargetRefusal(url: string): string | null {
  const shown = withoutCredentials(url);
  const local = `Origin is a folder on this computer (${shown}), and pushing there runs that repository's own hooks on this computer, so nothing was pushed. ${NETWORK_REMOTE_REMEDY}`;
  const other = `Origin's address (${shown}) is not an https:// or ssh:// address, so nothing was pushed. ${NETWORK_REMOTE_REMEDY}`;
  const helper = REMOTE_HELPER_URL.exec(url)?.[1];
  if (helper) {
    return `Origin pushes through the ${helper} remote helper (${shown}), a program on this computer, so nothing was pushed. ${NETWORK_REMOTE_REMEDY}`;
  }
  const scheme = URL_SCHEME.exec(url)?.[1];
  if (scheme !== undefined) {
    if (PUSHABLE_SCHEMES.has(scheme)) return null;
    return scheme === 'file' ? local : other;
  }
  if (isLocalPath(url)) return local;
  return isScpLike(url) ? null : other;
}

/**
 * The one address origin pushes to, once nothing refuses it. Read and judged
 * before the push changes anything in the repository.
 */
async function checkedPushAddress(root: string, pushing: GitRunOptions): Promise<string> {
  const pushUrls = (
    await git(root, ['remote', 'get-url', '--push', '--all', PUSH_REMOTE], pushing).catch(() => '')
  )
    .split('\n')
    .filter((url) => url !== '');
  const remoteUrl = pushUrls[0];
  if (!remoteUrl) throw new Error('This repository has no origin remote to push to.');
  if (pushUrls.length > 1) {
    throw new Error(
      'Origin pushes to more than one address, so nothing was pushed. Leave one push address and try again.',
    );
  }
  const refusal = pushTargetRefusal(remoteUrl);
  if (refusal) throw new Error(refusal);
  return remoteUrl;
}

export async function pushLocalBranch(
  directory: string,
  newBranch?: NewBranchRequest,
): Promise<LocalBranchPush> {
  const root = await findRepositoryRoot(directory);
  if (!root) throw new Error('This folder is not a git repository, so there is nothing to push.');
  const pushing: GitRunOptions = {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    systemConfig: true,
  };
  await assertHostGitAllowed(root, pushing, 'push');
  const current = await gitOrNull(root, ['symbolic-ref', '--short', '--quiet', 'HEAD']);
  const target = current ?? newBranch;
  if (!target) throw new Error('Check out a branch before opening a pull request.');
  const remoteUrl = await checkedPushAddress(root, pushing);
  const branch = typeof target === 'string' ? target : await createBranchAtHead(root, target);
  try {
    await git(
      root,
      [...PUSH_PROTOCOLS, 'push', '--no-recurse-submodules', '--set-upstream', PUSH_REMOTE, branch],
      {
        ...pushing,
        timeoutMs: PUSH_TIMEOUT_MS,
      },
    );
  } catch (error) {
    throw new Error(withoutRemoteSecrets((error as Error).message, remoteUrl));
  }
  return {
    branch,
    remoteUrl: withoutUrlSecrets(remoteUrl),
    baseBranch: await remoteDefaultBranch(root),
  };
}
