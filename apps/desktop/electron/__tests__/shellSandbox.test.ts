import { execFileSync } from 'node:child_process';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEPENDENCY_TREE_NAMES,
  GIT_METADATA_ENTRY,
  HOME_CREDENTIAL_PATHS,
  HOOK_MANAGER_PATHS,
  PROTECTED_WORKSPACE_PATHS,
  ShellCommandRefused,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { runShellCommand } from '../runtime/shellService';
import {
  AGENT_INSTRUCTION_PATHS,
  INSTRUCTION_FOLDERS_OUTSIDE_PROTECTED_ENTRIES,
  PROJECT_CONFIG_PATHS,
  NAMED_PROJECT_ENTRIES,
  SEATBELT_EXECUTABLE,
  SEATBELT_MACH_SERVICES,
  SEATBELT_NETWORK_MACH_SERVICES,
  SEATBELT_NETWORK_RULES,
  SEATBELT_PROCESS_RULES,
  SEATBELT_SYSTEM_READ_PATHS,
  SHARED_PARENT_FOLDERS,
  SEATBELT_APPLICATIONS_METADATA_RULE,
  SEATBELT_VAR_LINK_RULE,
  SEATBELT_XCODE_READ_RULE,
  bubblewrapArgs,
  credentialReadPaths,
  detectShellSandbox,
  gitMetadataPaths,
  hostConfigPaths,
  hostDeveloperDir,
  indexGitlinks,
  landingPath,
  nestedCheckoutPins,
  seatbeltAlternations,
  seatbeltEnvironment,
  planSandboxedSpawn,
  sandboxProtectedPaths,
  sandboxUnreadablePaths,
  seatbeltGitReadPaths,
  seatbeltProfile,
  seatbeltProjectEntryRules,
  seatbeltReadDenials,
  seatbeltRegex,
  seatbeltRegexLiteral,
  seatbeltToolchainRoots,
  toolchainRoots,
  hostUserGitConfigPaths,
  userGitConfigPaths,
  writeDenialSpellings,
} from '../runtime/shellSandbox';

const seatbelt = { backend: 'seatbelt', executable: SEATBELT_EXECUTABLE } as const;
const bubblewrap = { backend: 'bubblewrap', executable: '/usr/bin/bwrap' } as const;

const base = {
  program: '/usr/bin/git',
  args: ['status', '--short'],
  cwd: '/work/project/src',
  writableRoots: ['/work/project', '/scratch/agi-shell-scratch-1'],
  readableRoots: ['/opt/toolchain'],
  protectedPaths: [] as string[],
  pinnedFolders: [] as string[],
  unreadablePaths: [] as string[],
  metadataPaths: [] as string[],
  network: 'deny' as const,
  developerDirNamed: true,
};

/** The write allows that name a place, as opposed to the entry rules, which give back a name. */
function writeRules(profile: string): string[] {
  return profile
    .split('\n')
    .filter((line) => line.startsWith('(allow file-write*') && !line.includes('(regex '));
}

/**
 * Where the rule that starts with `head` and lists `name` among its
 * alternatives is in `rules`, or -1, so a check does not depend on which
 * pattern a name shares with others. Mirrors `entry_rule` in the
 * sandbox-policy crate.
 */
function entryRule(rules: readonly string[], head: string, name: string): number {
  const end = ')$"))';
  return rules.findIndex((rule) => {
    if (!rule.startsWith(head)) return false;
    const rest = rule.slice(head.length);
    if (rest.startsWith('(.*/)?') || !rest.startsWith('(') || !rest.endsWith(end)) return false;
    return rest.slice(1, -end.length).split('|').includes(name);
  });
}

describe('seatbelt spawn plan', () => {
  it('runs the resolved program under sandbox-exec with an inline profile', () => {
    const plan = planSandboxedSpawn({ sandbox: seatbelt, ...base });
    expect(plan.command).toBe(SEATBELT_EXECUTABLE);
    expect(plan.args[0]).toBe('-p');
    expect(plan.args.slice(2)).toEqual(['/usr/bin/git', 'status', '--short']);
    expect(plan.args[1]).toContain('(deny default)');
  });

  it('allows writes only inside the approved folder and its private scratch folder', () => {
    const profile = seatbeltProfile(base);
    expect(writeRules(profile)).toEqual([
      '(allow file-write* (literal "/dev/null"))',
      '(allow file-write* (subpath "/work/project"))',
      '(allow file-write* (subpath "/scratch/agi-shell-scratch-1"))',
    ]);
    const givenBack = profile
      .split('\n')
      .filter((line) => line.startsWith('(allow file-write') && line.includes('(regex '));
    expect(givenBack.length).toBeGreaterThan(0);
    expect(givenBack).toEqual(
      seatbeltProjectEntryRules('/work/project').filter((rule) => rule.startsWith('(allow ')),
    );
    for (const rule of givenBack) {
      expect(rule).toContain('(regex "^/work/project/(.*/)?(node_modules|');
    }
    expect(profile).not.toContain('(allow default)');
    expect(profile).not.toContain(os.homedir());
  });

  it('does not grant reads of other sessions in shared temporary directories', () => {
    const profile = seatbeltProfile(base);
    expect(profile).not.toContain('(subpath "/tmp")');
    expect(profile).not.toContain('(subpath "/private/tmp")');
  });

  it('never makes a toolchain folder writable', () => {
    const profile = seatbeltProfile(base);
    expect(writeRules(profile).some((line) => line.includes('/opt/toolchain'))).toBe(false);
    expect(profile).toContain('(subpath "/opt/toolchain")');
  });

  it('denies the network unless the run allows it', () => {
    expect(seatbeltProfile(base)).not.toContain('network');
    const open = seatbeltProfile({ ...base, network: 'allow' });
    for (const rule of SEATBELT_NETWORK_RULES) expect(open).toContain(rule);
  });

  const AWKWARD = '/Users/someone/a (b) "c" \\d';
  /** A profile with every string literal emptied, which leaves only what Seatbelt reads as rules. */
  const outsideStrings = (profile: string) => profile.replace(/"(?:[^"\\]|\\.)*"/gu, '""');

  it('writes a path that holds a quote, parentheses and a backslash as one escaped string, in every rule', () => {
    const profile = seatbeltProfile({
      ...base,
      writableRoots: [AWKWARD, '/tmp/x")(allow default)(deny "'],
      readableRoots: [`${AWKWARD}-tools`],
      protectedPaths: [`${AWKWARD}/.mcp.json`],
      unreadablePaths: [`${AWKWARD}-tools/.ssh`],
      metadataPaths: [AWKWARD],
    });

    for (const rule of [
      '(allow file-write* (subpath "/Users/someone/a (b) \\"c\\" \\\\d"))',
      '(allow file-write* (subpath "/tmp/x\\")(allow default)(deny \\""))',
      '(deny file-write-unlink (literal "/Users/someone/a (b) \\"c\\" \\\\d"))',
      '(deny file-write* (subpath "/Users/someone/a (b) \\"c\\" \\\\d/.mcp.json"))',
      '(deny file-read* (subpath "/Users/someone/a (b) \\"c\\" \\\\d-tools/.ssh"))',
      '(allow file-read-metadata (literal "/Users/someone/a (b) \\"c\\" \\\\d"))',
    ]) {
      expect(profile.split('\n'), rule).toContain(rule);
    }
    for (const head of [
      '(deny file-write* (regex "^/Users/someone/a [(]b[)] \\"c\\" \\\\\\\\d/(.*/)?',
      '(deny file-write* (regex "^/Users/someone/a [(]b[)] \\"c\\" \\\\\\\\d/',
    ]) {
      expect(
        entryRule(profile.split('\n'), head, '[.][hH][uU][sS][kK][yY](/.*)?'),
        head,
      ).toBeGreaterThanOrEqual(0);
    }
    expect(outsideStrings(profile)).not.toContain('allow default');
    expect(
      outsideStrings(profile)
        .split('\n')
        .filter((line) => !/^\(.*\)$/u.test(line)),
    ).toEqual(['']);
  });

  it.each([
    ['a newline', '/tmp/a\nb'],
    ['a NUL', '/tmp/a\u0000b'],
    ['a tab', '/tmp/a\tb'],
    ['a line separator', '/tmp/a b'],
    ['a paragraph separator', '/tmp/a b'],
    ['a space at its end', '/tmp/ab '],
    ['nothing but the root', '/'],
    ['no leading slash', 'tmp/ab'],
  ])('still refuses a folder whose path holds %s', (_label, folder) => {
    const attempt = () => seatbeltProfile({ ...base, writableRoots: [folder] });

    expect(attempt).toThrow(ShellCommandRefused);
    try {
      attempt();
    } catch (error) {
      expect((error as ShellCommandRefused).reason).toBe('sandbox-unavailable');
    }
  });

  it('orders the write rules as the last match decides: allows, entry rules, pins, then path denials', () => {
    const profile = seatbeltProfile({
      ...base,
      protectedPaths: ['/work/project/.git', '/work/project/.mcp.json'],
    });
    const lines = profile.trim().split('\n');
    const entryRules = seatbeltProjectEntryRules('/work/project');
    const firstEntry = lines.indexOf(entryRules[0] as string);

    expect(lines[firstEntry - 1]).toBe(
      '(allow file-write* (subpath "/scratch/agi-shell-scratch-1"))',
    );
    expect(lines.slice(firstEntry, firstEntry + entryRules.length)).toEqual(entryRules);
    expect(lines.slice(firstEntry + entryRules.length)).toEqual([
      '(deny file-write-unlink (literal "/work/project"))',
      '(deny file-write-unlink (literal "/scratch/agi-shell-scratch-1"))',
      '(deny file-write* (subpath "/work/project/.git"))',
      '(deny file-write* (subpath "/work/project/.mcp.json"))',
    ]);
    expect(lines.findLastIndex((line) => line.startsWith('(allow file-write'))).toBeLessThan(
      lines.indexOf('(deny file-write-unlink (literal "/work/project"))'),
    );
  });

  it('names the entries of the first writable root only, which is the project', () => {
    const profile = seatbeltProfile(base);

    expect(profile).toContain('(regex "^/work/project/');
    expect(profile).not.toContain('(regex "^/scratch/');
  });

  it('hides credential locations after every read allow, and gives back a root that sits in one', () => {
    const profile = seatbeltProfile({
      ...base,
      writableRoots: ['/home/u/.codex/worktrees/w1', '/scratch/s'],
      readableRoots: ['/home/u/.cargo'],
      unreadablePaths: ['/home/u/.cargo/credentials.toml', '/home/u/.codex'],
    });
    const lines = profile.trim().split('\n');

    expect(lines.slice(-5)).toEqual([
      '(deny file-read* (subpath "/home/u/.cargo/credentials.toml"))',
      '(deny file-read* (subpath "/home/u/.codex"))',
      '(allow file-read-metadata (literal "/home/u/.codex/worktrees"))',
      '(allow file-read-metadata (literal "/home/u/.codex"))',
      '(allow file-read* (subpath "/home/u/.codex/worktrees/w1"))',
    ]);
    expect(lines.findLastIndex((line) => line.includes('(subpath "/home/u/.cargo")'))).toBeLessThan(
      lines.length - 5,
    );
  });

  it('refuses a credential location or a protected path it cannot name, rather than leaving it open', () => {
    expect(() => seatbeltProfile({ ...base, unreadablePaths: ['/home/u\n/.ssh'] })).toThrow(
      ShellCommandRefused,
    );
    expect(() =>
      seatbeltProfile({ ...base, protectedPaths: ['/work/project/x\n(allow default)'] }),
    ).toThrow(ShellCommandRefused);
  });

  it('refuses a plan with no folder to confine writes to', () => {
    expect(() => planSandboxedSpawn({ sandbox: seatbelt, ...base, writableRoots: [] })).toThrow(
      ShellCommandRefused,
    );
  });
});

