import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { ComputerUseRefused, requireAvailable } from './computerUseService';

const LOOKUP_TIMEOUT_MS = 5_000;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const BUNDLE_ID_CHARACTERS = /^[A-Za-z0-9.-]+$/;
const APP_SUFFIX = '.app';

export interface InstalledApplication {
  name: string;
  bundleId: string;
  path: string;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: LOOKUP_TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

function applicationFolders(): string[] {
  return [
    '/Applications',
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
    '/System/Library/CoreServices',
    path.join(os.homedir(), 'Applications'),
  ];
}

function notInstalled(application: string): ComputerUseRefused {
  return new ComputerUseRefused(
    'failed',
    `No app called "${application}" is installed on this computer. Use the name it has in Applications, or its bundle id.`,
  );
}

async function bundleIdAt(appPath: string): Promise<string | null> {
  try {
    const bundleId = (
      await run('/usr/bin/plutil', [
        '-extract',
        'CFBundleIdentifier',
        'raw',
        '-o',
        '-',
        path.join(appPath, 'Contents', 'Info.plist'),
      ])
    ).trim();
    return BUNDLE_ID_CHARACTERS.test(bundleId) ? bundleId : null;
  } catch {
    return null;
  }
}

async function pathByName(name: string): Promise<string | null> {
  const wanted = `${name}${APP_SUFFIX}`.toLowerCase();
  for (const folder of applicationFolders()) {
    let entries: string[];
    try {
      entries = await readdir(folder);
    } catch {
      continue;
    }
    const match = entries.find((entry) => entry.toLowerCase() === wanted);
    if (match) return path.join(folder, match);
  }
  return null;
}

async function pathByBundleId(bundleId: string): Promise<string | null> {
  try {
    const found = (await run('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == "${bundleId}"`]))
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith(APP_SUFFIX));
    return found ?? null;
  } catch {
    return null;
  }
}

function ownBundlePath(): string {
  return path.resolve(process.execPath, '..', '..', '..');
}

/**
 * The installed app a step names, resolved before anything is asked or opened,
 * so the permission prompt and the launch both name the same bundle.
 */
export async function findInstalledApplication(application: string): Promise<InstalledApplication> {
  requireAvailable();
  const byBundleId = BUNDLE_ID_PATTERN.test(application) ? await pathByBundleId(application) : null;
  const appPath = byBundleId ?? (await pathByName(application));
  if (!appPath) throw notInstalled(application);
  const bundleId = await bundleIdAt(appPath);
  if (!bundleId) throw notInstalled(application);
  const own = ownBundlePath();
  if (appPath === own || bundleId === (await bundleIdAt(own))) {
    throw new ComputerUseRefused(
      'failed',
      `That is ${PRODUCT_NAMES.desktop} itself, which AGI does not open or control. Name the app you want to work in.`,
    );
  }
  return { name: path.basename(appPath, APP_SUFFIX), bundleId, path: appPath };
}

export async function launchApplication(target: InstalledApplication): Promise<true> {
  requireAvailable();
  try {
    await run('/usr/bin/open', ['-a', target.path]);
  } catch {
    throw new ComputerUseRefused('failed', `${target.name} did not open.`);
  }
  return true;
}
