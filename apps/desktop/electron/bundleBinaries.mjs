import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch } from 'electron-builder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

const ELECTRON_MINIMUM_MACOS = '13.0';

const TARGETS = {
  darwin: {
    arm64: { rust: 'aarch64-apple-darwin', swift: `arm64-apple-macos${ELECTRON_MINIMUM_MACOS}` },
    x64: { rust: 'x86_64-apple-darwin', swift: `x86_64-apple-macos${ELECTRON_MINIMUM_MACOS}` },
  },
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`, { cause: result.error });
  }
}

function bundleCli(target, staging) {
  run('rustup', ['toolchain', 'install']);
  run('rustup', ['target', 'add', target]);
  run('cargo', [
    'build',
    '--release',
    '--locked',
    '-p',
    'agiworkforce-cli',
    '--bin',
    'agi',
    '--target',
    target,
  ]);
  const staged = path.join(staging, 'agi');
  copyFileSync(path.join(repoRoot, 'target', target, 'release', 'agi'), staged);
  chmodSync(staged, 0o755);
}

function bundleInputHelper(target, staging) {
  run('swiftc', [
    '-O',
    '-target',
    target,
    path.join(__dirname, 'native', 'macos', 'agi-input.swift'),
    '-o',
    path.join(staging, 'agi-input'),
  ]);
}

export default async function bundleBinaries(context) {
  const arch = Arch[context.arch];
  const target = TARGETS[context.electronPlatformName]?.[arch];
  if (!target) {
    throw new Error(`No bundled binaries are defined for ${context.electronPlatformName} ${arch}.`);
  }
  const staging = path.join(__dirname, 'dist', 'bin', arch);
  mkdirSync(staging, { recursive: true });
  bundleCli(target.rust, staging);
  bundleInputHelper(target.swift, staging);
}
