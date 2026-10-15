import { constants as fsConstants, promises as fs, lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEPENDENCY_TREE_NAMES,
  GIT_METADATA_ENTRY,
  HOME_CREDENTIAL_PATHS,
  HOOK_MANAGER_PATHS,
  PROJECT_CONFIG_PATHS,
  ShellCommandRefused,
} from '@agiworkforce/local-runtime-contract';
import { cliConfigRoot } from '../browser/localClient';
import { readRegularFile } from './regularFile';

export type ShellSandbox =
  | { backend: 'seatbelt'; executable: string }
  | { backend: 'bubblewrap'; executable: string }
  | { backend: 'none' };

export type SandboxNetwork = 'deny' | 'allow';

export const SEATBELT_EXECUTABLE = '/usr/bin/sandbox-exec';

const XCODE_SELECT_LINK = '/private/var/db/xcode_select_link';

export const SEATBELT_PROCESS_RULES: readonly string[] = [
  '(allow process-exec)',
  '(allow process-fork)',
  '(allow signal (target self))',
  '(allow sysctl-read)',
  '(allow system-socket)',
];

// An unfiltered mach-lookup reaches LaunchServices and launchd, through which
// `open -a` or `launchctl submit` starts a program outside the sandbox.
export const SEATBELT_MACH_SERVICES: readonly string[] = [
  'com.apple.system.opendirectoryd.libinfo',
  'com.apple.system.opendirectoryd.membership',
  'com.apple.system.notification_center',
  'com.apple.system.logger',
  'com.apple.PowerManagement.control',
  'com.apple.cfprefsd.agent',
  'com.apple.cfprefsd.daemon',
];

export const SEATBELT_NETWORK_MACH_SERVICES: readonly string[] = [
  'com.apple.bsd.dirhelper',
  'com.apple.SystemConfiguration.configd',
  'com.apple.SystemConfiguration.DNSConfiguration',
  'com.apple.networkd',
  'com.apple.SecurityServer',
  'com.apple.trustd.agent',
  'com.apple.ocspd',
];

/**
 * What a run the user opened the network for may reach: hosts elsewhere, and
 * not this computer. A local port or a Unix socket is how a sandboxed program
 * talks to one that is not sandboxed, such as the Docker daemon, a tmux
 * server or an ssh agent, so both stay closed, with the one socket name
 * resolution goes through opened again. Nor may the program listen, which
 * would open a port the local network could reach: it keeps only a UDP
 * socket of its own, which a resolver that asks a name server directly has
 * to bind. Seatbelt takes the last rule that matches, so each denial follows
 * the allow it narrows. Mirrors the `AllowExternal` arm of
 * `seatbelt_network_rules` in the sandbox-policy crate, which is what the
 * CLI's own commands run under.
 */
export const SEATBELT_NETWORK_RULES: readonly string[] = [
  '(allow network-outbound)',
  '(allow network-inbound (local udp "*:*"))',
  '(deny network-outbound (remote ip "localhost:*"))',
  '(deny network-outbound (subpath "/"))',
  '(allow network-outbound (literal "/private/var/run/mDNSResponder"))',
];

export const SEATBELT_SYSTEM_READ_PATHS: readonly string[] = [
  '/usr',
  '/bin',
  '/sbin',
  '/Library',
  '/System',
  '/private/var/db',
  '/dev',
  '/private/var/select',
  '/etc',
  '/private/etc',
  '/opt',
];

/**
 * An Xcode bundle the developer tool selection may name, wherever it is
 * installed under `/Applications`. Mirrors the first rule of
 * `seatbelt_developer_tool_reads` in the sandbox-policy crate.
 */
export const SEATBELT_XCODE_READ_RULE =
  '(allow file-read* (regex #"^/Applications/Xcode[^/]*\\.app(/|$)"))';

/**
 * The metadata of the `/var` link. A tool shim with no `DEVELOPER_DIR` reads
 * its selection through it, as the crate's profile allows; and with the
 * network open, the resolver reaches its configuration through it, without
 * which a host name is not found while a literal address connects.
 */
export const SEATBELT_VAR_LINK_RULE = '(allow file-read-metadata (literal "/var"))';

export { PROJECT_CONFIG_PATHS };

/**
 * The CLI's config root, the directory host git reads its global config from,
 * and the one the CLI keeps each repository's recorded git settings and index
 * locks in. `AGIWORKFORCE_HOME` moves the config root and that state with it,
 * possibly into a writable root, so both are named on their own. Mirrors
 * `protected_paths_for` in apps/cli/src/sandbox.rs.
 */
export function hostConfigPaths(
  home: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configRoot = cliConfigRoot(env, home);
  const paths = [path.join(home, '.agiworkforce'), path.join(home, '.agiworkforce', 'git')];
  if (path.isAbsolute(configRoot)) paths.push(configRoot, path.join(configRoot, 'git-state'));
  return [...new Set(paths)];
}

export interface SandboxedSpawnInput {
  sandbox: Exclude<ShellSandbox, { backend: 'none' }>;
  program: string;
  args: readonly string[];
  cwd: string;
  writableRoots: readonly string[];
  readableRoots: readonly string[];
  /** Resolved paths kept read-only even inside a writable root. */
  protectedPaths: readonly string[];
  /** Resolved folders that may not be created, renamed or removed, though their contents may change. */
  pinnedFolders: readonly string[];
  /** Resolved paths never read, even inside a folder that may be read. */
  unreadablePaths: readonly string[];
  /** Paths whose metadata alone may be read, so a realpath walk can pass them. */
  metadataPaths: readonly string[];
  network: SandboxNetwork;
  terminal?: boolean;
  /** Whether the run's environment names a developer directory for Apple's tool shims. */
  developerDirNamed: boolean;
}

export interface SandboxedSpawn {
  command: string;
  args: string[];
}

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fsConstants.X_OK);
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

export async function findExecutable(
  program: string,
  pathValue: string | undefined,
  cwd: string,
): Promise<string | null> {
  if (program.includes('/')) {
    const candidate = path.resolve(cwd, program);
    return (await isExecutableFile(candidate)) ? candidate : null;
  }
  for (const entry of (pathValue ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(entry)) continue;
    const candidate = path.join(entry, program);
    if (await isExecutableFile(candidate)) return candidate;
  }
  return null;
}

export async function detectShellSandbox(
  platform: NodeJS.Platform = process.platform,
  pathValue: string | undefined = process.env['PATH'],
): Promise<ShellSandbox> {
  if (platform === 'darwin') {
    return (await isExecutableFile(SEATBELT_EXECUTABLE))
      ? { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE }
      : { backend: 'none' };
  }
  if (platform === 'linux') {
    const executable = await findExecutable('bwrap', pathValue, '/');
    return executable ? { backend: 'bubblewrap', executable } : { backend: 'none' };
  }
  return { backend: 'none' };
}

/**
 * Whether a profile can name `value`. A quote, a parenthesis and a backslash
 * are fine: `seatbeltPath` writes them inside a string literal, escaped. What
 * no escape is known to carry stays refused: a control character, since NUL
 * ends a C string and a newline splits a rule; the Unicode line and paragraph
 * separators, which some parsers read as newlines; whitespace at either end,
 * which would change what the rule matches; and `/` itself, which is every
 * path. Mirrors `escape_resolved_seatbelt_path` in the sandbox-policy crate.
 */
