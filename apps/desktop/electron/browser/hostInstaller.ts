import { app } from 'electron';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NATIVE_MESSAGING_HOST_NAME } from '@agiworkforce/types';
import { hostToken } from './pairingStore';

const MANIFEST_FILE = `${NATIVE_MESSAGING_HOST_NAME}.json`;

/**
 * Where each Chromium-family browser looks for a host manifest on macOS. A
 * browser started with `--user-data-dir` reads `<that dir>/NativeMessagingHosts`
 * instead, which is why callers may add directories of their own.
 */
export function browserManifestDirectories(home = os.homedir()): string[] {
  const support = path.join(home, 'Library', 'Application Support');
  return [
    path.join(support, 'Google', 'Chrome', 'NativeMessagingHosts'),
    path.join(support, 'Chromium', 'NativeMessagingHosts'),
    path.join(support, 'Microsoft Edge', 'NativeMessagingHosts'),
  ];
}

export function hostDirectory(): string {
  return path.join(app.getPath('userData'), 'native-host');
}

export function launcherPath(): string {
  return path.join(hostDirectory(), 'agi-native-host');
}

export function tokenFilePath(): string {
  return path.join(hostDirectory(), 'host-token');
}

function hostBundlePath(): string {
  return path.join(hostDirectory(), 'native-host.cjs');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function launcherScript(input: {
  electronPath: string;
  hostBundle: string;
  tokenFile: string;
  port: number;
}): string {
  return [
    '#!/bin/sh',
    'set -e',
    `AGI_CLOUD_BRIDGE_PORT=${input.port}`,
    `AGI_CLOUD_HOST_TOKEN_FILE=${shellQuote(input.tokenFile)}`,
    'ELECTRON_RUN_AS_NODE=1',
    'export AGI_CLOUD_BRIDGE_PORT AGI_CLOUD_HOST_TOKEN_FILE ELECTRON_RUN_AS_NODE',
    `exec ${shellQuote(input.electronPath)} ${shellQuote(input.hostBundle)} "$@"`,
    '',
  ].join('\n');
}

export function manifestDocument(extensionId: string, hostPath: string): string {
  return `${JSON.stringify(
    {
      name: NATIVE_MESSAGING_HOST_NAME,
      description: 'AGI Cloud browser bridge',
      path: hostPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  )}\n`;
}

function packagedHostBundle(): string {
  return path.join(app.getAppPath(), 'electron', 'dist', 'native-host.cjs');
}

export interface HostInstallResult {
  manifestPaths: string[];
  launcher: string;
}

/**
 * Writes the launcher, its token, and one manifest per browser profile.
 *
 * The host is copied out of the application bundle rather than referenced
 * inside it: a manifest pointing into `app.asar` survives neither an update nor
 * a `ELECTRON_NO_ASAR` environment, and the copy is what the browser executes.
 */
export function installNativeHost(input: {
  extensionId: string;
  port: number;
  extraManifestDirectories?: readonly string[];
  home?: string;
}): HostInstallResult {
  const directory = hostDirectory();
  mkdirSync(directory, { recursive: true });

  const bundle = hostBundlePath();
  const source = packagedHostBundle();
  if (!existsSync(source)) {
    throw new Error('The browser host was not built into this app.');
  }
  copyFileSync(source, bundle);

  const tokenFile = tokenFilePath();
  writeFileSync(tokenFile, `${hostToken()}\n`, { encoding: 'utf8', mode: 0o600 });

  const launcher = launcherPath();
  writeFileSync(
    launcher,
    launcherScript({
      electronPath: process.execPath,
      hostBundle: bundle,
      tokenFile,
      port: input.port,
    }),
    { encoding: 'utf8', mode: 0o700 },
  );

  const document = manifestDocument(input.extensionId, launcher);
  const manifestPaths: string[] = [];
  for (const target of [
    ...browserManifestDirectories(input.home),
    ...(input.extraManifestDirectories ?? []),
  ]) {
    try {
      mkdirSync(target, { recursive: true });
      const manifestPath = path.join(target, MANIFEST_FILE);
      writeFileSync(manifestPath, document, { encoding: 'utf8', mode: 0o600 });
      manifestPaths.push(manifestPath);
    } catch {
      continue;
    }
  }

  if (manifestPaths.length === 0) {
    throw new Error('No browser profile on this Mac accepted the host manifest.');
  }
  return { manifestPaths, launcher };
}

export function installedManifestPaths(
  extraManifestDirectories: readonly string[] = [],
  home?: string,
): string[] {
  return [...browserManifestDirectories(home), ...extraManifestDirectories]
    .map((directory) => path.join(directory, MANIFEST_FILE))
    .filter((manifestPath) => existsSync(manifestPath));
}

export function uninstallNativeHost(
  extraManifestDirectories: readonly string[] = [],
  home?: string,
): string[] {
  const removed: string[] = [];
  for (const manifestPath of installedManifestPaths(extraManifestDirectories, home)) {
    try {
      rmSync(manifestPath);
      removed.push(manifestPath);
    } catch {
      continue;
    }
  }
  rmSync(hostDirectory(), { recursive: true, force: true });
  return removed;
}