describe('bubblewrap spawn plan', () => {
  it('mounts the system read-only, binds only the writable roots and runs the program directly', () => {
    const plan = planSandboxedSpawn({ sandbox: bubblewrap, ...base });
    expect(plan.command).toBe('/usr/bin/bwrap');
    expect(plan.args).toEqual([
      '--die-with-parent',
      '--unshare-pid',
      '--unshare-uts',
      '--unshare-net',
      '--ro-bind',
      '/',
      '/',
      '--tmpfs',
      '/tmp',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--bind',
      '/work/project',
      '/work/project',
      '--bind',
      '/scratch/agi-shell-scratch-1',
      '/scratch/agi-shell-scratch-1',
      '--chdir',
      '/work/project/src',
      '--',
      '/usr/bin/git',
      'status',
      '--short',
    ]);
  });

  it('keeps the network namespace only when the run allows the network', () => {
    expect(bubblewrapArgs({ ...base, network: 'allow' })).not.toContain('--unshare-net');
  });

  it('refuses the filesystem root as a writable root', () => {
    expect(() => bubblewrapArgs({ ...base, writableRoots: ['/'] })).toThrow(ShellCommandRefused);
  });

  it('binds protected paths read-only over the writable binds, or their nearest existing ancestor', async () => {
    const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-bwrap-ro-')));
    try {
      await fs.mkdir(path.join(project, '.git'));
      await fs.mkdir(path.join(project, '.vscode'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const args = bubblewrapArgs({
        ...base,
        cwd: project,
        writableRoots: [project],
        protectedPaths: [
          path.join(project, '.git'),
          path.join(project, '.vscode', 'mcp.json'),
          path.join(project, '.mcp.json'),
          '/elsewhere/.agiworkforce',
        ],
      });
      const readOnly = args
        .map((arg, index) => (arg === '--ro-bind' ? args[index + 1] : null))
        .filter((value): value is string => value !== null && value !== '/');
      expect(readOnly).toEqual([path.join(project, '.git'), path.join(project, '.vscode')]);
      expect(args.lastIndexOf('--bind')).toBeLessThan(args.lastIndexOf('--ro-bind'));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(path.join(project, '.mcp.json'));
      warn.mockRestore();
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

describe('protected paths', () => {
  let parent: string;

  beforeAll(async () => {
    parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-protected-')));
  });

  afterAll(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it('names .git even before it exists', async () => {
    const plain = path.join(parent, 'plain');
    await fs.mkdir(plain);
    expect(await gitMetadataPaths(plain)).toEqual([path.join(plain, '.git')]);
  });

  it('follows a linked worktree to its private and shared git directories, and lists worktrees checked out below the root', async () => {
    const repo = path.join(parent, 'repo');
    const common = path.join(repo, '.git');
    const nested = path.join(repo, 'trees', 'feature');
    const outside = path.join(parent, 'outside');
    await fs.mkdir(path.join(common, 'worktrees', 'feature'), { recursive: true });
    await fs.mkdir(path.join(common, 'worktrees', 'outside'), { recursive: true });
    await fs.mkdir(nested, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    for (const [name, checkout] of [
      ['feature', nested],
      ['outside', outside],
    ] as const) {
      const gitDir = path.join(common, 'worktrees', name);
      await fs.writeFile(path.join(gitDir, 'commondir'), '../..\n');
      await fs.writeFile(path.join(gitDir, 'gitdir'), `${path.join(checkout, '.git')}\n`);
      await fs.writeFile(path.join(checkout, '.git'), `gitdir: ${gitDir}\n`);
    }

    expect(await gitMetadataPaths(repo)).toEqual([common, path.join(nested, '.git')]);
    expect(await gitMetadataPaths(outside)).toEqual([
      path.join(outside, '.git'),
      path.join(common, 'worktrees', 'outside'),
      common,
    ]);
  });

  it('reads the global git config, the XDG folder and the excludes file either names', async () => {
    const home = path.join(parent, 'git-home');
    await fs.mkdir(path.join(home, '.config', 'git'), { recursive: true });
    await fs.writeFile(
      path.join(home, '.gitconfig'),
      '[user]\n\tname = x\n[core]\n\texcludesFile = "~/.global-ignore" ; comment\n',
    );
    expect(await userGitConfigPaths(home)).toEqual([
      path.join(home, '.gitconfig'),
      path.join(home, '.config', 'git'),
      path.join(home, '.global-ignore'),
    ]);

    await fs.writeFile(path.join(home, '.gitconfig'), '[core]\n\texcludesfile = /tmp/x")(allow\n');
    expect(await userGitConfigPaths(home)).toEqual([
      path.join(home, '.gitconfig'),
      path.join(home, '.config', 'git'),
      '/tmp/x")(allow',
    ]);

    await fs.writeFile(path.join(home, '.gitconfig'), '[core]\n\texcludesfile = /tmp/a\tb\n');
    expect(await userGitConfigPaths(home)).toHaveLength(2);
  });

  // Host git reads every file the global configuration includes. With
  // `~/.gitconfig` a link into a dotfiles folder and an include that lives in
  // the workspace, only the link's target was write-denied: a sandboxed
  // command could write the include and choose what host git runs.
  it('follows includes from the global git config, as spelled and as the config resolves, and denies writes to each', async () => {
    const home = path.join(parent, 'include-home');
    const work = path.join(home, 'work');
    await fs.mkdir(path.join(home, 'dotfiles'), { recursive: true });
    await fs.mkdir(path.join(home, '.config', 'git'), { recursive: true });
    await fs.mkdir(work, { recursive: true });
    await fs.writeFile(
      path.join(home, 'dotfiles', 'gitconfig'),
      [
        '[include]',
        '\tpath = ~/work/.gitconfig',
        '\tpath = "shared.inc" # beside the file',
        '[includeIf "gitdir:~/work/"]',
        '\tpath = /opt/team/gitconfig',
        '[core]',
        '\tpath = not-an-include',
        '',
      ].join('\n'),
    );
    await fs.symlink(path.join(home, 'dotfiles', 'gitconfig'), path.join(home, '.gitconfig'));
    await fs.writeFile(path.join(work, '.gitconfig'), '[include]\n\tpath = nested.inc\n');
    await fs.writeFile(path.join(work, 'nested.inc'), '[alias]\n\tst = status\n');

    const config = await userGitConfigPaths(home);

    expect(config.slice(0, 2)).toEqual([
      path.join(home, '.gitconfig'),
      path.join(home, '.config', 'git'),
    ]);
    expect([...config.slice(2)].sort()).toEqual(
      [
        path.join(work, '.gitconfig'),
        path.join(home, 'shared.inc'),
        path.join(home, 'dotfiles', 'shared.inc'),
        '/opt/team/gitconfig',
        path.join(work, 'nested.inc'),
      ].sort(),
    );

    const denied = await sandboxProtectedPaths({
      project: work,
      writableRoots: [work],
      gitConfigPaths: config,
      hostPaths: [],
    });
    for (const file of [
      path.join(work, '.gitconfig'),
      path.join(work, 'nested.inc'),
      path.join(home, 'dotfiles', 'gitconfig'),
      path.join(home, '.gitconfig'),
    ]) {
      expect(denied, file).toContain(file);
    }
    expect(
      await hostUserGitConfigPaths({
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, 'xdg'),
        GIT_CONFIG_GLOBAL: path.join(home, 'other.gitconfig'),
        GIT_CONFIG_SYSTEM: '/dev/null',
      }),
    ).toEqual(
      expect.arrayContaining([
        path.join(home, 'xdg', 'git'),
        path.join(home, 'other.gitconfig'),
        path.join(work, '.gitconfig'),
      ]),
    );
    expect(
      await hostUserGitConfigPaths({ HOME: home, GIT_CONFIG_SYSTEM: '/dev/null' }),
    ).not.toContain('/dev/null');
    expect(await hostUserGitConfigPaths({ HOME: 'relative' })).toEqual([]);
  });

  it('stops following includes at the depth and the count the crate does', async () => {
    const home = path.join(parent, 'include-chain');
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(path.join(home, '.gitconfig'), '[include]\n\tpath = a1\n');
    for (let depth = 1; depth <= 6; depth += 1) {
      await fs.writeFile(path.join(home, `a${depth}`), `[include]\n\tpath = a${depth + 1}\n`);
    }
    expect((await userGitConfigPaths(home)).slice(2)).toEqual(
      [1, 2, 3, 4].map((depth) => path.join(home, `a${depth}`)),
    );

    await fs.writeFile(
      path.join(home, '.gitconfig'),
      `[include]\n${Array.from({ length: 80 }, (_, index) => `\tpath = many/${index}\n`).join('')}`,
    );
    expect((await userGitConfigPaths(home)).slice(2)).toHaveLength(64);
  });

  it("lets git read a linked worktree's git directories outside its checkout", async () => {
    const outside = path.join(parent, 'outside');
    const common = path.join(parent, 'repo', '.git');
    const reads = await seatbeltGitReadPaths([outside], []);
    expect(reads).toContain(common);
    expect(reads).toContain(path.join(common, 'worktrees', 'outside'));
    const profile = seatbeltProfile({ ...base, writableRoots: [outside], readableRoots: reads });
    expect(profile).toContain(`(subpath "${common}")`);
    expect(writeRules(profile).some((line) => line.includes(common))).toBe(false);
  });

  it('covers git metadata, project config and host config, but not a host path around the project', async () => {
    const project = path.join(parent, 'project');
    await fs.mkdir(path.join(project, '.git'), { recursive: true });
    const home = path.join(parent, 'home');
    const managed = path.join(home, '.agiworkforce', 'worktrees', 'w1');
    await fs.mkdir(managed, { recursive: true });

    const gitconfig = path.join(home, '.gitconfig');
    const protectedPaths = await sandboxProtectedPaths({
      project,
      writableRoots: [project],
      gitConfigPaths: [gitconfig, path.join(home, 'odd")(allow'), path.join(home, 'bad\nname')],
      hostPaths: hostConfigPaths(home, {}),
    });
    expect(protectedPaths).toEqual([
      path.join(project, '.git'),
      path.join(project, '.gitmodules'),
      gitconfig,
      path.join(home, 'odd")(allow'),
      ...PROJECT_CONFIG_PATHS.map((relative) => path.join(project, relative)),
      path.join(home, '.agiworkforce'),
      path.join(home, '.agiworkforce', 'git'),
      path.join(home, '.agiworkforce', 'git-state'),
    ]);

    const inside = await sandboxProtectedPaths({
      project: managed,
      writableRoots: [managed],
      gitConfigPaths: [],
      hostPaths: hostConfigPaths(home, {}),
    });
    expect(inside).not.toContain(path.join(home, '.agiworkforce'));
    expect(inside).toContain(path.join(home, '.agiworkforce', 'git'));
    expect(inside).toContain(path.join(home, '.agiworkforce', 'git-state'));
  });

  it('keeps the config root and git state AGIWORKFORCE_HOME names read-only, even inside the project', async () => {
    const home = path.join(parent, 'home');
    const project = path.join(parent, 'moved-home-project');
    const cliHome = path.join(project, 'cli-home');
    await fs.mkdir(cliHome, { recursive: true });
    expect(hostConfigPaths(home, { AGIWORKFORCE_HOME: cliHome })).toEqual([
      path.join(home, '.agiworkforce'),
      path.join(home, '.agiworkforce', 'git'),
      cliHome,
      path.join(cliHome, 'git-state'),
    ]);
    expect(hostConfigPaths(home, { AGIWORKFORCE_HOME: 'relative' })).toEqual(
      hostConfigPaths(home, {}).slice(0, 2),
    );

    const protectedPaths = await sandboxProtectedPaths({
      project,
      writableRoots: [project],
      gitConfigPaths: [],
      hostPaths: hostConfigPaths(home, { AGIWORKFORCE_HOME: cliHome }),
    });
    expect(protectedPaths).toContain(cliHome);
    expect(protectedPaths).toContain(path.join(cliHome, 'git-state'));

    const aroundProject = await sandboxProtectedPaths({
      project,
      writableRoots: [project],
      gitConfigPaths: [],
      hostPaths: hostConfigPaths(home, { AGIWORKFORCE_HOME: project }),
    });
    expect(aroundProject).not.toContain(project);
    expect(aroundProject).toContain(path.join(project, 'git-state'));
  });

  it('names the gitfile of each submodule .gitmodules lists, and only inside the root', async () => {
    const repo = path.join(parent, 'super');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.writeFile(
      path.join(repo, '.gitmodules'),
      [
        '[submodule "lib"]',
        '\tpath = vendor/lib',
        '[submodule "quoted"]',
        '\tpath = "deps/quoted"',
        '[submodule "escape"]',
        '\tpath = ../outside',
        '[submodule "absolute"]',
        '\tpath = /etc',
        '[submodule "dotted"]',
        '\tpath = a/./b',
        '[submodule "awkward"]',
        '\tpath = a")(allow',
        '[submodule "unnameable"]',
        '\tpath = a\tb',
        '[remote "origin"]',
        '\tpath = not-a-submodule',
        '',
      ].join('\n'),
    );
    expect(await gitMetadataPaths(repo)).toEqual([
      path.join(repo, '.git'),
      path.join(repo, 'a")(allow', '.git'),
      path.join(repo, 'deps', 'quoted', '.git'),
      path.join(repo, 'vendor', 'lib', '.git'),
    ]);
  });

  // llm-guardrail-allow: the fixtures are a FIFO and a link to /dev/zero, neither of which exists on Windows
  it.skipIf(process.platform === 'win32')(
    'skips a .gitmodules, .git file or git config that is a FIFO or a link to /dev/zero, without hanging',
    async () => {
      const repo = path.join(parent, 'special');
      const home = path.join(parent, 'special-home');
      await fs.mkdir(repo, { recursive: true });
      await fs.mkdir(path.join(home, '.config', 'git'), { recursive: true });
      const special = [
        path.join(repo, '.gitmodules'),
        path.join(repo, '.git'),
        path.join(home, '.gitconfig'),
        path.join(home, '.config', 'git', 'config'),
      ];
      for (const make of [
        (file: string) => execFileSync('mkfifo', [file]),
        (file: string) => fs.symlink('/dev/zero', file),
      ]) {
        for (const file of special) {
          await fs.rm(file, { force: true });
          await make(file);
        }
        const started = Date.now();
        expect(await gitMetadataPaths(repo)).toEqual([path.join(repo, '.git')]);
        expect(await userGitConfigPaths(home)).toEqual([
          path.join(home, '.gitconfig'),
          path.join(home, '.config', 'git'),
        ]);
        expect(Date.now() - started).toBeLessThan(1_000);
      }
    },
  );
});

/** A git index of `version` 2 or 4 holding `entries`, as git writes one for SHA-1 or SHA-256. */
function gitIndex(
  version: 2 | 4,
  entries: ReadonlyArray<{ path: string; mode: number }>,
  hashLength = 20,
): Buffer {
  const header = Buffer.alloc(12);
  header.write('DIRC', 0, 'latin1');
  header.writeUInt32BE(version, 4);
  header.writeUInt32BE(entries.length, 8);
  const parts: Buffer[] = [header];
  let previous = '';
  for (const entry of entries) {
    const fixed = Buffer.alloc(40 + hashLength + 2);
    fixed.writeUInt32BE(entry.mode, 24);
    fixed.writeUInt16BE(Math.min(entry.path.length, 0xfff), 40 + hashLength);
    if (version === 4) {
      let shared = 0;
      while (shared < previous.length && previous[shared] === entry.path[shared]) shared += 1;
      const strip = previous.length - shared;
      if (strip > 127) throw new Error('fixture paths differ too much for a one-byte varint');
      parts.push(fixed, Buffer.from([strip]), Buffer.from(`${entry.path.slice(shared)}\0`));
    } else {
      const length = fixed.length + entry.path.length;
      const padded = (length + 8) & ~7;
      parts.push(fixed, Buffer.from(entry.path), Buffer.alloc(padded - length));
    }
    previous = entry.path;
  }
  return Buffer.concat(parts);
}

describe('submodules named by the git index', () => {
  const FILE = 0o100644;
  const GITLINK = 0o160000;
  const entries = [
    { path: 'README.md', mode: FILE },
    { path: 'deps/lib', mode: GITLINK },
    { path: 'deps/lib-docs/index.md', mode: FILE },
    { path: 'vendor/tool', mode: GITLINK },
  ];
  let parent: string;

  beforeAll(async () => {
    parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-gitlinks-')));
  });

  afterAll(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it.each([
    ['version 2', gitIndex(2, entries), 20],
    ['version 4, whose paths are prefix-compressed', gitIndex(4, entries), 20],
    ['SHA-256 object names', gitIndex(2, entries, 32), 32],
  ])('reads the gitlinks of an index of %s', (_label, data, hashLength) => {
    expect(indexGitlinks(data, hashLength)).toEqual(['deps/lib', 'vendor/tool']);
  });

  it('stops at whatever it cannot read, keeping what came before', () => {
    const whole = gitIndex(2, entries);

    expect(indexGitlinks(Buffer.from('not an index'), 20)).toEqual([]);
    expect(indexGitlinks(whole.subarray(0, 8), 20)).toEqual([]);
    expect(indexGitlinks(whole.subarray(0, whole.length - 40), 20)).toEqual(['deps/lib']);
    expect(indexGitlinks(gitIndex(2, entries, 32), 20)).not.toEqual(['deps/lib', 'vendor/tool']);
    expect(
      indexGitlinks(
        gitIndex(2, [
          { path: 'a'.repeat(5_000), mode: FILE },
          { path: 'late', mode: GITLINK },
        ]),
        20,
      ),
    ).toEqual([]);
  });

  // Run one empties `.gitmodules`, which is the project's own file. Run two
  // must still be refused the submodule's `.git`, or it points it at a git
  // directory of its own whose config runs a program on the host's next git.
  // A repository can ship `.gitmodules` as a link to the null device. The
  // link is named; the device is not, or nothing run there could write to it.
  it('keeps the submodule map read-only, and never denies a device it links to', async () => {
    const repo = path.join(parent, 'mapped');
    await fs.mkdir(repo);
    await fs.symlink('/dev/null', path.join(repo, '.gitmodules'));

    expect(await writeDenialSpellings(path.join(repo, '.gitmodules'))).toEqual([
      path.join(repo, '.gitmodules'),
    ]);
    const denied = await sandboxProtectedPaths({
      project: repo,
      writableRoots: [repo],
      gitConfigPaths: [],
      hostPaths: [],
    });
    expect(denied.slice(0, 2)).toEqual([path.join(repo, '.git'), path.join(repo, '.gitmodules')]);
    expect(denied.some((entry) => entry.startsWith('/dev'))).toBe(false);
  });

  it('keeps a submodule protected after a command has emptied .gitmodules', async () => {
    const repo = path.join(parent, 'emptied');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.writeFile(path.join(repo, '.git', 'index'), gitIndex(2, entries));
    await fs.writeFile(path.join(repo, '.gitmodules'), '[submodule "lib"]\n\tpath = deps/lib\n');
    const named = await gitMetadataPaths(repo);

    await fs.writeFile(path.join(repo, '.gitmodules'), '');

    expect(await gitMetadataPaths(repo)).toEqual(named);
    expect(named).toEqual([
      path.join(repo, '.git'),
      path.join(repo, 'deps', 'lib', '.git'),
      path.join(repo, 'vendor', 'tool', '.git'),
    ]);
    const protectedPaths = await sandboxProtectedPaths({
      project: repo,
      writableRoots: [repo],
      gitConfigPaths: [],
      hostPaths: [],
    });
    expect(protectedPaths).toContain(path.join(repo, 'deps', 'lib', '.git'));
  });

  it('pins each folder that holds a git entry of its own, and every folder above it below the root', async () => {
    const repo = path.join(parent, 'pinned');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.writeFile(
      path.join(repo, '.git', 'index'),
      gitIndex(2, [
        { path: 'libs/sm', mode: GITLINK },
        { path: 'vendor/deep/tool', mode: GITLINK },
      ]),
    );

    expect(await nestedCheckoutPins([repo])).toEqual([
      path.join(repo, 'libs'),
      path.join(repo, 'libs', 'sm'),
      path.join(repo, 'vendor'),
      path.join(repo, 'vendor', 'deep'),
      path.join(repo, 'vendor', 'deep', 'tool'),
    ]);
    expect(await nestedCheckoutPins([path.join(parent, 'emptied')])).not.toContain(
      path.join(parent, 'emptied'),
    );
    const profile = seatbeltProfile({
      ...base,
      writableRoots: [repo],
      pinnedFolders: await nestedCheckoutPins([repo]),
      protectedPaths: [path.join(repo, 'libs', 'sm', '.git')],
    }).split('\n');
    expect(profile).toContain(
      `(deny file-write-create file-write-unlink (literal "${path.join(repo, 'libs', 'sm')}"))`,
    );
    expect(
      profile.indexOf(
        `(deny file-write-create file-write-unlink (literal "${path.join(repo, 'libs')}"))`,
      ),
    ).toBeGreaterThan(profile.findLastIndex((line) => line.startsWith('(allow file-write')));
  });

  it('reads a split index and a SHA-256 repository, and leaves out a gitlink that would leave the folder', async () => {
    const repo = path.join(parent, 'split');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.writeFile(
      path.join(repo, '.git', 'config'),
      '[extensions]\n\tobjectFormat = sha256\n',
    );
    await fs.writeFile(
      path.join(repo, '.git', 'index'),
      gitIndex(2, [{ path: 'direct', mode: GITLINK }], 32),
    );
    await fs.writeFile(
      path.join(repo, '.git', 'sharedindex.0123'),
      gitIndex(
        2,
        [
          { path: '../outside', mode: GITLINK },
          { path: 'shared/sub', mode: GITLINK },
        ],
        32,
      ),
    );

    expect(await gitMetadataPaths(repo)).toEqual([
      path.join(repo, '.git'),
      path.join(repo, 'direct', '.git'),
      path.join(repo, 'shared', 'sub', '.git'),
    ]);
  });

  // The crafted indexes above share this file's reading of the format. This
  // one is written by git itself, in both versions it writes.
  it.runIf(existsSync('/usr/bin/git'))(
    'reads the gitlinks of an index git wrote, in version 2 and in version 4',
    async () => {
      const repo = path.join(parent, 'real');
      await fs.mkdir(repo);
      const git = (...args: string[]) =>
        execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
      const commit = 'a'.repeat(40);
      git('init', '-q');
      await fs.writeFile(path.join(repo, 'README.md'), 'x');
      await fs.mkdir(path.join(repo, 'src', 'deep'), { recursive: true });
      await fs.writeFile(path.join(repo, 'src', 'deep', 'a.ts'), 'x');
      git('add', 'README.md', 'src/deep/a.ts');
      git('update-index', '--add', '--cacheinfo', `160000,${commit},deps/lib`);
      git('update-index', '--add', '--cacheinfo', `160000,${commit},src/deep/vendored`);
      const expected = [
        path.join(repo, '.git'),
        path.join(repo, 'deps', 'lib', '.git'),
        path.join(repo, 'src', 'deep', 'vendored', '.git'),
      ];

      for (const version of ['2', '4']) {
        git('update-index', '--index-version', version);
        const index = await fs.readFile(path.join(repo, '.git', 'index'));
        expect(index.readUInt32BE(4), version).toBe(Number(version));
        expect(indexGitlinks(index, 20), version).toEqual(['deps/lib', 'src/deep/vendored']);
        expect(await gitMetadataPaths(repo), version).toEqual(expected);
      }
    },
  );

  it('does not read an index that is a link, which a real one never is', async () => {
    const repo = path.join(parent, 'linked-index');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.writeFile(path.join(parent, 'elsewhere.index'), gitIndex(2, entries));
    await fs.symlink(path.join(parent, 'elsewhere.index'), path.join(repo, '.git', 'index'));

    expect(await gitMetadataPaths(repo)).toEqual([path.join(repo, '.git')]);
  });
});

describe('where a write lands', () => {
  let scratch: string;
  let cases = 0;

  beforeAll(async () => {
    scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-landing-')));
  });

  afterAll(async () => {
    await fs.rm(scratch, { recursive: true, force: true });
  });

  async function folder(): Promise<string> {
    cases += 1;
    const made = path.join(scratch, `case-${cases}`);
    await fs.mkdir(made);
    return made;
  }

  it('is the canonical path of one that exists, with its dots applied', async () => {
    const root = await folder();
    await fs.mkdir(path.join(root, 'real'));
    await fs.symlink(path.join(root, 'real'), path.join(root, 'alias'));

    expect(await landingPath(path.join(root, 'alias'))).toBe(path.join(root, 'real'));
    expect(await landingPath(`${root}/alias/../real/./new.txt`)).toBe(
      path.join(root, 'real', 'new.txt'),
    );
  });

  it('is the missing target of a link that points nowhere yet, at the end or in the middle', async () => {
    const root = await folder();
    await fs.mkdir(path.join(root, '.git'));
    await fs.symlink('.git/hooks/pre-commit', path.join(root, 'notes.txt'));
    await fs.symlink(path.join(root, '.git', 'hooks'), path.join(root, 'scripts'));

    expect(await landingPath(path.join(root, 'notes.txt'))).toBe(
      path.join(root, '.git', 'hooks', 'pre-commit'),
    );
    expect(await landingPath(`${root}/scripts/sub/../pre-commit`)).toBe(
      path.join(root, '.git', 'hooks', 'pre-commit'),
    );
  });

  it('follows a chain of such links to its end, and gives up on a loop', async () => {
    const root = await folder();
    await fs.symlink('second', path.join(root, 'first'));
    await fs.symlink('third/file', path.join(root, 'second'));
    await fs.symlink('b', path.join(root, 'a'));
    await fs.symlink('a', path.join(root, 'b'));

    expect(await landingPath(path.join(root, 'first'))).toBe(path.join(root, 'third', 'file'));
    expect(await landingPath(path.join(root, 'a'))).toBeNull();
    expect(await landingPath(path.join(root, 'a', 'inner.txt'))).toBeNull();
  });

  it('keeps the name of a missing path below the folder that exists', async () => {
    const root = await folder();

    expect(await landingPath(`${root}/new/deeper/../file.txt`)).toBe(
      path.join(root, 'new', 'file.txt'),
    );
  });

  // The Rust test of the same name: seatbelt_protection_rules over a link to
  // a file, a link to nothing, and a plain missing path.
  it('names a protected path that is a link as the link and as its target', async () => {
    const root = await folder();
    await fs.writeFile(path.join(root, 'servers.json'), '{}');
    await fs.symlink('servers.json', path.join(root, '.mcp.json'));
    await fs.symlink('later.json', path.join(root, 'mcp.json'));

    expect(await writeDenialSpellings(path.join(root, '.mcp.json'))).toEqual([
      path.join(root, '.mcp.json'),
      path.join(root, 'servers.json'),
    ]);
    expect(await writeDenialSpellings(path.join(root, 'mcp.json'))).toEqual([
      path.join(root, 'mcp.json'),
      path.join(root, 'later.json'),
    ]);
    expect(await writeDenialSpellings(path.join(root, '.agiworkforce'))).toEqual([
      path.join(root, '.agiworkforce'),
    ]);
    expect(
      await sandboxProtectedPaths({
        project: root,
        writableRoots: [root],
        gitConfigPaths: [],
        hostPaths: [],
      }),
    ).toEqual([
      path.join(root, '.git'),
      path.join(root, '.gitmodules'),
      path.join(root, '.agiworkforce'),
      path.join(root, '.mcp.json'),
      path.join(root, 'servers.json'),
      path.join(root, 'mcp.json'),
      path.join(root, 'later.json'),
      path.join(root, '.vscode', 'mcp.json'),
    ]);
  });
});

describe('what a command may read for the tools on the PATH', () => {
  const home = '/Users/someone';
  const homes = [home];

  it.each([
    ['/opt/homebrew/bin', ['/opt/homebrew']],
    ['/opt/homebrew/sbin', ['/opt/homebrew']],
    ['/usr/local/bin', ['/usr/local']],
    ['/usr/bin', ['/usr/bin']],
    ['/bin', ['/bin']],
    ['/Applications/Tool.app/Contents/MacOS', ['/Applications/Tool.app/Contents/MacOS']],
  ])('reads %s, outside the home folder, as %j', (entry, roots) => {
    expect(toolchainRoots(entry, homes)).toEqual(roots);
  });

  // Inside the home folder the folder above a `bin` is shared with whatever
  // else is kept there: `~/.local` holds every program's saved data and
  // sign-ins, `~/Library` every app's. Only the code beside the `bin` is read.
  it.each([
    '.local',
    '.config',
    '.cache',
    '.npm',
    '.pnpm',
    '.yarn',
    '.bun',
    '.deno',
    '.nvm',
    '.volta',
    '.asdf',
    '.pyenv',
    '.rbenv',
    '.cargo',
    'go',
    '.nvm/versions/node/v22.1.0',
    '.local/share/opencode',
    'Library/Application Support/Herd',
  ])('never reads ~/%s for a bin kept in it, only the bin and the code beside it', (tool) => {
    const prefix = `${home}/${tool}`;

    expect(toolchainRoots(`${prefix}/bin`, homes)).toEqual([
      `${prefix}/bin`,
      `${prefix}/lib`,
      `${prefix}/libexec`,
    ]);
    expect(toolchainRoots(`${prefix}/bin`, homes)).not.toContain(prefix);
  });

  it.each([
    ['/Users/someone/Library/pnpm', ['/Users/someone/Library/pnpm']],
    ['/Users/someone/bin', ['/Users/someone/bin']],
    ['/Users/someone/.pyenv/shims', ['/Users/someone/.pyenv/shims']],
    ['/Users/someone/Documents/tools', ['/Users/someone/Documents/tools']],
  ])('reads %s as itself and nothing beside it that would open a wide folder', (entry, roots) => {
    expect(toolchainRoots(entry, homes)).toEqual(roots);
  });

  it.each([
    '/',
    '/Users',
    '/Users/someone',
    '/Users/someone/Library',
    '/Users/someone/Documents',
    '/Users/someone/Desktop',
    '/Users/someone/Downloads',
  ])('never reads %s, whatever the PATH says', (entry) => {
    expect(toolchainRoots(entry, homes)).toEqual([]);
  });

  it('opens no folder that holds the home folder, its Library or its documents, for a real PATH', async () => {
    const fakeHome = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-path-home-')));
    try {
      const entries = [
        'Library/pnpm',
        '.cargo/bin',
        '.local/bin',
        'bin',
        'Documents',
        'Library',
      ].map((entry) => path.join(fakeHome, entry));
      for (const entry of entries) await fs.mkdir(entry, { recursive: true });
      await fs.mkdir(path.join(fakeHome, '.local', 'lib'));
      await fs.mkdir(path.join(fakeHome, '.local', 'share', 'opencode'), { recursive: true });
      await fs.symlink(
        path.join(fakeHome, '.local', 'share'),
        path.join(fakeHome, '.cargo', 'lib'),
      );

      const roots = await seatbeltToolchainRoots(
        [...entries, fakeHome, path.dirname(fakeHome)].join(path.delimiter),
        path.join(fakeHome, 'Library', 'pnpm', 'pnpm'),
        fakeHome,
      );

      expect(roots.filter((root) => root.startsWith(fakeHome)).sort()).toEqual(
        [
          path.join(fakeHome, '.cargo', 'bin'),
          path.join(fakeHome, '.local', 'bin'),
          path.join(fakeHome, '.local', 'lib'),
          path.join(fakeHome, 'Library', 'pnpm'),
          path.join(fakeHome, 'bin'),
        ].sort(),
      );
      const profile = seatbeltProfile({ ...base, readableRoots: roots });
      for (const closed of ['', 'Library', '.local', '.cargo', path.join('.local', 'share')]) {
        expect(profile, closed).not.toContain(`(subpath "${path.join(fakeHome, closed)}")`);
      }

      if (process.platform !== 'darwin' || !existsSync(SEATBELT_EXECUTABLE)) return;
      const library = path.join(fakeHome, '.local', 'lib', 'module.js');
      const saved = path.join(fakeHome, '.local', 'share', 'opencode', 'auth.json');
      await fs.writeFile(library, 'library\n');
      await fs.writeFile(saved, 'token\n');
      const read = (file: string) => {
        try {
          return execFileSync(SEATBELT_EXECUTABLE, ['-p', profile, '/bin/cat', file], {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        } catch (error) {
          return `refused: ${String((error as { stderr?: string }).stderr)}`;
        }
      };
      expect(read(library)).toBe('library\n');
      expect(read(saved)).toMatch(/^refused: .*Operation not permitted/su);
      expect(read(path.join(fakeHome, '.cargo', 'lib', 'opencode', 'auth.json'))).toMatch(
        /^refused: .*Operation not permitted/su,
      );
    } finally {
      await fs.rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('hides the host own folders with the credential locations, each where a read lands', async () => {
    const fakeHome = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-host-home-')));
    try {
      const userData = path.join(fakeHome, 'Library', 'Application Support', 'AGI Cloud');
      await fs.mkdir(path.join(fakeHome, 'real-data'), { recursive: true });
      await fs.mkdir(path.dirname(userData), { recursive: true });
      await fs.symlink(path.join(fakeHome, 'real-data'), userData);

      const unreadable = await sandboxUnreadablePaths({
        home: fakeHome,
        hostPaths: [...hostConfigPaths(fakeHome, {}), userData],
      });

      expect(unreadable.slice(0, HOME_CREDENTIAL_PATHS.length)).toEqual(
        await credentialReadPaths(fakeHome),
      );
      expect(unreadable.slice(HOME_CREDENTIAL_PATHS.length)).toEqual([
        path.join(fakeHome, '.agiworkforce'),
        path.join(fakeHome, '.agiworkforce', 'git'),
        path.join(fakeHome, '.agiworkforce', 'git-state'),
        path.join(fakeHome, 'real-data'),
      ]);
    } finally {
      await fs.rm(fakeHome, { recursive: true, force: true });
    }
  });
});

describe('the developer directory a run is told', () => {
  it('is none when the run already names one, and otherwise a folder that exists', async () => {
    expect(await hostDeveloperDir({ DEVELOPER_DIR: '/somewhere' })).toBeNull();

    const found = await hostDeveloperDir({});
    if (found !== null) {
      expect(path.isAbsolute(found)).toBe(true);
      expect((await fs.stat(found)).isDirectory()).toBe(true);
    }
  });
});

describe('credential locations', () => {
  it('are the listed places under the home folder, each where a read of it lands', async () => {
    const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-cred-home-')));
    try {
      await fs.mkdir(path.join(home, 'dotfiles', 'ssh'), { recursive: true });
      await fs.symlink(path.join(home, 'dotfiles', 'ssh'), path.join(home, '.ssh'));

      const paths = await credentialReadPaths(home);

      expect(paths).toHaveLength(HOME_CREDENTIAL_PATHS.length);
      expect(paths[0]).toBe(path.join(home, 'dotfiles', 'ssh'));
      expect(paths).toContain(path.join(home, '.cargo', 'credentials.toml'));
      expect(paths).toContain(path.join(home, 'Library', 'Keychains'));
      expect(paths).toContain(path.join(home, '.claude', '.credentials.json'));
      expect(paths).not.toContain(path.join(home, '.claude'));
      expect(paths).not.toContain(path.join(home, '.codex'));
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it('adds the copies and databases whose names change from one version to the next', async () => {
    const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-cred-copies-')));
    try {
      await fs.mkdir(path.join(home, '.codex'));
      for (const file of [
        '.claude.json',
        '.claude.json.backup',
        '.claude.json.2026-10-01',
        '.claude.jsonl',
        '.codex/state_5.sqlite',
        '.codex/logs_1.sqlite-wal',
        '.codex/config.toml',
        '.codex/notes.txt',
      ]) {
        await fs.writeFile(path.join(home, file), '');
      }

      const paths = await credentialReadPaths(home);

      expect(paths.slice(HOME_CREDENTIAL_PATHS.length)).toEqual([
        path.join(home, '.claude.json.2026-10-01'),
        path.join(home, '.claude.json.backup'),
        path.join(home, '.codex', 'logs_1.sqlite-wal'),
        path.join(home, '.codex', 'state_5.sqlite'),
      ]);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});

describe('sandbox detection', () => {
  let bin: string;

  beforeAll(async () => {
    bin = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-bwrap-'));
    await fs.writeFile(path.join(bin, 'bwrap'), '#!/bin/sh\n', { mode: 0o755 });
  });

  afterAll(async () => {
    await fs.rm(bin, { recursive: true, force: true });
  });

  it('has no sandbox on Windows', async () => {
    expect(await detectShellSandbox('win32', bin)).toEqual({ backend: 'none' });
  });

  it('uses bubblewrap on Linux when it is on PATH', async () => {
    expect(await detectShellSandbox('linux', bin)).toEqual({
      backend: 'bubblewrap',
      executable: path.join(bin, 'bwrap'),
    });
  });

  it('has no sandbox on Linux without bubblewrap', async () => {
    expect(await detectShellSandbox('linux', '')).toEqual({ backend: 'none' });
  });

  it('uses seatbelt on macOS when sandbox-exec exists', async () => {
    expect(await detectShellSandbox('darwin', '')).toEqual(
      existsSync(SEATBELT_EXECUTABLE) ? seatbelt : { backend: 'none' },
    );
  });
});

describe('parity with the CLI seatbelt profile', () => {
  const policySource = readFileSync(
    path.resolve(__dirname, '../../../../crates/agiworkforce-sandbox-policy/src/wrap.rs'),
    'utf8',
  );
  const between = (from: string, to: string) => {
    const start = policySource.indexOf(from);
    const end = policySource.indexOf(to, start);
    return start === -1 || end === -1 ? '' : policySource.slice(start, end);
  };
  const cliProfile = between('pub fn seatbelt_profile(', 'pub fn bubblewrap_prefix(');
  const cliAllowNetwork = between('NetworkPolicy::AllowExternal => concat!(', '),');
  const rustStrings = (block: string) => [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const cliMachServices = rustStrings(between('const MACH_SERVICES:', '];'));
  const cliNetworkMachServices = rustStrings(between('const NETWORK_MACH_SERVICES:', '];'));

  it('reads the CLI profile builder, its network rules and its mach-lookup allowlist', () => {
    expect(cliProfile).toContain('(deny default)');
    expect(cliProfile).toContain('mach_rules = mach_lookup_rule(spec.network_policy)');
    expect(cliAllowNetwork).not.toBe('');
    expect(cliMachServices.length).toBeGreaterThan(0);
    expect(cliNetworkMachServices.length).toBeGreaterThan(0);
  });

  it('grants the same process rules', () => {
    const cliRules = cliProfile
      .split('\n')
      .map((line) => line.trim().replace(/^(\{\w+\})+/, ''))
      .filter((line) => /^\(allow (process|signal|sysctl|mach|system-socket)/.test(line));
    expect(cliRules).toEqual([...SEATBELT_PROCESS_RULES]);
  });

  it('reaches only the same mach services, and never an unfiltered mach-lookup', () => {
    expect(cliMachServices).toEqual([...SEATBELT_MACH_SERVICES]);
    expect(cliNetworkMachServices).toEqual([...SEATBELT_NETWORK_MACH_SERVICES]);
    expect(between('fn mach_lookup_rule(', '\n}\n')).toContain('(allow mach-lookup{names})');
    expect(cliProfile).not.toContain('(allow mach-lookup)');
    for (const network of ['deny', 'allow'] as const) {
      const profile = seatbeltProfile({ ...base, network });
      expect(profile).not.toContain('(allow mach-lookup)');
      const granted = [...profile.matchAll(/\(global-name "([^"]+)"\)/g)].map((match) => match[1]);
      expect(granted).toEqual(
        network === 'allow'
          ? [...SEATBELT_MACH_SERVICES, ...SEATBELT_NETWORK_MACH_SERVICES]
          : [...SEATBELT_MACH_SERVICES],
      );
    }
  });

  // The arm the CLI's own commands run under, which keeps this computer's
  // ports and sockets closed. The unrestricted arm is the one not to match.
  it('opens the network with the rules of the external-only arm, rule for rule', () => {
    const external = [...cliAllowNetwork.matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((match) =>
      (match[1] ?? '').replace(/\\(.)/gsu, (_, escaped: string) =>
        escaped === 'n' ? '' : escaped,
      ),
    );

    expect(external).toEqual([...SEATBELT_NETWORK_RULES]);
    expect(external).toHaveLength(5);
    expect(between('NetworkPolicy::Allow =>', 'NetworkPolicy::AllowExternal =>')).not.toContain(
      'deny',
    );
    const profile = seatbeltProfile({ ...base, network: 'allow' }).split('\n');
    const first = profile.indexOf(SEATBELT_NETWORK_RULES[0] as string);
    expect(profile.slice(first, first + 5)).toEqual([...SEATBELT_NETWORK_RULES]);
  });

  it("keeps the same protected paths as the crate's one list, entry for entry", () => {
    const protectedSource = readFileSync(
      path.resolve(
        __dirname,
        '../../../../crates/agiworkforce-sandbox-policy/src/protected_paths.rs',
      ),
      'utf8',
    );
    const listed = (name: string) => {
      const start = protectedSource.indexOf(`pub const ${name}:`);
      const end = protectedSource.indexOf('];', start);
      return start === -1 || end === -1
        ? []
        : rustStrings(protectedSource.slice(protectedSource.indexOf('=', start), end));
    };

    expect(between('pub fn project_config_paths(', '.iter()')).toContain(
      'crate::protected_paths::PROJECT_CONFIG_PATHS',
    );
    expect(listed('PROJECT_CONFIG_PATHS')).toEqual([...PROJECT_CONFIG_PATHS]);
    expect(listed('HOOK_MANAGER_PATHS')).toEqual([...HOOK_MANAGER_PATHS]);
    const gitEntry = protectedSource.indexOf('pub const GIT_METADATA_ENTRY');
    expect(
      rustStrings(protectedSource.slice(gitEntry, protectedSource.indexOf(';', gitEntry))),
    ).toEqual([GIT_METADATA_ENTRY]);
    expect(protectedSource).toContain(
      'std::iter::once(GIT_METADATA_ENTRY)\n        .chain(PROJECT_CONFIG_PATHS)\n        .chain(HOOK_MANAGER_PATHS)',
    );
    expect([...PROTECTED_WORKSPACE_PATHS]).toEqual([
      ...rustStrings(protectedSource.slice(gitEntry, protectedSource.indexOf(';', gitEntry))),
      ...listed('PROJECT_CONFIG_PATHS'),
      ...listed('HOOK_MANAGER_PATHS'),
    ]);
  });

  const crateSource = (file: string) =>
    readFileSync(
      path.resolve(__dirname, '../../../../crates/agiworkforce-sandbox-policy/src', file),
      'utf8',
    );
  const rustList = (source: string, declaration: string) => {
    const start = source.indexOf(declaration);
    const end = source.indexOf('];', start);
    return start === -1 || end === -1
      ? []
      : rustStrings(source.slice(source.indexOf('=', start), end));
  };
  /** A Rust string literal as the text it stands for. */
  const rustText = (literal: string) =>
    literal.replace(/\\(.)/gsu, (_, escaped: string) => (escaped === 'n' ? '\n' : escaped));
  const RUST_STRING = '"((?:[^"\\\\]|\\\\.)*)"';
  const rustFunction = (name: string) => between(`fn ${name}(`, '\n}\n');

  it('keeps the same dependency trees and credential locations as the crate, entry for entry', () => {
    expect(rustList(crateSource('protected_paths.rs'), 'pub const DEPENDENCY_TREE_NAMES:')).toEqual(
      [...DEPENDENCY_TREE_NAMES],
    );
    expect(DEPENDENCY_TREE_NAMES).toHaveLength(14);
    const fullRead = crateSource('full_read.rs');
    expect(rustList(fullRead, 'const CREDENTIAL_PATHS:')).toEqual([...HOME_CREDENTIAL_PATHS]);
    expect(HOME_CREDENTIAL_PATHS).toHaveLength(111);
    expect(fullRead).toContain(
      'CREDENTIAL_PATHS\n        .iter()\n        .map(|path| home.join(path))\n        .chain(credential_copies(home))',
    );
    const copies = fullRead.slice(
      fullRead.indexOf('fn credential_copies('),
      fullRead.indexOf('fn seatbelt_read_denials('),
    );
    expect(copies).toContain('name.strip_prefix(".claude.json")');
    expect(copies).toContain(".is_some_and(|rest| rest.starts_with('.'))");
    expect(copies).toContain('listed(home.join(".codex"), |name| name.contains(".sqlite"))');
    expect(copies).toContain('found.sort();');
  });

  it('names the same entries by rule as the crate does, in its order, and leaves git to its path', () => {
    expect(crateSource('protected_paths.rs')).toContain(
      'PROJECT_CONFIG_PATHS.into_iter().chain(HOOK_MANAGER_PATHS)',
    );
    expect([...NAMED_PROJECT_ENTRIES]).toEqual([...PROJECT_CONFIG_PATHS, ...HOOK_MANAGER_PATHS]);
    expect(NAMED_PROJECT_ENTRIES).not.toContain(GIT_METADATA_ENTRY);
  });

  it('writes a name as a regex, and a regex as a string, by the cases the crate own tests pin', () => {
    const literals = [
      ...policySource.matchAll(
        new RegExp(
          `seatbelt_regex_literal\\(${RUST_STRING}, (true|false)\\),\\s*${RUST_STRING}`,
          'gu',
        ),
      ),
    ];
    expect(literals).toHaveLength(3);
    for (const [, text, anyCase, expected] of literals) {
      expect(seatbeltRegexLiteral(rustText(text ?? ''), anyCase === 'true'), text).toBe(
        rustText(expected ?? ''),
      );
    }

    const filters = [
      ...policySource.matchAll(
        new RegExp(`seatbelt_regex\\(${RUST_STRING}\\),?\\s*${RUST_STRING}`, 'gu'),
      ),
    ];
    expect(filters).toHaveLength(2);
    for (const [, pattern, expected] of filters) {
      expect(seatbeltRegex(rustText(pattern ?? '')), pattern).toBe(rustText(expected ?? ''));
    }
    expect(rustText(rustFunction('seatbelt_regex'))).toContain(
      '"(regex "{}")", seatbelt_string(pattern)',
    );
  });

  const rustTest = (name: string) => between(`fn ${name}(`, '\n    }\n');
  const TREE_GROUP = `(${DEPENDENCY_TREE_NAMES.map((name) => seatbeltRegexLiteral(name, false)).join('|')})`;
  const NAMED = [...NAMED_PROJECT_ENTRIES, ...INSTRUCTION_FOLDERS_OUTSIDE_PROTECTED_ENTRIES];
  /** Each named entry as the crate rules it: in any case, with whatever lies below it. */
  const ruledName = (entry: string) =>
    `${entry
      .split('/')
      .map((segment) => seatbeltRegexLiteral(segment, true))
      .join('/')}(/.*)?`;
  /** The three heads a crate test looks an entry up after, in the order the layers come. */
  const layerHeads = (root: string, operations: string): [string, string, string] => [
    `(deny ${operations} (regex "^${root}/(.*/)?`,
    `(allow ${operations} (regex "^${root}/(.*/)?${TREE_GROUP}/(.*/)?`,
    `(deny ${operations} (regex "^${root}/`,
  ];

  it('names the instruction folders and the shared folders the crate does', () => {
    const protectedSource = crateSource('protected_paths.rs');
    expect(rustList(protectedSource, 'pub const AGENT_INSTRUCTION_PATHS:')).toEqual([
      ...AGENT_INSTRUCTION_PATHS,
    ]);
    expect(rustList(protectedSource, 'pub(crate) const SHARED_PARENT_FOLDERS:')).toEqual([
      ...SHARED_PARENT_FOLDERS,
    ]);
    expect(protectedSource).toContain(
      "!named_project_entries().any(|entry| {\n            folder\n                .strip_prefix(entry)\n                .is_some_and(|rest| rest.starts_with('/'))",
    );
    expect(INSTRUCTION_FOLDERS_OUTSIDE_PROTECTED_ENTRIES).toEqual(['.claude/commands']);
    expect(rustFunction('has_a_shared_parent')).toContain(
      "entry.contains('/')\n        && crate::protected_paths::SHARED_PARENT_FOLDERS.contains(&first_segment(entry))",
    );
  });

  it('writes the entry rules from the crate templates, layer by layer in its order', () => {
    const builder = rustFunction('seatbelt_project_entry_rules');
    const befores = Object.fromEntries(
      [...builder.matchAll(new RegExp(`let (\\w+) = format!\\(${RUST_STRING}\\);`, 'gu'))].map(
        (match) => [match[1] ?? '', rustText(match[2] ?? '')],
      ),
    );
    expect(befores).toEqual({
      anywhere: '^{root}/(.*/)?',
      in_a_tree: '^{root}/(.*/)?({trees})/(.*/)?',
      at_the_top: '^{root}/',
    });
    const layers = [
      ...builder.matchAll(
        /\(\s*"(deny|allow)",\s*(\w+)\.as_str\(\),\s*entries\.as_slice\(\),\s*(\w+)\.as_slice\(\),\s*\)/gu,
      ),
    ].map((match) => [match[1] ?? '', match[2] ?? '', match[3] ?? ''] as const);
    expect(layers).toEqual([
      ['deny', 'anywhere', 'parents'],
      ['allow', 'in_a_tree', 'parents'],
      ['deny', 'at_the_top', 'parents_at_the_top'],
    ]);
    for (const step of [
      'const WRITING: &str = "file-write*";',
      'const MAKING_OR_REMOVING: &str = "file-write-create file-write-unlink";',
      'for (operations, names) in [(WRITING, written), (MAKING_OR_REMOVING, held)] {',
      'let filter = seatbelt_regex(&format!("{before}{alternatives}$"));',
      'rules.push_str(&format!("({action} {operations} {filter})\\n"));',
      'let root = seatbelt_regex_literal(root, false);',
      '.map(|name| seatbelt_regex_literal(name, false))',
      '.map(|segment| seatbelt_regex_literal(segment, true))',
      'entries.push(format!("{}(/.*)?", segments.join("/")));',
      'let held = if in_a_shared_parent && kept == 1 {',
      'let parents_at_the_top: Vec<String> = parents\n        .iter()\n        .chain(&parents_at_the_top_only)',
      'crate::protected_paths::named_project_entries()\n        .chain(crate::protected_paths::instruction_folders_outside_protected_entries());',
    ]) {
      expect(builder, step).toContain(step);
    }
    const room = Number(/const SEATBELT_STRING_ROOM: usize = (\d+);/u.exec(policySource)?.[1]);
    expect(room).toBe(900);
    const grouping = rustFunction('alternations');
    for (const step of [
      'let around = seatbelt_string(before).len() + "()$".len();',
      'let room = SEATBELT_STRING_ROOM.saturating_sub(around);',
      'if !group.is_empty() && group.len() + "|".len() + name.len() > room {',
    ]) {
      expect(grouping, step).toContain(step);
    }

    const alternatives = (names: readonly string[], before: string) => {
      const fits = Math.max(0, room - (Buffer.byteLength(before.replace(/[\\"]/gu, '\\$&')) + 3));
      const groups: string[][] = [];
      for (const name of names) {
        const last = groups.at(-1);
        if (last && Buffer.byteLength([...last, name].join('|')) <= fits) last.push(name);
        else groups.push([name]);
      }
      return groups.map((group) => `(${group.join('|')})`);
    };
    const entries = NAMED.map(ruledName);
    const parents: string[] = [];
    const topOnly: string[] = [];
    for (const entry of NAMED) {
      const segments = entry.split('/').map((segment) => seatbeltRegexLiteral(segment, true));
      const shared =
        segments.length > 1 && SHARED_PARENT_FOLDERS.includes(entry.split('/')[0] ?? '');
      for (let kept = 1; kept < segments.length; kept += 1) {
        const held = shared && kept === 1 ? topOnly : parents;
        const parent = segments.slice(0, kept).join('/');
        if (!held.includes(parent)) held.push(parent);
      }
    }
    const held: Record<string, readonly string[]> = {
      parents,
      parents_at_the_top: [...parents, ...topOnly],
    };
    for (const root of [
      '/Users/a.b/work',
      '/Users/someone/a (b) "c" \\d',
      `/x${'/deep'.repeat(60)}`,
    ]) {
      const expected = layers.flatMap(([action, before, heldBy]) => {
        const head = (befores[before] ?? '')
          .replace('{root}', seatbeltRegexLiteral(root, false))
          .replace('{trees}', TREE_GROUP.slice(1, -1));
        return [
          ['file-write*', entries],
          ['file-write-create file-write-unlink', held[heldBy] ?? []],
        ].flatMap(([operations, names]) =>
          alternatives(names as readonly string[], head).map(
            (group) => `(${action} ${operations as string} ${seatbeltRegex(`${head}${group}$`)})`,
          ),
        );
      });
      expect(seatbeltProjectEntryRules(root), root).toEqual(expected);
    }
  });

  it('shares patterns among the entries, each short enough for one string, as the crate does', () => {
    const test = rustTest('the_entry_rules_share_patterns_that_each_fit_in_one_string');
    expect(test).toContain('rules.lines().count() < entries,');
    expect(test).toContain('pattern.len() <= SEATBELT_STRING_ROOM,');
    for (const root of [
      '/w',
      '/Users/someone/a (b) "c" \\d',
      `/Users/someone${'/deep'.repeat(60)}`,
    ]) {
      const rules = seatbeltProjectEntryRules(root);
      expect(rules.length, root).toBeLessThan(NAMED.length);
      for (const rule of rules) {
        const pattern = /\(regex "(.*)"\)\)$/u.exec(rule)?.[1];
        expect(pattern, rule).toBeDefined();
        expect(Buffer.byteLength(pattern ?? ''), rule).toBeLessThanOrEqual(900);
      }
    }
    expect(seatbeltAlternations(['a'.repeat(500), 'b'.repeat(500), 'c'], '^/w/')).toEqual([
      `(${'a'.repeat(500)})`,
      `(${'b'.repeat(500)}|c)`,
    ]);
    expect(seatbeltAlternations([], '^/w/')).toEqual([]);
  });

  it('rules every name the crate own tests name, in the layers and the order they expect', () => {
    const trees = new RegExp(`const TREES: &str = ${RUST_STRING};`, 'u').exec(policySource)?.[1];
    expect(trees).toBe(TREE_GROUP);
    const named = (test: string) =>
      [
        ...rustTest(test).matchAll(
          new RegExp(
            `\\(\\s*"(file-write\\*|file-write-create file-write-unlink)",\\s*${RUST_STRING},?\\s*\\)`,
            'gu',
          ),
        ),
      ].map((match) => [match[1] ?? '', rustText(match[2] ?? '')] as const);

    const below = named(
      'every_named_entry_is_denied_below_the_workspace_at_any_depth_and_in_any_case',
    );
    expect(below.length).toBeGreaterThanOrEqual(9);
    const profile = seatbeltProfile({
      ...base,
      writableRoots: ['/Users/someone/project', '/scratch/agi-shell-scratch-1'],
    }).split('\n');
    const allow = profile.indexOf('(allow file-write* (subpath "/Users/someone/project"))');
    expect(allow).toBeGreaterThanOrEqual(0);
    for (const [operations, name] of below) {
      const [anywhere] = layerHeads('/Users/someone/project', operations);
      expect(entryRule(profile, anywhere, name), name).toBeGreaterThan(allow);
    }
    for (const entry of NAMED) {
      for (const head of layerHeads('/Users/someone/project', 'file-write*')) {
        expect(
          entryRule(profile, head, ruledName(entry)),
          `${entry} after ${head}`,
        ).toBeGreaterThan(allow);
      }
    }

    const layered = named(
      'an_entry_is_denied_everywhere_allowed_in_a_dependency_tree_and_denied_at_the_top',
    );
    expect(layered.length).toBeGreaterThanOrEqual(5);
    const rules = seatbeltProjectEntryRules('/w');
    for (const [operations, name] of layered) {
      const at = layerHeads('/w', operations).map((head) => entryRule(rules, head, name));
      expect(Math.min(...at), name).toBeGreaterThanOrEqual(0);
      expect(at, name).toEqual([...at].sort((left, right) => left - right));
    }
    expect(rules.some((rule) => /[(|]\[[.]\]\[gG\]\[iI\]\[tT\]\(/u.test(rule))).toBe(false);
  });

  it('holds a shared folder in place at the top folder only, as the crate does', () => {
    const test = rustTest('an_entry_in_a_shared_folder_pins_that_folder_at_the_top_only');
    const constant = (name: string) =>
      rustText(new RegExp(`const ${name}: &str = ${RUST_STRING};`, 'u').exec(test)?.[1] ?? '');
    const shared = [constant('CONFIG'), constant('CLAUDE')];
    expect(shared).toEqual(
      SHARED_PARENT_FOLDERS.map((folder) => seatbeltRegexLiteral(folder, true)),
    );
    const rules = seatbeltProjectEntryRules('/w');
    const pin = 'file-write-create file-write-unlink';
    for (const parent of shared) {
      const [anywhere, inATree, atTheTop] = layerHeads('/w', pin);
      expect(entryRule(rules, atTheTop, parent), parent).toBeGreaterThanOrEqual(0);
      expect(entryRule(rules, anywhere, parent), parent).toBe(-1);
      expect(entryRule(rules, inATree, parent), parent).toBe(-1);
    }
    for (const entry of ['.config/lefthook.toml', '.claude/commands', 'lefthook-local.yml']) {
      const at = layerHeads('/w', 'file-write*').map((head) =>
        entryRule(rules, head, ruledName(entry)),
      );
      expect(Math.min(...at), entry).toBeGreaterThanOrEqual(0);
      expect(at, entry).toEqual([...at].sort((left, right) => left - right));
    }
  });

  it('lays the write rules out in the order the crate profile does', () => {
    const steps = [
      'write_rules.push_str(&entry_rules);',
      'write_rules.push_str(&pins);',
      'write_rules.push_str(&seatbelt_git_denials(&named_roots(&roots))?);',
      'write_rules.push_str(&seatbelt_git_config_denials(&git_config));',
      'write_rules.push_str(&seatbelt_protection_rules(spec.protected_paths)?);',
    ];
    const positions = steps.map((step) => cliProfile.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(cliProfile).toContain(
      'if position == WORKSPACE_ROOT {\n                    entry_rules = seatbelt_project_entry_rules(&root.resolved.to_string_lossy());',
    );
    expect(between('pub(crate) const WORKSPACE_ROOT: usize =', ';')).toContain('= 0');
    expect(rustText(rustFunction('seatbelt_root_pin'))).toContain(
      '(deny file-write-unlink (literal "{root}"))',
    );
    expect(rustText(rustFunction('seatbelt_git_denials'))).toContain(
      '(deny file-write* (subpath "{spelling}"))',
    );
    expect(rustText(rustFunction('seatbelt_protection_rules'))).toContain(
      '(deny file-write* (subpath "{spelling}"))',
    );
    expect(rustFunction('seatbelt_git_denials')).toContain('write_denial_spellings(&path)');
    expect(rustFunction('seatbelt_git_denials')).toContain(
      'git_metadata_paths(root)\n            .into_iter()\n            .chain(std::iter::once(submodule_map(root)))',
    );
    expect(policySource).toContain('const SUBMODULE_MAP_FILE: &str = ".gitmodules";');
    expect(policySource).toContain('const DEVICE_FOLDER: &str = "/dev";');
    expect(rustFunction('write_denial_spellings')).toContain(
      'if !spellings.contains(&landing) && !landing.starts_with(DEVICE_FOLDER) {',
    );
    expect(rustFunction('seatbelt_protection_rules')).toContain('write_denial_spellings(path)');

    const lines = seatbeltProfile({
      ...base,
      protectedPaths: ['/work/project/.git', '/home/u/.gitconfig', '/work/project/.mcp.json'],
    })
      .trim()
      .split('\n');
    const at = (line: string) => lines.indexOf(line);
    const order = [
      lines.findLastIndex((line) => line.startsWith('(allow file-write* (subpath ')),
      at(seatbeltProjectEntryRules('/work/project')[0] as string),
      at(seatbeltProjectEntryRules('/work/project').at(-1) as string),
      at('(deny file-write-unlink (literal "/work/project"))'),
      at('(deny file-write* (subpath "/work/project/.git"))'),
      at('(deny file-write* (subpath "/home/u/.gitconfig"))'),
      at('(deny file-write* (subpath "/work/project/.mcp.json"))'),
    ];
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    const atTheTop = seatbeltProjectEntryRules('/work/project').filter(
      (rule) => rule.startsWith('(deny ') && !rule.includes('(regex "^/work/project/(.*/)?'),
    );
    expect(lines.findLastIndex((line) => line.startsWith('(allow file-write'))).toBe(
      (order[2] as number) - atTheTop.length,
    );
  });

  it('pins the folders of nested checkouts with the crate rule, after the root pins and before the git denials', async () => {
    const steps = [
      'pins.push_str(&seatbelt_root_pin(&escaped));',
      'pins.push_str(&seatbelt_checkout_pins(&named_roots(&roots))?);',
      'write_rules.push_str(&pins);',
      'write_rules.push_str(&seatbelt_git_denials(&named_roots(&roots))?);',
    ];
    const positions = steps.map((step) => cliProfile.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    const checkoutPins = rustFunction('seatbelt_checkout_pins');
    expect(rustText(checkoutPins)).toContain(
      '(deny file-write-create file-write-unlink (literal "{spelling}"))',
    );
    expect(checkoutPins).toContain('for spelling in write_denial_spellings(&folder) {');
    expect(checkoutPins).toContain('escape_resolved_seatbelt_path(&folder, &spelling)?');
    expect(rustTest('a_nested_checkout_behind_a_link_is_pinned_under_both_names')).toContain(
      'for folder in ["libs", "libs/sm", "real/sm"] {',
    );
    const folders = rustFunction('nested_checkout_folders');
    expect(folders).toContain('for entry in git_metadata_paths(root)');
    expect(folders).toContain('name == crate::protected_paths::GIT_METADATA_ENTRY');
    expect(folders).toContain(
      '.skip(1)\n                .take_while(|folder| *folder != top && folder.starts_with(&top));',
    );
    expect(folders).toContain('std::collections::BTreeSet::new()');

    const lines = seatbeltProfile({
      ...base,
      pinnedFolders: ['/work/project/libs', '/work/project/libs/sm'],
      protectedPaths: ['/work/project/.git'],
    })
      .trim()
      .split('\n');
    const order = [
      lines.lastIndexOf('(deny file-write-unlink (literal "/scratch/agi-shell-scratch-1"))'),
      lines.indexOf('(deny file-write-create file-write-unlink (literal "/work/project/libs"))'),
      lines.indexOf('(deny file-write-create file-write-unlink (literal "/work/project/libs/sm"))'),
      lines.indexOf('(deny file-write* (subpath "/work/project/.git"))'),
    ];
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));

    const folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pins-')));
    try {
      const spaced = path.join(folder, 'libs ');
      await fs.mkdir(path.join(spaced, 'sm'), { recursive: true });
      await fs.writeFile(path.join(folder, '.gitmodules'), '[submodule "sm"]\n\tpath = libs /sm\n');
      const pins = await nestedCheckoutPins([folder]);
      expect(pins).toEqual([spaced, path.join(spaced, 'sm')]);
      expect(() => seatbeltProfile({ ...base, pinnedFolders: pins })).toThrow(
        /a space at either end/u,
      );
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }

    const linked = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pins-link-')));
    try {
      await fs.mkdir(path.join(linked, '.git'));
      await fs.mkdir(path.join(linked, 'real', 'sm'), { recursive: true });
      await fs.mkdir(path.join(linked, 'libs'));
      await fs.symlink('../real/sm', path.join(linked, 'libs', 'sm'));
      await fs.writeFile(path.join(linked, '.gitmodules'), '[submodule "sm"]\n\tpath = libs/sm\n');
      expect(await nestedCheckoutPins([linked])).toEqual([
        path.join(linked, 'libs'),
        path.join(linked, 'libs', 'sm'),
        path.join(linked, 'real', 'sm'),
      ]);
    } finally {
      await fs.rm(linked, { recursive: true, force: true });
    }
  });

  it('gives a sandboxed program the environment the crate does, with the scratch folder as it resolves', async () => {
    const environment = rustFunction('seatbelt_environment');
    expect(environment).toContain('let scratch = verify_scratch_root(scratch_dir)?;');
    expect(environment).toContain('vec![("TMPDIR", scratch.to_string())]');
    expect(environment).toContain(
      'environment.extend(host_developer_dir().map(|dir| ("DEVELOPER_DIR", dir)));',
    );
    const tools = rustFunction('seatbelt_developer_tool_reads');
    expect(tools).toContain('let mut reads_the_var_link = network_policy != NetworkPolicy::Deny;');
    expect(rustText(tools)).toContain(SEATBELT_VAR_LINK_RULE);

    const real = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-env-')));
    const linked = `${real}-link`;
    await fs.symlink(real, linked);
    try {
      expect(await seatbeltEnvironment(linked, { DEVELOPER_DIR: '/opt/tools' })).toEqual({
        TMPDIR: real,
      });
      const found = await hostDeveloperDir({});
      expect(await seatbeltEnvironment(real, {})).toEqual({
        TMPDIR: real,
        ...(found === null ? {} : { DEVELOPER_DIR: found }),
      });
    } finally {
      await fs.rm(linked, { force: true });
      await fs.rm(real, { recursive: true, force: true });
    }
  });

  it('reads git includes the way the crate does, to its depth and count', () => {
    expect(policySource).toContain('const GIT_INCLUDE_DEPTH: usize = 4;');
    expect(policySource).toContain('const GIT_INCLUDE_LIMIT: usize = 64;');
    const paths = rustFunction('git_include_paths');
    expect(paths).toContain('|section| section == "include" || section == "includeif",');
    expect(paths).toContain('Some(rest) => home.join(rest),\n        None => folder.join(target),');
    const targets = rustFunction('git_include_targets');
    expect(targets).toContain('if resolved != file {');
    expect(targets).toContain('if found.contains(&target) || configs.contains(&target) {');
    expect(targets).toContain('if depth + 1 < GIT_INCLUDE_DEPTH {');
    const user = rustFunction('user_git_config_paths');
    expect(user).toContain('git_include_targets(&[gitconfig.clone(), xdg.join("config")], home)');
    expect(user).toContain('.map_or_else(|| home.join(".config"), Path::to_path_buf)');
    const host = rustFunction('host_user_git_config_paths');
    expect(host).toContain('for name in ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"] {');
    expect(host).toContain('.filter(|path| !path.starts_with("/dev"))');
    expect(rustText(rustFunction('seatbelt_git_config_denials'))).toContain(
      '(deny file-write* (subpath "{path}"))',
    );
  });

  it('hides credential locations with the crate rules, and gives a root back as it does', () => {
    const denials = rustText(
      crateSource('full_read.rs').slice(
        crateSource('full_read.rs').indexOf('fn seatbelt_read_denials('),
        crateSource('full_read.rs').indexOf('fn write_policy('),
      ),
    );
    expect(crateSource('full_read.rs').indexOf('fn write_policy(')).toBeGreaterThan(
      crateSource('full_read.rs').indexOf('fn seatbelt_read_denials('),
    );
    const steps = [
      '(deny file-read* (subpath "{escaped}"))',
      '(allow file-read-metadata (literal "{escaped}"))',
      '(allow file-read* (subpath "{escaped}"))',
    ];
    const positions = steps.map((step) => denials.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(denials).toContain(
      '.skip(1)\n            .take_while(|folder| folder.starts_with(inside))',
    );

    expect(seatbeltReadDenials(['/h/.ssh', '/h/.claude'], ['/h/.claude/a/b', '/h/work'])).toEqual([
      '(deny file-read* (subpath "/h/.ssh"))',
      '(deny file-read* (subpath "/h/.claude"))',
      '(allow file-read-metadata (literal "/h/.claude/a"))',
      '(allow file-read-metadata (literal "/h/.claude"))',
      '(allow file-read* (subpath "/h/.claude/a/b"))',
    ]);
    expect(seatbeltReadDenials(['/h/.claude'], ['/h/.claude'])).toEqual([
      '(deny file-read* (subpath "/h/.claude"))',
      '(allow file-read* (subpath "/h/.claude"))',
    ]);
  });

  it('reads what the tool shims need as the crate does: an Xcode bundle and the folder holding it, and the /var link when no developer directory is named', () => {
    const reads = rustText(rustFunction('seatbelt_developer_tool_reads'));
    expect(reads).toContain(`"${SEATBELT_XCODE_READ_RULE}\n"`);
    expect(reads).toContain(`"${SEATBELT_APPLICATIONS_METADATA_RULE}\n"`);
    expect(reads).toContain(`"${SEATBELT_VAR_LINK_RULE}\n"`);
    expect(reads).toContain(
      'if std::env::var_os("DEVELOPER_DIR").is_none() && host_developer_dir().is_none() {',
    );
    const selection = rustFunction('host_developer_dir');
    expect(selection).toContain('std::fs::read_link("/private/var/db/xcode_select_link")');
    expect(selection).toContain('.filter(|dir| dir.is_absolute() && dir.is_dir())');
    expect(selection).toContain('PathBuf::from("/Library/Developer/CommandLineTools")');
    expect(selection).toContain(
      'if std::env::var_os("DEVELOPER_DIR").is_some() {\n        return None;',
    );

    const named = seatbeltProfile(base).split('\n');
    const unnamed = seatbeltProfile({ ...base, developerDirNamed: false }).split('\n');
    const networked = seatbeltProfile({ ...base, network: 'allow' }).split('\n');
    for (const profile of [named, unnamed, networked]) {
      expect(profile).toContain(SEATBELT_XCODE_READ_RULE);
      expect(profile).toContain(SEATBELT_APPLICATIONS_METADATA_RULE);
    }
    expect(named).not.toContain(SEATBELT_VAR_LINK_RULE);
    expect(unnamed).toContain(SEATBELT_VAR_LINK_RULE);
    // Not in the crate yet: with the network open, the resolver reaches its
    // configuration through the same link, or no host name is found.
    expect(networked).toContain(SEATBELT_VAR_LINK_RULE);
  });

  it('reads the same fixed system paths', () => {
    const cliPaths = new Set(
      [...cliProfile.matchAll(/\(subpath \\?"(\/[^"{\\]*)\\?"\)/g)].map((match) => match[1]),
    );
    expect(cliPaths).toEqual(new Set(SEATBELT_SYSTEM_READ_PATHS));
  });
});

describe.runIf(process.platform === 'darwin' && existsSync(SEATBELT_EXECUTABLE))(
  'a real sandbox-exec run',
  () => {
    let folder: string;
    let peerFolder: string;
    let root: WorkspaceRoot;
    const outside = path.join(os.homedir(), `agi-sandbox-escape-${randomUUID()}.txt`);

    beforeAll(async () => {
      folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-sandboxed-')));
      root = { id: 'r', path: folder, name: 'sandboxed', grantedAtMs: 0, lastOpenedAtMs: 0 };
      peerFolder = await fs.mkdtemp('/private/tmp/agi-other-session-');
      await fs.writeFile(path.join(peerFolder, 'token.txt'), 'other-session-fixture');
      await fs.mkdir(path.join(folder, '.git'));
      await fs.writeFile(path.join(folder, '.git', 'config'), '[core]\n');
    });

    afterAll(async () => {
      await fs.rm(folder, { recursive: true, force: true });
      await fs.rm(peerFolder, { recursive: true, force: true });
      await fs.rm(outside, { force: true });
    });

    function run(script: string) {
      return runShellCommand({
        runId: randomUUID(),
        root,
        relativePath: '',
        command: `node -e "${script}"`,
        policy: { allow: ['node'], deny: [] },
        sandbox: seatbelt,
        network: 'deny',
        approve: vi.fn().mockResolvedValue(false),
        emit: () => undefined,
      });
    }

    it('writes inside the approved folder and its private temp folder', async () => {
      const result = await run(
        "const fs=require('fs'),os=require('os');fs.writeFileSync('inside.txt','ok');fs.writeFileSync(os.tmpdir()+'/t','ok');console.log('done')",
      );
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(await fs.readFile(path.join(folder, 'inside.txt'), 'utf8')).toBe('ok');
    });

    it('changes what is inside the approved folder, but cannot rename or remove the folder or its scratch', async () => {
      const empty = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pinned-')));
      try {
        const result = await runShellCommand({
          runId: randomUUID(),
          root: { ...root, path: empty },
          relativePath: '',
          command: `node -e "const fs=require('fs'),os=require('os'),p=process.cwd(),r=[];const t=(n,f)=>{try{f();r.push(n+' ok')}catch(e){r.push(n+' '+e.code)}};t('mkdir',()=>fs.mkdirSync('d'));t('write',()=>fs.writeFileSync('d/f','x'));t('unlink',()=>fs.unlinkSync('d/f'));t('rmdir-child',()=>fs.rmdirSync('d'));t('rename-root',()=>fs.renameSync(p,os.tmpdir()+'/moved'));t('rmdir-root',()=>fs.rmdirSync(p));t('rename-scratch',()=>fs.renameSync(os.tmpdir(),p+'/s'));t('rmdir-scratch',()=>fs.rmdirSync(os.tmpdir()));console.log(r.join(','))"`,
          policy: { allow: ['node'], deny: [] },
          sandbox: seatbelt,
          network: 'deny',
          approve: vi.fn().mockResolvedValue(false),
          emit: () => undefined,
        });
        expect(result.stderr).toBe('');
        expect(result.stdout.trim().split(',')).toEqual([
          'mkdir ok',
          'write ok',
          'unlink ok',
          'rmdir-child ok',
          'rename-root EPERM',
          'rmdir-root EPERM',
          'rename-scratch EPERM',
          'rmdir-scratch EPERM',
        ]);
        expect((await fs.lstat(empty)).isDirectory()).toBe(true);
        expect(await fs.readdir(empty)).toEqual([]);
      } finally {
        await fs.rm(empty, { recursive: true, force: true });
      }
    });

    it('is refused a write outside the approved folder', async () => {
      const result = await run(`require('fs').writeFileSync('${outside}','escaped')`);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
      expect(existsSync(outside)).toBe(false);
    });

    it('is refused a write to git metadata or MCP config inside the approved folder', async () => {
      const result = await run(
        "const fs=require('fs');for(const f of ['.git/config','.mcp.json']){try{fs.appendFileSync(f,'x');console.log('wrote '+f)}catch(e){console.log(f+' '+e.code)}}",
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.git/config EPERM');
      expect(result.stdout).toContain('.mcp.json EPERM');
      expect(await fs.readFile(path.join(folder, '.git', 'config'), 'utf8')).toBe('[core]\n');
      expect(existsSync(path.join(folder, '.mcp.json'))).toBe(false);
    });

    // Git metadata is named by path in one spelling, which Seatbelt folds on a
    // volume that folds case, the only kind where `.GIT` and `.git` are one
    // folder. The other entries are named by a rule written in every case.
    // This runs the real sandbox so a kernel that stops doing either fails
    // here.
    it('is refused the protected paths spelled in another case, on a volume that folds case', async (context) => {
      if (!existsSync(path.join(folder, '.GIT', 'CONFIG'))) context.skip();
      const result = await run(
        "const fs=require('fs'),r=[];const t=(n,f)=>{try{f();r.push(n+' ok')}catch(e){r.push(n+' '+e.code)}};t('git-existing',()=>fs.appendFileSync('.GIT/Config','x'));t('git-new',()=>fs.writeFileSync('.Git/hooks-probe','x'));t('mcp',()=>fs.writeFileSync('.MCP.JSON','x'));t('mcp-plain',()=>fs.writeFileSync('MCP.Json','x'));t('agi-dir',()=>fs.mkdirSync('.AgiWorkforce'));t('vscode-dir',()=>fs.mkdirSync('.VSCode'));t('vscode-mcp',()=>fs.writeFileSync('.VSCode/MCP.json','x'));t('rename',()=>{fs.writeFileSync('staged.txt','x');fs.renameSync('staged.txt','.Mcp.Json')});t('near-miss',()=>fs.writeFileSync('.MCP.JSONX','x'));console.log(r.join(','))",
      );
      expect(result.stderr).toBe('');
      expect(result.stdout.trim().split(',')).toEqual([
        'git-existing EPERM',
        'git-new EPERM',
        'mcp EPERM',
        'mcp-plain EPERM',
        'agi-dir EPERM',
        'vscode-dir EPERM',
        'vscode-mcp ENOENT',
        'rename EPERM',
        'near-miss ok',
      ]);
      expect(await fs.readFile(path.join(folder, '.git', 'config'), 'utf8')).toBe('[core]\n');
      for (const name of ['.mcp.json', 'mcp.json', '.agiworkforce', '.vscode']) {
        expect(existsSync(path.join(folder, name)), name).toBe(false);
      }
    });

    // Denying the submodule's `.git` alone left its folder free to be moved
    // aside and replaced by one with a `.git` directory of the command's own,
    // whose config the user's next git there would run.
    it('cannot move a submodule folder aside and put another in its place, at any level', async () => {
      const repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-swap-sub-')));
      try {
        await fs.mkdir(path.join(repo, '.git'));
        await fs.mkdir(path.join(repo, 'libs', 'sm'), { recursive: true });
        await fs.writeFile(
          path.join(repo, 'libs', 'sm', '.git'),
          'gitdir: ../../.git/modules/sm\n',
        );
        await fs.writeFile(path.join(repo, '.gitmodules'), '[submodule "sm"]\n\tpath = libs/sm\n');
        await fs.mkdir(path.join(repo, 'staged', '.git'), { recursive: true });
        await fs.writeFile(
          path.join(repo, 'staged', '.git', 'config'),
          '[core]\n\tfsmonitor = evil\n',
        );
        const result = await runShellCommand({
          runId: randomUUID(),
          root: { ...root, path: repo },
          relativePath: '',
          command: `node -e "const fs=require('fs'),r=[];const t=(n,f)=>{try{f();r.push(n+' ok')}catch(e){r.push(n+' '+e.code)}};t('move submodule aside',()=>fs.renameSync('libs/sm','aside'));t('put another in its place',()=>fs.renameSync('staged','libs/sm'));t('remove submodule',()=>fs.rmSync('libs/sm',{recursive:true}));t('move its parent aside',()=>fs.renameSync('libs','libs-aside'));t('write inside it',()=>fs.writeFileSync('libs/sm/file.txt','x'));t('make a folder beside it',()=>fs.mkdirSync('libs/other'));console.log(r.join(','))"`,
          policy: { allow: ['node'], deny: [] },
          sandbox: seatbelt,
          approve: vi.fn().mockResolvedValue(false),
          emit: () => undefined,
        });

        expect(result.stderr).toBe('');
        expect(result.stdout.trim().split(',')).toEqual([
          'move submodule aside EPERM',
          'put another in its place EPERM',
          'remove submodule EPERM',
          'move its parent aside EPERM',
          'write inside it ok',
          'make a folder beside it ok',
        ]);
        expect(await fs.readFile(path.join(repo, 'libs', 'sm', '.git'), 'utf8')).toBe(
          'gitdir: ../../.git/modules/sm\n',
        );
      } finally {
        await fs.rm(repo, { recursive: true, force: true });
      }
    });

    it('is refused a rewrite of a submodule gitfile, and of CLI git state AGIWORKFORCE_HOME moved inside', async () => {
      await fs.mkdir(path.join(folder, 'sub'));
      await fs.writeFile(path.join(folder, 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
      await fs.writeFile(path.join(folder, '.gitmodules'), '[submodule "sub"]\n\tpath = sub\n');
      const cliHome = path.join(folder, 'cli-home');
      await fs.mkdir(path.join(cliHome, 'git-state'), { recursive: true });
      const previous = process.env['AGIWORKFORCE_HOME'];
      process.env['AGIWORKFORCE_HOME'] = cliHome;
      try {
        const result = await run(
          "const fs=require('fs');for(const f of ['sub/.git','cli-home/git-state/lock','sub/ok.txt']){try{fs.writeFileSync(f,'gitdir: ../evil');console.log('wrote '+f)}catch(e){console.log(f+' '+e.code)}}",
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('sub/.git EPERM');
        expect(result.stdout).toContain('cli-home/git-state/lock EPERM');
        expect(result.stdout).toContain('wrote sub/ok.txt');
        expect(await fs.readFile(path.join(folder, 'sub', '.git'), 'utf8')).toBe(
          'gitdir: ../.git/modules/sub\n',
        );
      } finally {
        if (previous === undefined) delete process.env['AGIWORKFORCE_HOME'];
        else process.env['AGIWORKFORCE_HOME'] = previous;
      }
    });

    const gitBinary =
      process.platform === 'darwin'
        ? (() => {
            try {
              return execFileSync('/usr/bin/xcrun', ['--find', 'git'], { encoding: 'utf8' }).trim();
            } catch {
              return '';
            }
          })()
        : '';

    function runGit(at: WorkspaceRoot, args: string) {
      return runShellCommand({
        runId: randomUUID(),
        root: at,
        relativePath: '',
        command: `${gitBinary} ${args}`,
        policy: { allow: ['git'], deny: [] },
        sandbox: seatbelt,
        network: 'deny',
        approve: vi.fn().mockResolvedValue(false),
        emit: () => undefined,
      });
    }

    it.runIf(gitBinary !== '')(
      'runs git status and log in a repository and its linked worktree, and keeps .git/config read-only',
      async () => {
        const repo = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-git-')));
        const tree = `${repo}-tree`;
        const git = (cwd: string, ...args: string[]) =>
          execFileSync(gitBinary, args, { cwd, encoding: 'utf8' });
        try {
          git(repo, 'init', '-q');
          await fs.writeFile(path.join(repo, 'a.txt'), 'a');
          git(repo, 'add', 'a.txt');
          git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'first');
          git(repo, 'worktree', 'add', '-q', tree);
          const before = await fs.readFile(path.join(repo, '.git', 'config'), 'utf8');

          for (const checkout of [repo, tree]) {
            const at = { ...root, path: checkout };
            for (const args of ['status --short', 'log -1 --format=%s']) {
              const result = await runGit(at, args);
              expect({ args, checkout, exitCode: result.exitCode, stderr: result.stderr }).toEqual({
                args,
                checkout,
                exitCode: 0,
                stderr: '',
              });
              if (args.startsWith('log')) expect(result.stdout.trim()).toBe('first');
            }
            const config = await runGit(at, 'config filter.x.clean evil');
            expect(config.exitCode).not.toBe(0);
          }
          expect(await fs.readFile(path.join(repo, '.git', 'config'), 'utf8')).toBe(before);
        } finally {
          await fs.rm(repo, { recursive: true, force: true });
          await fs.rm(tree, { recursive: true, force: true });
        }
      },
    );

    // The same cases the crate runs under its own profile: an entry at the
    // top, one below it, one in a dependency tree, and a tree's name below a
    // top-level entry.
    it('is refused a hook manager or MCP file at the top and below it, and allowed one a package ships', async () => {
      const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-entries-')));
      try {
        for (const made of ['.husky/node_modules', 'packages/app', 'node_modules/x', 'staged']) {
          await fs.mkdir(path.join(project, made), { recursive: true });
        }
        await fs.writeFile(path.join(project, 'staged', 'mcp.json'), '{}');
        await fs.symlink('later.json', path.join(project, 'mcp.json'));
        const result = await runShellCommand({
          runId: randomUUID(),
          root: { ...root, path: project },
          relativePath: '',
          command: `node -e "const fs=require('fs'),r=[];const t=(n,f)=>{try{f();r.push(n+' ok')}catch(e){r.push(n+' '+e.code)}};for(const f of ['src.txt','.gitmodules','.husky/pre-commit','packages/app/.mcp.json','packages/app/lefthook.yml','node_modules/x/.pre-commit-config.yaml','node_modules/x/mcp.json','.husky/node_modules/.pre-commit-config.yaml','.MCP.JSON','.Pre-Commit-Config.yaml','later.json'])t(f,()=>fs.writeFileSync(f,'x'));t('mkdir .githooks',()=>fs.mkdirSync('.githooks'));t('mkdir .vscode',()=>fs.mkdirSync('.vscode'));t('rename to .vscode',()=>fs.renameSync('staged','.vscode'));t('mkdir packages/app/.vscode',()=>fs.mkdirSync('packages/app/.vscode'));t('unlink mcp.json link',()=>fs.unlinkSync('mcp.json'));console.log(r.join(','))"`,
          policy: { allow: ['node'], deny: [] },
          sandbox: seatbelt,
          network: 'deny',
          approve: vi.fn().mockResolvedValue(false),
          emit: () => undefined,
        });

        expect(result.stderr).toBe('');
        expect(result.stdout.trim().split(',')).toEqual([
          'src.txt ok',
          '.gitmodules EPERM',
          '.husky/pre-commit EPERM',
          'packages/app/.mcp.json EPERM',
          'packages/app/lefthook.yml EPERM',
          'node_modules/x/.pre-commit-config.yaml ok',
          'node_modules/x/mcp.json ok',
          '.husky/node_modules/.pre-commit-config.yaml EPERM',
          '.MCP.JSON EPERM',
          '.Pre-Commit-Config.yaml EPERM',
          'later.json EPERM',
          'mkdir .githooks EPERM',
          'mkdir .vscode EPERM',
          'rename to .vscode EPERM',
          'mkdir packages/app/.vscode EPERM',
          'unlink mcp.json link EPERM',
        ]);
        expect(existsSync(path.join(project, 'later.json'))).toBe(false);
        expect((await fs.lstat(path.join(project, 'mcp.json'))).isSymbolicLink()).toBe(true);
      } finally {
        await fs.rm(project, { recursive: true, force: true });
      }
    });

    // The folder name the crate proves its escaping with. A profile that got
    // one character of it wrong would either fail to parse, which fails
    // every command here, or stop matching, which lets a write through.
    it('confines a folder whose name holds a quote, parentheses and a backslash exactly as any other', async () => {
      const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-awkward-')));
      const project = path.join(parent, 'a (b) "c" \\d');
      await fs.mkdir(path.join(project, '.git'), { recursive: true });
      await fs.writeFile(path.join(project, '.git', 'config'), '[core]\n');
      await fs.mkdir(path.join(project, 'node_modules', 'x'), { recursive: true });
      try {
        const result = await runShellCommand({
          runId: randomUUID(),
          root: { ...root, path: project },
          relativePath: '',
          command: `node -e "const fs=require('fs'),path=require('path'),p=process.cwd(),r=[];const t=(n,f)=>{try{f();r.push(n+' ok')}catch(e){r.push(n+' '+e.code)}};t('inside',()=>fs.writeFileSync('inside.txt','x'));t('beside',()=>fs.writeFileSync(path.join(p,'..','beside.txt'),'x'));t('git',()=>fs.appendFileSync('.git/config','x'));t('mcp',()=>fs.writeFileSync('.MCP.json','x'));t('husky',()=>fs.mkdirSync('.husky'));t('tree',()=>fs.writeFileSync('node_modules/x/lefthook.yml','x'));t('rename-root',()=>fs.renameSync(p,path.join(p,'..','moved')));console.log(r.join(','))"`,
          policy: { allow: ['node'], deny: [] },
          sandbox: seatbelt,
          network: 'deny',
          approve: vi.fn().mockResolvedValue(false),
          emit: () => undefined,
        });

        expect(result.stderr).toBe('');
        expect(result.stdout.trim().split(',')).toEqual([
          'inside ok',
          'beside EPERM',
          'git EPERM',
          'mcp EPERM',
          'husky EPERM',
          'tree ok',
          'rename-root EPERM',
        ]);
        expect(await fs.readFile(path.join(project, 'inside.txt'), 'utf8')).toBe('x');
        expect(existsSync(path.join(parent, 'beside.txt'))).toBe(false);
      } finally {
        await fs.rm(parent, { recursive: true, force: true });
      }
    });

    it('cannot read a credential file inside a toolchain folder it may otherwise read', async () => {
      const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-home-')));
      const project = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-reader-')));
      try {
        await fs.mkdir(path.join(home, '.cargo'));
        await fs.writeFile(path.join(home, '.cargo', 'config.toml'), 'ok\n');
        await fs.writeFile(path.join(home, '.cargo', 'credentials.toml'), 'token\n');
        const plan = (unreadablePaths: string[]) =>
          planSandboxedSpawn({
            sandbox: seatbelt,
            program: '/bin/cat',
            args: [
              path.join(home, '.cargo', 'config.toml'),
              path.join(home, '.cargo', 'credentials.toml'),
            ],
            cwd: project,
            writableRoots: [project],
            readableRoots: [path.join(home, '.cargo')],
            protectedPaths: [],
            pinnedFolders: [],
            unreadablePaths,
            metadataPaths: [],
            network: 'deny',
            developerDirNamed: true,
          });
        const read = (unreadablePaths: string[]) => {
          const { command, args } = plan(unreadablePaths);
          try {
            return execFileSync(command, args, { cwd: project, encoding: 'utf8', stdio: 'pipe' });
          } catch (error) {
            return `${(error as { stdout?: string }).stdout ?? ''}refused`;
          }
        };

        expect(read([])).toBe('ok\ntoken\n');
        expect(read(await credentialReadPaths(home))).toBe('ok\nrefused');
      } finally {
        await fs.rm(home, { recursive: true, force: true });
        await fs.rm(project, { recursive: true, force: true });
      }
    });

    // The checkbox opens hosts elsewhere. A local port or socket is how a
    // sandboxed program would reach one that is not: a container daemon, a
    // terminal multiplexer, an ssh agent.
    it('reaches no socket or port on this computer in a run the user opened the network for', async () => {
      const { createServer } = await import('node:net');
      const socketFolder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-sock-')));
      const socketPath = path.join(socketFolder, 'daemon.sock');
      const unix = createServer((connection) => connection.end('secret'));
      const tcp = createServer((connection) => connection.end('secret'));
      await new Promise<void>((resolve) => unix.listen(socketPath, resolve));
      await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', resolve));
      const port = (tcp.address() as { port: number }).port;
      try {
        const result = await runShellCommand({
          runId: randomUUID(),
          root,
          relativePath: '',
          command: `node -e "const net=require('net'),r=[];const t=(n,o)=>new Promise(d=>{const c=net.connect(o);c.on('data',x=>{r.push(n+' read '+x);d()});c.on('error',e=>{r.push(n+' '+e.code);d()})});t('unix',{path:'${socketPath}'}).then(()=>t('tcp',{host:'127.0.0.1',port:${port}})).then(()=>console.log(r.join(',')))"`,
          policy: { allow: [], deny: [] },
          sandbox: seatbelt,
          approve: vi.fn().mockResolvedValue({ approved: true, allowNetwork: true }),
          emit: () => undefined,
        });

        expect(result.stderr).toBe('');
        expect(result.stdout.trim().split(',')).toEqual(['unix EPERM', 'tcp EPERM']);
      } finally {
        unix.close();
        tcp.close();
        await fs.rm(socketFolder, { recursive: true, force: true });
      }
    });

    // `/usr/bin/git` is a shim that finds the real tool through the developer
    // tool selection, which it cannot read from inside the sandbox. Told the
    // developer directory, it does not have to.
    // A full Xcode answers through `xcodebuild`, which logs its own start-up
    // notes to stderr under the sandbox; only the shim's own diagnostics, each
    // prefixed with the tool name, mean it was refused.
    it.runIf(existsSync('/usr/bin/git') && existsSync('/Library/Developer/CommandLineTools'))(
      'runs the system git shim, which needs the developer directory named for it',
      async () => {
        const result = await runShellCommand({
          runId: randomUUID(),
          root,
          relativePath: '',
          command: '/usr/bin/git --version',
          policy: { allow: ['git'], deny: [] },
          sandbox: seatbelt,
          approve: vi.fn().mockResolvedValue(false),
          emit: () => undefined,
        });

        expect(result.stdout).toMatch(/^git version \d/u);
        expect(result.stderr).not.toMatch(/^(git|xcrun|xcode-select): /mu);
        expect(result.exitCode).toBe(0);
      },
    );

    // With the network opened, a name has to resolve, not only a literal
    // address. Skipped where this machine cannot resolve the name itself.
    it('resolves a host name in a run the user opened the network for, and none without', async (context) => {
      const { lookup } = await import('node:dns/promises');
      const online = await lookup('example.com').then(
        () => true,
        () => false,
      );
      if (!online) context.skip();
      const resolve = (allowNetwork: boolean) =>
        runShellCommand({
          runId: randomUUID(),
          root,
          relativePath: '',
          command: `node -e "require('dns').lookup('example.com',(e,a)=>console.log(e?'fail '+e.code:'ok'))"`,
          policy: { allow: [], deny: [] },
          sandbox: seatbelt,
          approve: vi.fn().mockResolvedValue({ approved: true, allowNetwork }),
          emit: () => undefined,
        });

      expect((await resolve(true)).stdout.trim()).toBe('ok');
      expect((await resolve(false)).stdout.trim()).toMatch(/^fail /u);
    });

    it('is refused a read of the home folder', async () => {
      const result = await run(`require('fs').readdirSync(require('os').homedir())`);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
    });

    it('cannot read a different session in shared temporary storage', async () => {
      const result = await run(
        `console.log(require('fs').readFileSync('${path.join(peerFolder, 'token.txt')}', 'utf8'))`,
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
      expect(result.stdout).not.toContain('other-session-fixture');
    });

    it('cannot overwrite a different session in shared temporary storage', async () => {
      const result = await run(
        `require('fs').writeFileSync('${path.join(peerFolder, 'token.txt')}', 'overwritten')`,
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('EPERM');
      expect(await fs.readFile(path.join(peerFolder, 'token.txt'), 'utf8')).toBe(
        'other-session-fixture',
      );
    });
  },
);