export function isSeatbeltSafePath(value: string): boolean {
  if (!path.isAbsolute(value) || value === '/' || value !== value.trim()) return false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

/**
 * `value` as an SBPL string literal. A path once went into a profile as it
 * was, and one holding `")(allow default)` closed its literal and added a
 * rule; every path now goes through `seatbeltString`, once.
 */
function seatbeltPath(value: string): string {
  if (!isSeatbeltSafePath(value)) {
    throw new ShellCommandRefused(
      'sandbox-unavailable',
      `The sandbox cannot be limited to ${JSON.stringify(value)}, because its path holds a control character, a line separator, or a space at either end. Rename the folder and try again.`,
    );
  }
  return `"${seatbeltString(value)}"`;
}

/**
 * `text` as the inside of an SBPL string literal: each backslash and each
 * double quote gets a backslash in front. Mirrors `seatbelt_string` in the
 * sandbox-policy crate.
 */
function seatbeltString(text: string): string {
  return text.replace(/[\\"]/gu, '\\$&');
}

/**
 * A Seatbelt `regex` filter for `pattern`, written as an ordinary string
 * literal. The `#"..."` form ends at the first double quote whatever comes
 * before it; an ordinary string is read back through `seatbeltString` first.
 * Mirrors `seatbelt_regex` in the sandbox-policy crate.
 */
export function seatbeltRegex(pattern: string): string {
  return `(regex "${seatbeltString(pattern)}")`;
}

/**
 * `text` as a Seatbelt regex matching exactly it, or with `anyCase` it in any
 * case. Each character that means something to the regex is put in a class of
 * its own, and a caret, which a class would negate, and a backslash are
 * escaped. Seatbelt has no flag for ignoring case, so a letter becomes a
 * class of its two cases. Mirrors `seatbelt_regex_literal` in the
 * sandbox-policy crate.
 */
export function seatbeltRegexLiteral(text: string, anyCase: boolean): string {
  let pattern = '';
  for (const character of text) {
    if (character === '^') pattern += '\\^';
    else if (character === '\\') pattern += '\\\\';
    else if (character === ']') pattern += '[]]';
    else if ('.+*?[{}|$()'.includes(character)) pattern += `[${character}]`;
    else if (anyCase && /^[A-Za-z]$/u.test(character)) {
      pattern += `[${character.toLowerCase()}${character.toUpperCase()}]`;
    } else pattern += character;
  }
  return pattern;
}

/**
 * The protected entries a profile denies by name below a workspace: all but
 * git's own, which `gitMetadataPaths` names by path, since a test suite may
 * create a repository of its own inside a project. Mirrors
 * `named_project_entries` in the sandbox-policy crate.
 */
export const NAMED_PROJECT_ENTRIES: readonly string[] = [
  ...PROJECT_CONFIG_PATHS,
  ...HOOK_MANAGER_PATHS,
];

/**
 * Folders whose files a surface loads as trusted, always-on instructions for
 * every later session in a project: rules, and the commands offered as slash
 * commands. A sandboxed command is denied writes below one. Mirrors
 * `AGENT_INSTRUCTION_PATHS` in the sandbox-policy crate.
 */
export const AGENT_INSTRUCTION_PATHS: readonly string[] = [
  '.agiworkforce/rules',
  '.agiworkforce/commands',
  '.claude/commands',
  '.agiworkforce/prompts/claude',
];

/**
 * The instruction folders a profile has to name itself: the ones no named
 * entry already holds, as `.agiworkforce` holds `.agiworkforce/rules`.
 * Mirrors `instruction_folders_outside_protected_entries` in the
 * sandbox-policy crate.
 */
export const INSTRUCTION_FOLDERS_OUTSIDE_PROTECTED_ENTRIES: readonly string[] =
  AGENT_INSTRUCTION_PATHS.filter(
    (folder) => !NAMED_PROJECT_ENTRIES.some((entry) => folder.startsWith(`${entry}/`)),
  );

/**
 * Folders other tools keep files of their own in: `.config`, where lefthook
 * is one tenant among many, and `.claude`, which holds another agent's
 * settings beside the commands loaded as instructions. A named entry inside
 * one has that parent held in place at a workspace's top folder only: held at
 * any depth, no sandboxed command could make a `.config` folder anywhere in a
 * project. Mirrors `SHARED_PARENT_FOLDERS` in the sandbox-policy crate.
 */
export const SHARED_PARENT_FOLDERS: readonly string[] = ['.config', '.claude'];

/**
 * The most bytes one string of a profile is given. `sandbox-exec` refuses a
 * profile holding a string of 1024 bytes or more, and fewer when it holds
 * escapes. Mirrors `SEATBELT_STRING_ROOM` in the sandbox-policy crate.
 */
const SEATBELT_STRING_ROOM = 900;

/**
 * `names` as alternations, `(a|b|c)`, each short enough to stand in one
 * string after `before` and ahead of the `$` that ends the pattern. Every
 * regex in a profile is compiled when a program starts, so the names share a
 * handful of patterns rather than one apiece. A name too long to fit beside
 * `before` still gets a pattern of its own; `sandbox-exec` refuses a profile
 * holding it, which stops the program and lets nothing through. Mirrors
 * `alternations` in the sandbox-policy crate.
 */
export function seatbeltAlternations(names: readonly string[], before: string): string[] {
  const around = Buffer.byteLength(seatbeltString(before)) + '()$'.length;
  const room = Math.max(0, SEATBELT_STRING_ROOM - around);
  const groups: string[] = [];
  let group = '';
  for (const name of names) {
    if (group !== '' && Buffer.byteLength(group) + '|'.length + Buffer.byteLength(name) > room) {
      groups.push(`(${group})`);
      group = '';
    }
    group = group === '' ? name : `${group}|${name}`;
  }
  if (group !== '') groups.push(`(${group})`);
  return groups;
}

function hasASharedParent(entry: string): boolean {
  return entry.includes('/') && SHARED_PARENT_FOLDERS.includes(entry.split('/')[0] ?? '');
}

/**
 * Seatbelt rules keeping the named project entries, and the instruction
 * folders no entry holds, read-only below `root`, a workspace's resolved path
 * as it is, in any case. Seatbelt takes the last rule that matches, so the
 * three layers come in this order, after the write allows and before every
 * other denial, so the allows in the middle give back nothing but what the
 * first layer took. Within a layer the names share patterns
 * (`seatbeltAlternations`):
 *
 * 1. Every entry is denied at any depth, as the approval gate matches them.
 * 2. An entry inside a dependency or build tree is allowed again: installing
 *    a package that ships one of these names must not fail, and nothing loads
 *    them from there.
 * 3. Every entry of the workspace's own top folder is denied whatever lies
 *    below it, a dependency tree's name included.
 *
 * An entry of more than one segment, `.vscode/mcp.json`, also has creating
 * and removing its parent ruled the same three ways. Otherwise a program
 * could build `x/mcp.json` elsewhere and rename `x` to `.vscode`, touching no
 * path the first rule names. A parent in `SHARED_PARENT_FOLDERS` is ruled that
 * way at the top folder only, where the entry inside it is read from. Mirrors
 * `seatbelt_project_entry_rules` in the sandbox-policy crate, rule for rule.
 */
export function seatbeltProjectEntryRules(root: string): string[] {
  const workspace = seatbeltRegexLiteral(root, false);
  const trees = DEPENDENCY_TREE_NAMES.map((name) => seatbeltRegexLiteral(name, false)).join('|');
  const entries: string[] = [];
  const parents: string[] = [];
  const parentsAtTheTopOnly: string[] = [];
  for (const entry of [
    ...NAMED_PROJECT_ENTRIES,
    ...INSTRUCTION_FOLDERS_OUTSIDE_PROTECTED_ENTRIES,
  ]) {
    const inASharedParent = hasASharedParent(entry);
    const segments = entry.split('/').map((segment) => seatbeltRegexLiteral(segment, true));
    entries.push(`${segments.join('/')}(/.*)?`);
    for (let kept = 1; kept < segments.length; kept += 1) {
      const parent = segments.slice(0, kept).join('/');
      const held = inASharedParent && kept === 1 ? parentsAtTheTopOnly : parents;
      if (!held.includes(parent)) held.push(parent);
    }
  }
  const layers: ReadonlyArray<[action: string, before: string, held: readonly string[]]> = [
    ['deny', `^${workspace}/(.*/)?`, parents],
    ['allow', `^${workspace}/(.*/)?(${trees})/(.*/)?`, parents],
    ['deny', `^${workspace}/`, [...parents, ...parentsAtTheTopOnly]],
  ];
  const rules: string[] = [];
  for (const [action, before, held] of layers) {
    const named: ReadonlyArray<[operations: string, names: readonly string[]]> = [
      ['file-write*', entries],
      ['file-write-create file-write-unlink', held],
    ];
    for (const [operations, names] of named) {
      for (const alternatives of seatbeltAlternations(names, before)) {
        rules.push(`(${action} ${operations} ${seatbeltRegex(`${before}${alternatives}$`)})`);
      }
    }
  }
  return rules;
}

/**
 * Seatbelt rules that stop reads of `unreadable`. They follow every read
 * allow, since the last rule that matches decides. A root in `readable` that
 * sits inside one of them, such as a project kept in another agent's folder,
 * is readable again, and so is the metadata of each folder between the two:
 * without it a program cannot change into the root or resolve a path there.
 * Mirrors `seatbelt_read_denials` in the sandbox-policy crate.
 */
export function seatbeltReadDenials(
  unreadable: readonly string[],
  readable: readonly string[],
): string[] {
  const rules = unreadable.map((value) => `(deny file-read* (subpath ${seatbeltPath(value)}))`);
  for (const root of readable) {
    const inside = unreadable.find((denied) => isWithin(root, denied));
    if (inside === undefined) continue;
    for (
      let folder = path.dirname(root);
      folder !== path.dirname(folder) && isWithin(folder, inside);
      folder = path.dirname(folder)
    ) {
      rules.push(`(allow file-read-metadata (literal ${seatbeltPath(folder)}))`);
    }
    rules.push(`(allow file-read* (subpath ${seatbeltPath(root)}))`);
  }
  return rules;
}

const SEATBELT_TERMINAL_RULES = [
  '(allow file-ioctl (regex #"^/dev/ttys[0-9]+$"))',
  '(allow file-write* (literal "/dev/tty"))',
];

/**
 * The profile a local command runs under. Its write rules follow the CLI's
 * `seatbelt_profile` in the sandbox-policy crate, rule for rule and in its
 * order: the write allows; the named project entries of the workspace, which
 * is the first writable root; a pin on each root; then the path denials,
 * which `sandboxProtectedPaths` lists in the CLI's order. Seatbelt takes the
 * last rule that matches, so nothing after the entry rules allows a write.
 *
 * Where this differs from the CLI, on purpose: the toolchain folders on the
 * PATH are readable, since the commands a person runs here are their own
 * tools; because some of those folders sit in the home folder, the
 * credential locations the CLI hides from a program that reads everywhere are
 * hidden here too; and a run in a terminal may use its own terminal device.
 */
export function seatbeltProfile(input: {
  writableRoots: readonly string[];
  readableRoots: readonly string[];
  protectedPaths: readonly string[];
  pinnedFolders: readonly string[];
  unreadablePaths: readonly string[];
  metadataPaths: readonly string[];
  network: SandboxNetwork;
  terminal?: boolean;
  developerDirNamed: boolean;
}): string {
  const subpaths = (paths: readonly string[]) =>
    paths.map((value) => `(subpath ${seatbeltPath(value)})`).join(' ');
  const machServices = [
    ...SEATBELT_MACH_SERVICES,
    ...(input.network === 'allow' ? SEATBELT_NETWORK_MACH_SERVICES : []),
  ];
  const [workspace] = input.writableRoots;
  const lines = [
    '(version 1)',
    '(deny default)',
    ...SEATBELT_PROCESS_RULES,
    `(allow mach-lookup ${machServices.map((name) => `(global-name "${name}")`).join(' ')})`,
    ...(input.network === 'allow' ? SEATBELT_NETWORK_RULES : []),
    `(allow file-read* ${subpaths(SEATBELT_SYSTEM_READ_PATHS)} (literal "/"))`,
    `(allow file-read* ${subpaths([...input.writableRoots, ...input.readableRoots])})`,
    SEATBELT_XCODE_READ_RULE,
    ...(input.network === 'allow' || !input.developerDirNamed ? [SEATBELT_VAR_LINK_RULE] : []),
    ...(input.metadataPaths.length > 0
      ? [
          `(allow file-read-metadata ${input.metadataPaths
            .map((value) => `(literal ${seatbeltPath(value)})`)
            .join(' ')})`,
        ]
      : []),
    '(allow file-write* (literal "/dev/null"))',
    ...input.writableRoots.map((value) => `(allow file-write* (subpath ${seatbeltPath(value)}))`),
    ...(input.terminal === true ? SEATBELT_TERMINAL_RULES : []),
    ...(workspace === undefined ? [] : seatbeltProjectEntryRules(workspace)),
    // `subpath` also matches the root itself, which a command could rename or
    // remove and replace with a link the next run would resolve and grant.
    // Only unlinking is denied, so the root's own mode and times stay writable.
    ...input.writableRoots.map(
      (value) => `(deny file-write-unlink (literal ${seatbeltPath(value)}))`,
    ),
    ...input.pinnedFolders.map(
      (value) => `(deny file-write-create file-write-unlink (literal ${seatbeltPath(value)}))`,
    ),
    ...input.protectedPaths.map((value) => `(deny file-write* (subpath ${seatbeltPath(value)}))`),
    ...seatbeltReadDenials(input.unreadablePaths, input.writableRoots),
  ];
  return `${lines.join('\n')}\n`;
}

export function bubblewrapArgs(input: Omit<SandboxedSpawnInput, 'sandbox'>): string[] {
  const args = ['--die-with-parent', '--unshare-pid', '--unshare-uts'];
  if (input.network === 'deny') args.push('--unshare-net');
  args.push('--ro-bind', '/', '/', '--tmpfs', '/tmp', '--dev', '/dev', '--proc', '/proc');
  for (const root of input.writableRoots) {
    if (!path.isAbsolute(root) || root === '/') {
      throw new ShellCommandRefused(
        'sandbox-unavailable',
        `The sandbox cannot be limited to ${root}.`,
      );
    }
    args.push('--bind', root, root);
  }
  // Later mounts win, so the read-only binds follow the writable ones.
  const binds = new Set<string>();
  for (const protectedPath of input.protectedPaths) {
    const target = bubblewrapProtection(protectedPath, input.writableRoots);
    if (target === 'not-needed') continue;
    if (target === 'unprotected') {
      warnUnprotectedOnce(protectedPath);
      continue;
    }
    if (binds.has(target)) continue;
    binds.add(target);
    args.push('--ro-bind', target, target);
  }
  args.push('--chdir', input.cwd, '--', input.program, ...input.args);
  return args;
}

function isWithin(child: string, parent: string): boolean {
  return (
    child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)
  );
}

function exists(value: string): boolean {
  try {
    lstatSync(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The existing path to bind read-only over a protected one: the path itself,
 * or for a missing one its nearest existing ancestor below the writable root.
 * A missing path directly in a writable root has nothing to bind over, and no
 * placeholder is made: bubblewrap would create it on the host through the
 * writable bind, and an empty file where a loader expects JSON breaks it.
 */
function bubblewrapProtection(
  protectedPath: string,
  writableRoots: readonly string[],
): string | 'not-needed' | 'unprotected' {
  if (exists(protectedPath)) return protectedPath;
  const root = writableRoots.find((candidate) => isWithin(protectedPath, candidate));
  if (!root) return 'not-needed';
  for (
    let ancestor = path.dirname(protectedPath);
    ancestor !== root && isWithin(ancestor, root);
    ancestor = path.dirname(ancestor)
  ) {
    if (exists(ancestor)) return ancestor;
  }
  return 'unprotected';
}

const reportedUnprotected = new Set<string>();

function warnUnprotectedOnce(protectedPath: string): void {
  if (reportedUnprotected.has(protectedPath)) return;
  reportedUnprotected.add(protectedPath);
  console.warn(
    `[shell] bubblewrap cannot keep ${protectedPath} read-only until it exists; a sandboxed command can create it.`,
  );
}

export function planSandboxedSpawn(input: SandboxedSpawnInput): SandboxedSpawn {
  if (input.writableRoots.length === 0) {
    throw new ShellCommandRefused('sandbox-unavailable', 'A sandboxed command needs a folder.');
  }
  if (input.sandbox.backend === 'seatbelt') {
    return {
      command: input.sandbox.executable,
      args: ['-p', seatbeltProfile(input), input.program, ...input.args],
    };
  }
  return { command: input.sandbox.executable, args: bubblewrapArgs(input) };
}

async function realpathOr(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch {
    return value;
  }
}

/**
 * The most links followed for one path. Linux gives up after 40 and macOS
 * after 32, so a path that needs more is one the kernel refuses as well.
 */
const MAX_LINK_HOPS = 40;

function pathComponents(value: string): string[] {
  return value.split('/').filter((component) => component !== '' && component !== '.');
}

/**
 * The longest leading part of `components` that exists, made canonical, and
 * the components after it.
 */
async function existingPrefix(
  components: readonly string[],
): Promise<{ existing: string; missing: string[] }> {
  for (let kept = components.length; kept > 0; kept -= 1) {
    try {
      const existing = await fs.realpath(`/${components.slice(0, kept).join('/')}`);
      return { existing, missing: components.slice(kept) };
    } catch {
      continue;
    }
  }
  return { existing: '/', missing: [...components] };
}

/**
 * Where a write to `value` would land, or null when its links never settle.
 * Every link is followed, whether its target exists or not and whether it is
 * the last component or one in the middle, and every `..` is applied: by the
 * kernel where the path exists, and textually below the first component that
 * does not. A resolver that stops at the nearest existing folder keeps the
 * name of a link whose target is not there yet, while a write through it
 * creates the target. Mirrors `landing_path` in the sandbox-policy crate.
 */
export async function landingPath(value: string): Promise<string | null> {
  let components = pathComponents(value);
  for (let hop = 0; hop <= MAX_LINK_HOPS; hop += 1) {
    const { existing, missing } = await existingPrefix(components);
    const [first, ...rest] = missing;
    if (first === undefined) return existing;
    let target: string | null = null;
    try {
      target = await fs.readlink(path.posix.join(existing, first));
    } catch {
      target = null;
    }
    if (target === null) {
      const landed = pathComponents(existing);
      for (const name of missing) {
        if (name === '..') landed.pop();
        else landed.push(name);
      }
      return `/${landed.join('/')}`;
    }
    components = [
      ...(target.startsWith('/') ? [] : pathComponents(existing)),
      ...pathComponents(target),
      ...rest,
    ];
  }
  return null;
}

/**
 * `value` with its symlinks resolved, as the kernel resolves it before a
 * sandbox matches it: canonical when it exists, and otherwise followed
 * through every link on it, a dangling one included, with the rest that does
 * not exist appended. A path whose links loop keeps its spelling: nothing can
 * be read or written through it. Mirrors `resolve_existing_prefix` in the
 * sandbox-policy crate.
 */
export async function resolveExistingPrefix(value: string): Promise<string> {
  if (!path.isAbsolute(value)) return value;
  return (await landingPath(value)) ?? value;
}

/** Where devices are, such as the null device every program writes to. */
const DEVICE_FOLDER = '/dev';

/**
 * What a write denial of `value` names: where a write through it lands, and,
 * when its last component is a link, the link itself. Seatbelt checks an
 * unlink or a rename against the link's own path, so a rule naming only the
 * target would let a program remove the link and leave a file in its place.
 * A target that is a device is left out: a repository can ship `.gitmodules`
 * as a link to `/dev/null`, and denying writes there would break every
 * program run in it. Mirrors `write_denial_spellings` in the sandbox-policy
 * crate.
 */
export async function writeDenialSpellings(value: string): Promise<string[]> {
  const landing = await resolveExistingPrefix(value);
  const own = path.join(await resolveExistingPrefix(path.dirname(value)), path.basename(value));
  return own === landing || isWithin(landing, DEVICE_FOLDER) ? [own] : [own, landing];
}

/** The file at the top of a checkout that maps each submodule to its folder. */
const SUBMODULE_MAP_FILE = '.gitmodules';

/**
 * Where `root` keeps its submodule map. A sandboxed command has no reason to
 * rewire submodules: it cannot add or update one, since git's own metadata is
 * read-only to it, and a host that reads this file to find them would be told
 * about ones that are not there, or not told about ones that are. Mirrors
 * `submodule_map` in the sandbox-policy crate.
 */
async function submoduleMap(root: string): Promise<string> {
  return path.join(await realpathOr(root), SUBMODULE_MAP_FILE);
}

const GIT_FILE_READ_LIMIT = 4 * 1024;
const CONFIG_READ_LIMIT = 1024 * 1024;

/**
 * At most `limit` bytes of a regular file, or null. Links are followed only
 * where git itself follows them: a linked `.git` file, `commondir` or global
 * config is a real setup, while git refuses a linked `.gitmodules`.
 */
async function readText(file: string, limit: number, followLinks: boolean): Promise<string | null> {
  return (await readRegularFile(file, limit, { followLinks }))?.toString('utf8') ?? null;
}

const GITDIR_PREFIX = 'gitdir:';

/**
 * Git metadata under `root` that a sandboxed program must not write: `.git`
 * itself, whether or not it exists yet, for a linked worktree the private and
 * shared git directories its `.git` file names, the `.git` file of every
 * linked worktree checked out below `root`, and the `.git` file of every
 * submodule `.gitmodules` names, which a write could point at a directory the
 * command filled. Host git reads hooks, config, the index and refs from these,
 * so a write there runs code outside the sandbox the next time the host runs
 * git in this checkout. Mirrors `git_metadata_paths` in the sandbox-policy
 * crate.
 */
export async function gitMetadataPaths(root: string): Promise<string[]> {
  const resolvedRoot = await realpathOr(root);
  const dotGit = path.join(resolvedRoot, GIT_METADATA_ENTRY);
  let gitDir: string | null = null;
  const stat = await fs.stat(dotGit).catch(() => null);
  if (stat?.isFile()) {
    const line = (await readText(dotGit, GIT_FILE_READ_LIMIT, true))?.split('\n')[0] ?? '';
    const target = line.startsWith(GITDIR_PREFIX) ? line.slice(GITDIR_PREFIX.length).trim() : '';
    if (target) gitDir = path.isAbsolute(target) ? target : path.join(resolvedRoot, target);
  } else if (stat?.isDirectory()) {
    gitDir = dotGit;
  }
  const paths = [dotGit];
  if (gitDir) {
    gitDir = await realpathOr(gitDir);
    const common = (
      await readText(path.join(gitDir, 'commondir'), GIT_FILE_READ_LIMIT, true)
    )?.trim();
    const commonDir = common
      ? await realpathOr(path.isAbsolute(common) ? common : path.join(gitDir, common))
      : null;
    paths.push(gitDir);
    if (commonDir) paths.push(commonDir);
    paths.push(...(await linkedWorktreeGitFiles(commonDir ?? gitDir, resolvedRoot)));
    paths.push(...(await indexedSubmoduleGitFiles(resolvedRoot, gitDir, commonDir ?? gitDir)));
  }
  paths.push(...(await submoduleGitFiles(resolvedRoot)));
  return [...new Set(paths)];
}

const INDEX_READ_LIMIT = 64 * 1024 * 1024;
const INDEX_PATH_LIMIT = 4096;
const INDEX_GITLINK_LIMIT = 10_000;
const GITLINK_MODE = 0o160000;
const SHA1_BYTES = 20;
const SHA256_BYTES = 32;

/**
 * Git's variable-length offset encoding, as index version 4 prefixes each
 * path with: the value and how many bytes held it.
 */
function offsetVarint(data: Buffer, from: number): { value: number; used: number } | null {
  let used = 0;
  let byte = data[from + used];
  if (byte === undefined) return null;
  used += 1;
  let value = byte & 0x7f;
  while ((byte & 0x80) !== 0) {
    byte = data[from + used];
    if (byte === undefined) return null;
    used += 1;
    value = (value + 1) * 128 + (byte & 0x7f);
    if (!Number.isSafeInteger(value)) return null;
  }
  return { value, used };
}

/**
 * The paths of the gitlinks, mode `160000`, in a git index file of version 2,
 * 3 or 4 whose object names are `hashLength` bytes. Whatever cannot be read
 * ends the list there, and so does a path longer than `INDEX_PATH_LIMIT` or a
 * gitlink past `INDEX_GITLINK_LIMIT`. Mirrors `index_gitlinks` in the
 * sandbox-policy crate.
 */
export function indexGitlinks(data: Buffer, hashLength: number): string[] {
  const found: string[] = [];
  if (data.subarray(0, 4).toString('latin1') !== 'DIRC' || data.length < 12) return found;
  const version = data.readUInt32BE(4);
  const count = data.readUInt32BE(8);
  let at = 12;
  let previous: Buffer = Buffer.alloc(0);
  for (let entry = 0; entry < count; entry += 1) {
    const flagsAt = at + 40 + hashLength;
    if (flagsAt + 2 > data.length) break;
    const mode = data.readUInt32BE(at + 24);
    const flags = data.readUInt16BE(flagsAt);
    let nameAt = flagsAt + 2;
    if (version >= 3 && (flags & 0x4000) !== 0) nameAt += 2;
    let entryPath: Buffer;
    if (version >= 4) {
      const strip = offsetVarint(data, nameAt);
      if (!strip) break;
      const suffixAt = nameAt + strip.used;
      const end = data.indexOf(0, suffixAt);
      if (end === -1 || strip.value > previous.length) break;
      entryPath = Buffer.concat([
        previous.subarray(0, previous.length - strip.value),
        data.subarray(suffixAt, end),
      ]);
      at = end + 1;
    } else {
      const end = data.indexOf(0, nameAt);
      if (end === -1) break;
      entryPath = data.subarray(nameAt, end);
      at += (end - at + 8) & ~7;
    }
    if (entryPath.length > INDEX_PATH_LIMIT) break;
    if (mode === GITLINK_MODE) {
      if (found.length === INDEX_GITLINK_LIMIT) break;
      found.push(entryPath.toString('utf8'));
    }
    previous = entryPath;
  }
  return found;
}

/**
 * Whether the repository whose common git directory is `commonDir` names its
 * objects with SHA-256, which widens every index entry.
 */
async function sha256Repository(commonDir: string): Promise<boolean> {
  const config = await readText(path.join(commonDir, 'config'), GIT_FILE_READ_LIMIT, true);
  if (config === null) return false;
  return config.split('\n').some((line) => {
    const at = line.indexOf('=');
    return (
      at !== -1 &&
      line.slice(0, at).trim().toLowerCase() === 'objectformat' &&
      line
        .slice(at + 1)
        .trim()
        .toLowerCase() === 'sha256'
    );
  });
}

/**
 * The `.git` of every gitlink in the index of the checkout at `root`, read
 * from the index file rather than through git. `.gitmodules` is a file in the
 * project, which a sandboxed command may empty; the index lives in the git
 * directory, which no sandboxed command may write, so a submodule it names
 * stays named whatever an earlier run did to the project's files. Mirrors the
 * index half of `submodule_git_entries` in the sandbox-policy crate.
 */
async function indexedSubmoduleGitFiles(
  root: string,
  gitDir: string,
  commonDir: string,
): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(gitDir);
  } catch {
    return [];
  }
  const hashLength = (await sha256Repository(commonDir)) ? SHA256_BYTES : SHA1_BYTES;
  const files: string[] = [];
  let budget = INDEX_READ_LIMIT;
  for (const name of names) {
    if (name !== 'index' && !name.startsWith('sharedindex.')) continue;
    const data = await readRegularFile(path.join(gitDir, name), budget);
    if (!data) continue;
    budget -= data.length;
    for (const gitlink of indexGitlinks(data, hashLength)) {
      const parts = gitlink.split('/');
      if (parts.some((part) => part === '' || part === '.' || part === '..')) continue;
      const file = path.join(root, ...parts, GIT_METADATA_ENTRY);
      if (isSeatbeltSafePath(file)) files.push(file);
    }
    if (budget <= 0) break;
  }
  return [...new Set(files)].sort();
}

/**
 * The `.git` file of each submodule `root/.gitmodules` names, inside `root`.
 * A path the profile cannot name is left out, since naming it would refuse
 * every command. This is the half of `submodule_git_entries` in the
 * sandbox-policy crate that a sandboxed command can rewrite;
 * `indexedSubmoduleGitFiles` is the half it cannot.
 */
async function submoduleGitFiles(root: string): Promise<string[]> {
  const text = await readText(path.join(root, '.gitmodules'), CONFIG_READ_LIMIT, false);
  if (text === null) return [];
  const files: string[] = [];
  let inSubmodule = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const header = /^\[\s*([^\]\s"]+)/u.exec(line);
    if (header) {
      inSubmodule = (header[1] ?? '').toLowerCase() === 'submodule';
      continue;
    }
    const entry = inSubmodule ? /^path\s*=\s*(.*)$/iu.exec(line) : null;
    const value = entry?.[1]?.trim().replace(/^"(.*)"$/u, '$1');
    if (!value || path.isAbsolute(value)) continue;
    const parts = value.split(/[\\/]/u);
    if (parts.some((part) => part === '' || part === '.' || part === '..')) continue;
    const file = path.join(root, ...parts, GIT_METADATA_ENTRY);
    if (isSeatbeltSafePath(file)) files.push(file);
  }
  return [...new Set(files)].sort();
}

async function linkedWorktreeGitFiles(commonDir: string, root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(path.join(commonDir, 'worktrees'));
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const file = (
      await readText(path.join(commonDir, 'worktrees', entry, 'gitdir'), GIT_FILE_READ_LIMIT, true)
    )?.trim();
    if (!file || !path.isAbsolute(file)) continue;
    const resolved = path.join(await realpathOr(path.dirname(file)), path.basename(file));
    if (isWithin(resolved, root) && path.dirname(resolved) !== root) files.push(resolved);
  }
  return files.sort();
}

function gitExcludesFile(text: string, home: string): string | null {
  let section = '';
  let found: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const header = /^\[\s*([^\]\s"]+)/u.exec(line);
    if (header) {
      section = (header[1] ?? '').toLowerCase();
      continue;
    }
    if (section !== 'core') continue;
    const entry = /^excludesfile\s*=\s*(.*)$/iu.exec(line);
    if (entry) {
      found = (entry[1] ?? '')
        .replace(/\s[#;].*$/u, '')
        .trim()
        .replace(/^"(.*)"$/u, '$1');
    }
  }
  if (!found) return null;
  const expanded = found.startsWith('~/') ? path.join(home, found.slice(2)) : found;
  return path.isAbsolute(expanded) ? expanded : null;
}

/**
 * Every value of `key` in the sections of a git configuration file that
 * `inSection` accepts, in order. A section is named by its header's first
 * word, lower-cased, so `[includeIf "gitdir:~/work/"]` is `includeif`.
 * Mirrors `git_config_values` in the sandbox-policy crate.
 */
function gitConfigValues(
  text: string,
  inSection: (section: string) => boolean,
  key: string,
): string[] {
  let section = '';
  const found: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      section = (line.slice(1).split(/[\]".\s]/u)[0] ?? '').toLowerCase();
      continue;
    }
    if (!inSection(section)) continue;
    const equals = line.indexOf('=');
    if (equals === -1 || line.slice(0, equals).trim().toLowerCase() !== key) continue;
    const value = line.slice(equals + 1);
    let comment = value.length;
    for (let at = 1; at < value.length; at += 1) {
      if ((value[at] === '#' || value[at] === ';') && /\s/u.test(value[at - 1] ?? '')) {
        comment = at;
        break;
      }
    }
    const trimmed = value.slice(0, comment).trim();
    found.push(
      trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed,
    );
  }
  return found;
}

/** How deep `gitIncludeTargets` follows the includes of included files. */
const GIT_INCLUDE_DEPTH = 4;
/** The most include targets `gitIncludeTargets` names. */
const GIT_INCLUDE_LIMIT = 64;

/**
 * The files the `include.path` and `includeIf.*.path` settings of the git
 * configuration file `including` name, as git resolves them: `~/` from
 * `home`, and a relative path from the folder of the including file. Every
 * condition counts, since any could hold. A `..` is left in the path as
 * written: where it leads is for the link resolver to say. Mirrors
 * `git_include_paths` in the sandbox-policy crate.
 */
function gitIncludePaths(text: string, including: string, home: string): string[] {
  const folder = path.dirname(including);
  return gitConfigValues(
    text,
    (section) => section === 'include' || section === 'includeif',
    'path',
  )
    .filter((target) => target !== '')
    .map((target) =>
      target.startsWith('~/')
        ? `${home}/${target.slice(2)}`
        : path.isAbsolute(target)
          ? target
          : `${folder}/${target}`,
    );
}

/**
 * Every file `configs` include, and the files those include, to
 * `GIT_INCLUDE_DEPTH` and at most `GIT_INCLUDE_LIMIT` of them. Host git reads
 * them as part of the user's global configuration, so one in a writable root
 * would let a sandboxed command choose what host git runs. A relative
 * include is resolved from the including file as spelled and as it resolves,
 * since a dotfile is often a link into a dotfiles repository. Mirrors
 * `git_include_targets` in the sandbox-policy crate.
 */
async function gitIncludeTargets(configs: readonly string[], home: string): Promise<string[]> {
  const found: string[] = [];
  const pending: Array<[string, number]> = configs.map((file) => [file, 0]);
  for (;;) {
    const next = pending.pop();
    if (next === undefined) return found;
    const [file, depth] = next;
    const text = await readText(file, CONFIG_READ_LIMIT, true);
    if (text === null) continue;
    const resolved = await resolveExistingPrefix(file);
    const targets = gitIncludePaths(text, file, home);
    if (resolved !== file) targets.push(...gitIncludePaths(text, resolved, home));
    for (const target of targets) {
      if (found.includes(target) || configs.includes(target)) continue;
      if (found.length === GIT_INCLUDE_LIMIT) return found;
      found.push(target);
      if (depth + 1 < GIT_INCLUDE_DEPTH) pending.push([target, depth + 1]);
    }
  }
}

/**
 * The user's global git configuration a sandboxed git reads: `~/.gitconfig`,
 * the XDG `git` directory (`$XDG_CONFIG_HOME/git`, else `~/.config/git`), the
 * `core.excludesFile` either names, and every file either includes. Git
 * treats an unreadable global config as fatal, so these are readable inside
 * the sandbox, and kept read-only like every other host config: host git
 * reads them too, outside it. Mirrors `user_git_config_paths` in the
 * sandbox-policy crate.
 */
export async function userGitConfigPaths(
  home: string = os.homedir(),
  xdgConfigHome?: string,
): Promise<string[]> {
  const gitconfig = path.join(home, '.gitconfig');
  const xdg = path.join(
    xdgConfigHome !== undefined && path.isAbsolute(xdgConfigHome)
      ? xdgConfigHome
      : path.join(home, '.config'),
    'git',
  );
  const paths = [gitconfig, xdg];
  let excludes: string | null = null;
  for (const file of [path.join(xdg, 'config'), gitconfig]) {
    const text = await readText(file, CONFIG_READ_LIMIT, true);
    excludes = (text === null ? null : gitExcludesFile(text, home)) ?? excludes;
  }
  if (excludes && isSeatbeltSafePath(excludes)) paths.push(excludes);
  paths.push(...(await gitIncludeTargets([gitconfig, path.join(xdg, 'config')], home)));
  return paths;
}

/**
 * `userGitConfigPaths` for the environment a command runs in, plus the files
 * `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` name, which a sandboxed git
 * inherits and reads just as fatally. Only absolute paths count, and a device
 * such as `/dev/null` is left out, since denying writes there would break
 * every program. Mirrors `host_user_git_config_paths` in the sandbox-policy
 * crate.
 */
export async function hostUserGitConfigPaths(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const absolute = (name: string): string | undefined => {
    const value = env[name];
    return value !== undefined && path.isAbsolute(value) ? value : undefined;
  };
  const home = absolute('HOME');
  const paths =
    home === undefined ? [] : await userGitConfigPaths(home, absolute('XDG_CONFIG_HOME'));
  for (const name of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM']) {
    const named = absolute(name);
    if (named !== undefined && !isWithin(named, DEVICE_FOLDER) && !paths.includes(named)) {
      paths.push(named);
    }
  }
  return paths;
}

/**
 * What a sandboxed git must read outside the writable roots: the git
 * metadata of each root, which a linked worktree keeps outside its checkout,
 * and the user's git configuration. Each is named both as spelled and
 * resolved, since a dotfile is often a link, and a path the profile cannot
 * quote safely is left out rather than refusing the command.
 */
export async function seatbeltGitReadPaths(
  writableRoots: readonly string[],
  gitConfigPaths: readonly string[],
): Promise<string[]> {
  const candidates: string[] = [];
  for (const root of writableRoots) candidates.push(...(await gitMetadataPaths(root)));
  for (const configPath of gitConfigPaths) {
    candidates.push(configPath, await resolveExistingPrefix(configPath));
  }
  return [...new Set(candidates)].filter(isSeatbeltSafePath);
}

/**
 * The directories above `paths`, below `/`. Git resolves a linked worktree's
 * git directory with a component-by-component realpath, which stats each one
 * and fails on the first the sandbox hides.
 */
export function ancestorDirectories(paths: readonly string[]): string[] {
  const ancestors = new Set<string>();
  for (const value of paths) {
    for (let parent = path.dirname(value); parent !== path.dirname(parent);) {
      ancestors.add(parent);
      parent = path.dirname(parent);
    }
  }
  return [...ancestors].filter(isSeatbeltSafePath).sort();
}

/**
 * The paths a sandboxed command in `project` must leave read-only, in the
 * order the CLI's profile denies them: the git metadata and the submodule map
 * of every writable root; the user's git configuration; the project's config files; then each
 * host path that does not contain the project. Denying a host path that
 * contains the project, such as the config root around a managed worktree,
 * would deny the whole project, and nothing of it outside the project is
 * writable there. Each is named where a write to it lands and, when it is a
 * link, as the link too. The project's entries are also denied by name, at
 * any depth, by `seatbeltProjectEntryRules`.
 */
export async function sandboxProtectedPaths(input: {
  project: string;
  writableRoots: readonly string[];
  gitConfigPaths: readonly string[];
  hostPaths: readonly string[];
}): Promise<string[]> {
  const project = await realpathOr(input.project);
  const denied: string[] = [];
  for (const root of input.writableRoots) {
    for (const metadata of [...(await gitMetadataPaths(root)), await submoduleMap(root)]) {
      denied.push(...(await writeDenialSpellings(metadata)));
    }
  }
  // The crate names each of these where it resolves. A file that is a link
  // is named as the link too: an include the user keeps in a writable folder
  // may be one, and a rule on its target alone lets the link be replaced.
  for (const configPath of input.gitConfigPaths) {
    denied.push(...(await writeDenialSpellings(configPath)).filter(isSeatbeltSafePath));
  }
  for (const relative of PROJECT_CONFIG_PATHS) {
    denied.push(...(await writeDenialSpellings(path.join(project, relative))));
  }
  for (const hostPath of input.hostPaths) {
    if (isWithin(project, await resolveExistingPrefix(hostPath))) continue;
    denied.push(...(await writeDenialSpellings(hostPath)));
  }
  return [...new Set(denied)];
}

async function namesIn(folder: string, wanted: (name: string) => boolean): Promise<string[]> {
  try {
    return (await fs.readdir(folder))
      .filter(wanted)
      .sort()
      .map((name) => path.join(folder, name));
  } catch {
    return [];
  }
}

const CLAUDE_STATE_FILE = '.claude.json';

/**
 * Credential files under `home` whose names are not fixed, found as they are
 * now: the copies a tool keeps beside `~/.claude.json` under that name with a
 * further extension, and the databases at the top of `~/.codex`, which carry
 * a version in their names. Mirrors `credential_copies` in the sandbox-policy
 * crate.
 */
async function credentialCopies(home: string): Promise<string[]> {
  return [
    ...(await namesIn(home, (name) => name.startsWith(`${CLAUDE_STATE_FILE}.`))),
    ...(await namesIn(path.join(home, '.codex'), (name) => name.includes('.sqlite'))),
  ];
}

/**
 * The folders a sandboxed command may fill but not create, rename or remove:
 * each folder below a writable root that holds a git entry of its own, a
 * submodule or a linked worktree, and every folder between it and the root.
 * Denying writes to `libs/sm/.git` stops a rewrite of that entry and nothing
 * else: `mv libs/sm aside && mv staged libs/sm` puts a folder with a `.git`
 * of the command's own under the name, and the user's next `git status`
 * there runs what its config says. The folder's name is what has to hold, so
 * the name and each name above it are pinned, as `.vscode` is for the entry
 * inside it. Each is pinned as `writeDenialSpellings` names it, so a folder
 * that is a link is pinned under its own name as well as where it leads, and
 * the link cannot be removed and made again. A folder whose name a profile
 * cannot hold is left in, so the run is refused rather than started without
 * its pin. Mirrors `nested_checkout_folders` and `seatbelt_checkout_pins` in
 * the sandbox-policy crate.
 */
export async function nestedCheckoutPins(writableRoots: readonly string[]): Promise<string[]> {
  const folders = new Set<string>();
  for (const root of writableRoots) {
    const top = await realpathOr(root);
    for (const entry of await gitMetadataPaths(root)) {
      if (path.basename(entry) !== GIT_METADATA_ENTRY || !isWithin(entry, top)) continue;
      for (
        let folder = path.dirname(entry);
        folder !== top && isWithin(folder, top);
        folder = path.dirname(folder)
      ) {
        folders.add(folder);
      }
    }
  }
  const pins = new Set<string>();
  for (const folder of [...folders].sort()) {
    for (const spelling of await writeDenialSpellings(folder)) pins.add(spelling);
  }
  return [...pins];
}

/**
 * The credential locations under `home`, each where a read of it lands.
 * Mirrors `credential_paths` in the sandbox-policy crate.
 */
export async function credentialReadPaths(home: string = os.homedir()): Promise<string[]> {
  const named = HOME_CREDENTIAL_PATHS.map((relative) => path.join(home, relative));
  return Promise.all([...named, ...(await credentialCopies(home))].map(resolveExistingPrefix));
}

/**
 * Everything a sandboxed command is never given to read: the credential
 * locations, and the host's own folders, which hold this app's sign-in, its
 * grants and the CLI's tokens. The crate says the same of a host: it "adds
 * its own data and config directories". A project kept inside one of them
 * stays readable, as `seatbeltReadDenials` gives a writable root back.
 */
export async function sandboxUnreadablePaths(input: {
  hostPaths: readonly string[];
  home?: string;
}): Promise<string[]> {
  const host = await Promise.all(input.hostPaths.map(resolveExistingPrefix));
  return [...new Set([...(await credentialReadPaths(input.home)), ...host])];
}

async function resolvedDirectory(value: string): Promise<string | null> {
  try {
    const resolved = await fs.realpath(value);
    return (await fs.stat(resolved)).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

const PROGRAM_FOLDER_NAMES: readonly string[] = ['bin', 'sbin'];

/**
 * Folders under the home folder that hold far more than any toolchain: this
 * app's own data and every other app's, and the user's documents.
 */
const WIDE_HOME_FOLDERS: readonly string[] = ['Library', 'Documents', 'Desktop', 'Downloads'];

/**
 * Whether making `folder` readable would open the home folder, one of its
 * wide folders, or anything above them. A folder inside one is not that.
 */
function opensHomeWide(folder: string, homes: readonly string[]): boolean {
  return homes.some((home) =>
    [home, ...WIDE_HOME_FOLDERS.map((name) => path.join(home, name))].some((wide) =>
      isWithin(wide, folder),
    ),
  );
}

/**
 * The parts of an install that hold code and sit beside its `bin`. Its data,
 * state and configuration sit beside it too, under other names.
 */
const INSTALL_CODE_FOLDERS: readonly string[] = ['lib', 'libexec'];

/**
 * The folders a sandboxed command may read for one entry of the PATH.
 *
 * Outside the home folder an entry named `bin` or `sbin` is one part of an
 * install, so the folder above it is read, unless that is a folder at the top
 * of the disk. Inside the home folder the folder above is never read: a tool
 * kept at `~/.local/bin` shares `~/.local` with every program's saved data
 * and sign-ins, and `~/Library/pnpm` shares `~/Library` with every app's.
 * There the entry is read, and for a `bin` the `lib` and `libexec` beside
 * it, which is what a launcher script in it loads. Nothing that would open
 * the home folder, one of its wide folders or anything above them is ever in
 * the answer.
 */
export function toolchainRoots(entry: string, homes: readonly string[]): string[] {
  const parent = path.dirname(entry);
  const programs = PROGRAM_FOLDER_NAMES.includes(path.basename(entry));
  const insideHome = homes.some((home) => isWithin(entry, home));
  const beside =
    programs && !opensHomeWide(parent, homes)
      ? INSTALL_CODE_FOLDERS.map((name) => path.join(parent, name))
      : [];
  const roots = insideHome
    ? [entry, ...beside]
    : [
        programs && path.dirname(parent) !== parent && path.dirname(parent) !== '/'
          ? parent
          : entry,
      ];
  return roots.filter((root) => root !== '/' && !opensHomeWide(root, homes));
}

/** Where the Command Line Tools sit when no Xcode is selected. */
const COMMAND_LINE_TOOLS = '/Library/Developer/CommandLineTools';

/**
 * The developer directory a sandboxed program is told as `DEVELOPER_DIR`, so
 * Apple's tool shims such as `/usr/bin/git` run the selected developer tools
 * without resolving the selection themselves, which reads the `/var` link and
 * fails inside the sandbox. Null when the run's environment names one
 * already, which the program inherits, or when no developer tools are found:
 * the selected folder when it exists, else the Command Line Tools. Mirrors
 * `host_developer_dir` in the sandbox-policy crate.
 */
export async function hostDeveloperDir(env: NodeJS.ProcessEnv): Promise<string | null> {
  if (env['DEVELOPER_DIR'] !== undefined) return null;
  const isFolder = async (candidate: string): Promise<boolean> =>
    (await fs.stat(candidate).catch(() => null))?.isDirectory() ?? false;
  const selected = await fs.readlink(XCODE_SELECT_LINK).catch(() => null);
  if (selected !== null && path.isAbsolute(selected) && (await isFolder(selected))) return selected;
  return (await isFolder(COMMAND_LINE_TOOLS)) ? COMMAND_LINE_TOOLS : null;
}

/**
 * What a program started under a Seatbelt profile is given in its
 * environment: `TMPDIR`, the private scratch folder, and `DEVELOPER_DIR` when
 * `hostDeveloperDir` finds one. The scratch folder is named as it resolves.
 * Apple's tool shims keep a lookup cache in `TMPDIR`, and one spelled through
 * the `/var` link cannot be reached inside the sandbox, so the shim falls
 * back to `/tmp`, cannot write its cache and reports an error on every run.
 * Mirrors `seatbelt_environment` in the sandbox-policy crate.
 */
export async function seatbeltEnvironment(
  scratch: string,
  env: NodeJS.ProcessEnv,
): Promise<Record<string, string>> {
  const developerDir = await hostDeveloperDir(env);
  return {
    TMPDIR: await fs.realpath(scratch),
    ...(developerDir === null ? {} : { DEVELOPER_DIR: developerDir }),
  };
}

export async function seatbeltToolchainRoots(
  pathValue: string | undefined,
  program: string,
  home: string = os.homedir(),
): Promise<string[]> {
  const homes = [...new Set([home, await realpathOr(home)])];
  const candidates = [
    ...(pathValue ?? '').split(path.delimiter).filter((entry) => path.isAbsolute(entry)),
    path.dirname(program),
  ];
  const roots = new Set<string>();
  for (const candidate of candidates) {
    const entry = await resolvedDirectory(candidate);
    if (!entry) continue;
    for (const named of toolchainRoots(entry, homes)) {
      // A `lib` that is a link to somewhere else is not part of this install.
      const root: string | null = named === entry ? entry : await resolvedDirectory(named);
      if (!root || !isSeatbeltSafePath(root) || opensHomeWide(root, homes)) continue;
      if (root !== entry && !isWithin(root, path.dirname(entry))) continue;
      roots.add(root);
    }
  }
  return [...roots];
}
