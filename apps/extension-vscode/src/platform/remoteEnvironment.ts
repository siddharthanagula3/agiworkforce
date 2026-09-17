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
}

export const INSTALLED_CLI_DIRECTORIES = ['.agi/bin', '.local/bin', '.cargo/bin'] as const;

function expandHome(candidate: string, homedir: string): string {
  if (candidate === '~') return homedir;
  if (candidate.startsWith('~/')) return path.posix.join(homedir, candidate.slice(2));
  return candidate;
}

/**
 * Where the configured CLI actually lives in the environment this extension
 * host runs in. A remote server starts without the login shell's PATH, so a
 * CLI installed under the user's home is looked for there too. An unresolved
 * name is returned unchanged so the spawn failure still names it.
 */
export function resolveCliPath(configured: string, host: CliResolutionHost): string {
  const trimmed = expandHome(configured.trim(), host.homedir);
  if (trimmed === '') return trimmed;
  const pathApi = host.platform === 'win32' ? path.win32 : path.posix;
  if (trimmed.includes('/') || trimmed.includes('\\')) return trimmed;

  const names =
    host.platform === 'win32' && pathApi.extname(trimmed) === ''
      ? [`${trimmed}.exe`, `${trimmed}.cmd`, trimmed]
      : [trimmed];
  const searchPath = (host.pathVariable ?? '')
    .split(host.platform === 'win32' ? ';' : ':')
    .filter((entry) => entry !== '');
  const installed = INSTALLED_CLI_DIRECTORIES.map((directory) =>
    pathApi.join(host.homedir, directory),
  );
  for (const directory of [...searchPath, ...installed]) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (host.isExecutableFile(candidate)) return candidate;
    }
  }
  return trimmed;
}

export function nodeCliResolutionHost(): CliResolutionHost {
  return {
    platform: process.platform,
    homedir: os.homedir(),
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

export function cliProbeMessage(result: CliProbeResult, environment: RemoteEnvironment): string {
  return result.ok
    ? `AGI Workforce: ${result.version} runs from ${result.cliPath} in ${environment.label}.`
    : `AGI Workforce: The AGI CLI at ${result.cliPath} ${result.reason} in ${environment.label}. Install the CLI there, or set agiWorkforce.cliPath to its path inside ${environment.label}.`;
}
