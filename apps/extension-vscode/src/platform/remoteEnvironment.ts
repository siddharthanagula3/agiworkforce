import { PRODUCT_NAMES } from '@agiworkforce/types';
import { execFile } from 'node:child_process';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type RemoteEnvironmentKind =
  'local' | 'wsl' | 'ssh' | 'dev-container' | 'codespaces' | 'tunnel' | 'other-remote';

export interface RemoteEnvironment {
  kind: RemoteEnvironmentKind;
  remoteName: string | undefined;
  label: string;
}

const REMOTE_KINDS: Readonly<Record<string, { kind: RemoteEnvironmentKind; label: string }>> = {
  wsl: { kind: 'wsl', label: 'WSL' },
  'ssh-remote': { kind: 'ssh', label: 'the SSH host' },
  'dev-container': { kind: 'dev-container', label: 'the dev container' },
  'attached-container': { kind: 'dev-container', label: 'the attached container' },
  codespaces: { kind: 'codespaces', label: 'the codespace' },
  tunnel: { kind: 'tunnel', label: 'the tunnelled machine' },
};

export function describeRemoteEnvironment(remoteName: string | undefined): RemoteEnvironment {
  if (remoteName === undefined || remoteName === '') {
    return { kind: 'local', remoteName: undefined, label: 'this computer' };
  }
  const known = REMOTE_KINDS[remoteName];
  return known
    ? { ...known, remoteName }
    : { kind: 'other-remote', remoteName, label: `the ${remoteName} remote` };
}

export interface CliResolutionHost {
  platform: NodeJS.Platform;
  homedir: string;
  pathVariable: string | undefined;
  isExecutableFile: (candidate: string) => boolean;
  workspaceRoots: readonly string[];
}

export type CliResolutionFailure = 'empty' | 'relative' | 'not-found';

export type CliResolution =
  { ok: true; path: string } | { ok: false; configured: string; reason: CliResolutionFailure };

export const INSTALLED_CLI_DIRECTORIES = ['.agi/bin', '.local/bin', '.cargo/bin'] as const;

function expandHome(candidate: string, homedir: string): string {
  if (candidate === '~') return homedir;
  if (candidate.startsWith('~/')) return path.posix.join(homedir, candidate.slice(2));
  return candidate;
}

function isInside(pathApi: path.PlatformPath, root: string, candidate: string): boolean {
  const relative = pathApi.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative))
  );
}

/**
 * Where the configured CLI actually lives in the environment this extension
 * host runs in, always as an absolute path. A remote server starts without the
 * login shell's PATH, so a CLI installed under the user's home is looked for
 * there too. A bare name is never handed back: process creation on Windows
 * looks a bare name up in the working directory before PATH, and that
 * directory is the workspace. A PATH search never settles on a relative entry
 * or on a file inside an open workspace folder.
 */
export function resolveCliPath(configured: string, host: CliResolutionHost): CliResolution {
  const trimmed = expandHome(configured.trim(), host.homedir);
  if (trimmed === '') return { ok: false, configured: trimmed, reason: 'empty' };
  const pathApi = host.platform === 'win32' ? path.win32 : path.posix;
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return pathApi.isAbsolute(trimmed)
      ? { ok: true, path: trimmed }
      : { ok: false, configured: trimmed, reason: 'relative' };
  }

  const names =
    host.platform === 'win32' && pathApi.extname(trimmed) === ''
      ? [`${trimmed}.exe`, `${trimmed}.cmd`, trimmed]
      : [trimmed];
  const searchPath = (host.pathVariable ?? '')
    .split(host.platform === 'win32' ? ';' : ':')
    .filter((entry) => entry !== '' && pathApi.isAbsolute(entry));
  const installed = INSTALLED_CLI_DIRECTORIES.map((directory) =>
    pathApi.join(host.homedir, directory),
  );
  for (const directory of [...searchPath, ...installed]) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (host.workspaceRoots.some((root) => isInside(pathApi, root, candidate))) continue;
      if (host.isExecutableFile(candidate)) return { ok: true, path: candidate };
    }
  }
  return { ok: false, configured: trimmed, reason: 'not-found' };
}

export function nodeCliResolutionHost(workspaceRoots: readonly string[]): CliResolutionHost {
  return {
    platform: process.platform,
    homedir: os.homedir(),
    workspaceRoots,
    pathVariable: process.env['PATH'] ?? process.env['Path'],
    isExecutableFile: (candidate) => {
      try {
        if (!statSync(candidate).isFile()) return false;
        accessSync(candidate, fsConstants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type CliProbeResult =
  { ok: true; cliPath: string; version: string } | { ok: false; cliPath: string; reason: string };

export type RunVersion = (cliPath: string) => Promise<string>;

const VERSION_TIMEOUT_MS = 10_000;

export const runCliVersion: RunVersion = (cliPath) =>
  new Promise((resolve, reject) => {
    execFile(
      cliPath,
      ['--version'],
      { timeout: VERSION_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });

export async function probeCli(cliPath: string, runVersion: RunVersion): Promise<CliProbeResult> {
  try {
    const version = await runVersion(cliPath);
    return { ok: true, cliPath, version };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason =
      code === 'ENOENT'
        ? 'was not found'
        : code === 'EACCES' || code === 'EPERM'
          ? 'is not executable'
          : `did not run (${error instanceof Error ? error.message : String(error)})`;
    return { ok: false, cliPath, reason };
  }
}

const RESOLUTION_FAILURE_REASONS: Readonly<Record<CliResolutionFailure, string>> = {
  empty: 'is not set',
  relative: 'is a relative path, which is never run because it would resolve inside the workspace',
  'not-found': 'was not found on the PATH or in the usual install folders',
};

export function describeCliResolutionFailure(reason: CliResolutionFailure): string {
  return RESOLUTION_FAILURE_REASONS[reason];
}

export function unresolvedCliProbe(
  resolution: Extract<CliResolution, { ok: false }>,
): Extract<CliProbeResult, { ok: false }> {
  return {
    ok: false,
    cliPath: resolution.configured === '' ? 'agiWorkforce.cliPath' : resolution.configured,
    reason: describeCliResolutionFailure(resolution.reason),
  };
}

export function probeResolvedCli(
  resolution: CliResolution,
  runVersion: RunVersion,
): Promise<CliProbeResult> {
  if (resolution.ok) return probeCli(resolution.path, runVersion);
  return Promise.resolve(unresolvedCliProbe(resolution));
}

export function cliProbeMessage(result: CliProbeResult, environment: RemoteEnvironment): string {
  return result.ok
    ? `${PRODUCT_NAMES.code}: ${result.version} runs from ${result.cliPath} in ${environment.label}.`
    : `${PRODUCT_NAMES.code}: The AGI CLI at ${result.cliPath} ${result.reason} in ${environment.label}. Install the CLI there, or set agiWorkforce.cliPath to its path inside ${environment.label}.`;
}
