#!/usr/bin/env node
/* global process */
/* eslint-disable no-undef */
/**
 * AGI Workforce CLI — npm wrapper
 *
 * This thin wrapper resolves and spawns the native Rust binary.
 * The binary is bundled in platform-specific npm packages
 * (e.g., @agiworkforce/cli-darwin-arm64) or in the vendor/ directory.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

const BINARY_NAME = 'agiworkforce';

// Platform → npm package mapping
const PLATFORM_PACKAGES = {
  'darwin-arm64': '@agiworkforce/cli-darwin-arm64',
  'darwin-x64': '@agiworkforce/cli-darwin-x64',
  'linux-arm64': '@agiworkforce/cli-linux-arm64',
  'linux-x64': '@agiworkforce/cli-linux-x64',
  'win32-arm64': '@agiworkforce/cli-win32-arm64',
  'win32-x64': '@agiworkforce/cli-win32-x64',
};

function getPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function findBinary() {
  const platformKey = getPlatformKey();
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? `${BINARY_NAME}.exe` : BINARY_NAME;

  // 1. Try platform-specific npm package
  const packageName = PLATFORM_PACKAGES[platformKey];
  if (packageName) {
    try {
      const pkgDir = dirname(require.resolve(`${packageName}/package.json`));
      const binaryPath = join(pkgDir, 'bin', binaryName);
      if (existsSync(binaryPath)) return binaryPath;
    } catch {
      // Package not installed — fall through
    }
  }

  // 2. Try vendor/ directory (bundled with main package)
  const vendorPath = join(
    dirname(import.meta.url.replace('file://', '')),
    '..',
    'vendor',
    binaryName,
  );
  if (existsSync(vendorPath)) return vendorPath;

  // 3. Try PATH (cargo install, manual install)
  return BINARY_NAME;
}

function main() {
  const binaryPath = findBinary();
  const args = process.argv.slice(2);

  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      const platformKey = getPlatformKey();
      console.error(`\nAGI Workforce CLI binary not found for ${platformKey}.`);
      console.error(`\nInstall options:`);
      console.error(`  curl -fsSL https://agiworkforce.com/install.sh | bash`);
      console.error(
        `  cargo install --git https://github.com/siddharthanagula3/agiworkforce-desktop-app agiworkforce-cli`,
      );
      process.exit(1);
    }
    throw err;
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });
}

main();
