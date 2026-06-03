#!/usr/bin/env node
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
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const BINARY_NAME = 'agi';
const LEGACY_BINARY_NAME = 'agiworkforce';
const WRAPPER_ENV = 'AGI_CLI_NPM_WRAPPER';
const BINARY_PATH_ENV = 'AGI_CLI_BINARY_PATH';

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

function binaryNames() {
  const isWindows = process.platform === 'win32';
  return [
    isWindows ? `${BINARY_NAME}.exe` : BINARY_NAME,
    isWindows ? `${LEGACY_BINARY_NAME}.exe` : LEGACY_BINARY_NAME,
  ];
}

function findBinary() {
  const platformKey = getPlatformKey();
  const checked = [];

  const override = process.env[BINARY_PATH_ENV];
  if (override) {
    checked.push(`${BINARY_PATH_ENV}=${override}`);
    return {
      binaryPath: existsSync(override) ? override : null,
      checked,
      platformKey,
      packageName: PLATFORM_PACKAGES[platformKey] ?? null,
    };
  }

  // 1. Try platform-specific npm package
  const packageName = PLATFORM_PACKAGES[platformKey];
  if (packageName) {
    try {
      const pkgDir = dirname(require.resolve(`${packageName}/package.json`));
      for (const name of binaryNames()) {
        const binaryPath = join(pkgDir, 'bin', name);
        checked.push(binaryPath);
        if (existsSync(binaryPath)) {
          return { binaryPath, checked, platformKey, packageName };
        }
      }
    } catch {
      checked.push(`${packageName}/package.json`);
    }
  }

  // 2. Try vendor/ directory (bundled with main package)
  const wrapperDir = dirname(fileURLToPath(import.meta.url));
  for (const name of binaryNames()) {
    const vendorPath = join(wrapperDir, '..', 'vendor', name);
    checked.push(vendorPath);
    if (existsSync(vendorPath)) {
      return { binaryPath: vendorPath, checked, platformKey, packageName };
    }
  }

  return { binaryPath: null, checked, platformKey, packageName };
}

function printMissingBinary(context) {
  console.error(`\nAGI CLI binary not found for ${context.platformKey}.`);
  if (context.packageName) {
    console.error(`Expected platform package: ${context.packageName}`);
  } else {
    console.error(`Unsupported Node platform key: ${context.platformKey}`);
  }
  console.error(`\nChecked:`);
  for (const item of context.checked) {
    console.error(`  - ${item}`);
  }
  console.error(`\nInstall options:`);
  console.error(`  curl -fsSL https://agiworkforce.com/install.sh | bash`);
  console.error(
    `  cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi`,
  );
  console.error(`  ${BINARY_PATH_ENV}=/absolute/path/to/agi agi ...`);
}

function main() {
  const context = findBinary();
  const binaryPath = context.binaryPath;
  if (!binaryPath) {
    printMissingBinary(context);
    process.exit(1);
  }
  const args = process.argv.slice(2);

  const child = spawn(binaryPath, args, {
    stdio: 'inherit',
    env: { ...process.env, [WRAPPER_ENV]: '1' },
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      printMissingBinary(context);
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
