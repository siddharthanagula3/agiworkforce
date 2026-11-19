import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';

export function runChecked(extensionRoot, command, args, failureMessage) {
  const result = spawnSync(command, args, {
    cwd: extensionRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${failureMessage}: ${command} is required`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${failureMessage}: ${result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`}`,
    );
  }
  return result.stdout;
}

export function resolveExtensionDirectory(
  extensionRoot,
  requestedPackage,
  { firstDraft = false } = {},
) {
  if (!requestedPackage) {
    return { directory: resolve(extensionRoot, 'dist'), cleanup: undefined };
  }

  const packagePath = resolve(process.cwd(), requestedPackage);
  runChecked(
    extensionRoot,
    process.execPath,
    [
      resolve(extensionRoot, 'scripts', 'verify-package.mjs'),
      packagePath,
      ...(firstDraft ? ['--first-draft'] : []),
    ],
    'packaged extension verification failed',
  );

  const extractedRoot = fs.mkdtempSync(join(os.tmpdir(), 'agi-extension-package-'));
  try {
    runChecked(
      extensionRoot,
      'unzip',
      ['-q', packagePath, '-d', extractedRoot],
      'packaged extension extraction failed',
    );
  } catch (error) {
    fs.rmSync(extractedRoot, { recursive: true, force: true });
    throw error;
  }

  const sha256 = createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex');
  console.log(
    `packaged artifact: ${packagePath} (${fs.statSync(packagePath).size} bytes, sha256 ${sha256})`,
  );
  return {
    directory: extractedRoot,
    cleanup: () => fs.rmSync(extractedRoot, { recursive: true, force: true }),
  };
}

export async function launchExtension({ directory, hostResolverRules }) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${directory}`,
      `--load-extension=${directory}`,
      `--host-resolver-rules=${hostResolverRules}`,
    ],
  });
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  return { context, serviceWorker, extensionId };
}
