import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ShellCommandRefused } from '@agiworkforce/local-runtime-contract';

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
  '(allow mach-lookup)',
  '(allow system-socket)',
];

export const SEATBELT_NETWORK_RULES: readonly string[] = [
  '(allow network-outbound)',
  '(allow network-inbound)',
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
  '/tmp',
  '/private/tmp',
  '/opt',
];

// Seatbelt matches resolved paths, so the /etc symlink alone never grants a read.
export const SEATBELT_DESKTOP_READ_PATHS: readonly string[] = ['/private/etc'];

export const SEATBELT_SHARED_WRITE_PATHS: readonly string[] = ['/tmp', '/private/tmp'];

export interface SandboxedSpawnInput {
  sandbox: Exclude<ShellSandbox, { backend: 'none' }>;
  program: string;
  args: readonly string[];
  cwd: string;
  writableRoots: readonly string[];
  readableRoots: readonly string[];
  network: SandboxNetwork;
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

export function isSeatbeltSafePath(value: string): boolean {
  if (!path.isAbsolute(value) || value === '/' || value !== value.trim()) return false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x2028 || code === 0x2029) return false;
    if (character === '"' || character === '(' || character === ')' || character === '\\') {
      return false;
    }
  }
  return true;
}

// SBPL has no parameterised quoting: a path containing a quote or parenthesis
// could close the literal and append `(allow default)`, so it is refused.
function seatbeltPath(value: string): string {
  if (!isSeatbeltSafePath(value)) {
    throw new ShellCommandRefused(
      'sandbox-unavailable',
      `The sandbox cannot be limited to ${value}, because its path contains a quote, parenthesis, backslash or control character. Rename the folder and try again.`,
    );
  }
  return `"${value}"`;
}

export function seatbeltProfile(input: {
  writableRoots: readonly string[];
  readableRoots: readonly string[];
  network: SandboxNetwork;
}): string {
  const subpaths = (paths: readonly string[]) =>
    paths.map((value) => `(subpath ${seatbeltPath(value)})`).join(' ');
  const lines = [
    '(version 1)',
    '(deny default)',
    ...SEATBELT_PROCESS_RULES,
    ...(input.network === 'allow' ? SEATBELT_NETWORK_RULES : []),
    `(allow file-read* ${subpaths([...SEATBELT_SYSTEM_READ_PATHS, ...SEATBELT_DESKTOP_READ_PATHS])} (literal "/"))`,
    `(allow file-read* ${subpaths([...input.writableRoots, ...input.readableRoots])})`,
    '(allow file-write* (literal "/dev/null"))',
    `(allow file-write* ${subpaths(SEATBELT_SHARED_WRITE_PATHS)})`,
    `(allow file-write* ${subpaths(input.writableRoots)})`,
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
  args.push('--chdir', input.cwd, '--', input.program, ...input.args);
  return args;
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

async function resolvedDirectory(value: string): Promise<string | null> {
  try {
    const resolved = await fs.realpath(value);
    return (await fs.stat(resolved)).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function installPrefix(binDirectory: string, home: string): string {
  const parent = path.dirname(binDirectory);
  return parent === '/' || parent === home ? binDirectory : parent;
}

async function xcodeBundle(): Promise<string | null> {
  const developer = await resolvedDirectory(XCODE_SELECT_LINK);
  if (!developer) return null;
  const marker = developer.indexOf('.app/');
  return marker === -1 ? developer : developer.slice(0, marker + '.app'.length);
}

export async function seatbeltToolchainRoots(
  pathValue: string | undefined,
  program: string,
): Promise<string[]> {
  const home = os.homedir();
  const candidates = [
    ...(pathValue ?? '').split(path.delimiter).filter((entry) => path.isAbsolute(entry)),
    path.dirname(program),
  ];
  const roots = new Set<string>();
  for (const candidate of candidates) {
    const resolved = await resolvedDirectory(candidate);
    if (!resolved) continue;
    const prefix = installPrefix(resolved, home);
    if (prefix !== home && isSeatbeltSafePath(prefix)) roots.add(prefix);
  }
  const bundle = await xcodeBundle();
  if (bundle && isSeatbeltSafePath(bundle)) roots.add(bundle);
  return [...roots];
}
