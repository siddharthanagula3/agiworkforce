#!/usr/bin/env node
/* global console */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const desktopRoot = path.resolve(import.meta.dirname, '..');
const tauriRoot = path.join(desktopRoot, 'src-tauri');

function parseFlag(name) {
  const prefix = `--${name}=`;
  const index = process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (index === -1) return null;
  const arg = process.argv[index];
  if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  return process.argv[index + 1] ?? null;
}

function rustHostTriple() {
  const output = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const hostLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('host: '));
  if (!hostLine) {
    throw new Error('Could not detect Rust host target triple from `rustc -vV`.');
  }
  return hostLine.slice('host: '.length).trim();
}

function cargoTargetDirectory() {
  const output = execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: tauriRoot,
    encoding: 'utf8',
  });
  const metadata = JSON.parse(output);
  if (typeof metadata.target_directory !== 'string') {
    throw new Error('Cargo metadata did not include target_directory.');
  }
  return metadata.target_directory;
}

const profile = parseFlag('profile') ?? process.env.PROFILE ?? 'release';
const target = parseFlag('target') ?? process.env.CARGO_BUILD_TARGET ?? process.env.TARGET ?? null;
const resolvedTriple = target ?? rustHostTriple();
const isWindows = resolvedTriple.includes('windows');
const exeName = `native_messaging_host${isWindows ? '.exe' : ''}`;
const outDir = path.join(tauriRoot, 'binaries');
const binaryDest = path.join(
  outDir,
  `native_messaging_host-${resolvedTriple}${isWindows ? '.exe' : ''}`,
);

// Tauri validates `bundle.externalBin` during Cargo build-script execution.
// The helper binary is what we are building, so seed the generated sidecar path
// with a placeholder first, then overwrite it with the real compiled helper.
mkdirSync(outDir, { recursive: true });
if (!existsSync(binaryDest)) {
  writeFileSync(binaryDest, isWindows ? '' : '#!/usr/bin/env sh\nexit 1\n');
  if (!isWindows) {
    chmodSync(binaryDest, 0o755);
  }
}

const cargoArgs = ['build', '--bin', 'native_messaging_host'];
if (profile === 'release') {
  cargoArgs.push('--release');
} else if (profile !== 'debug') {
  cargoArgs.push('--profile', profile);
}
if (target) {
  cargoArgs.push('--target', target);
}

console.log(`[native-host] cargo ${cargoArgs.join(' ')}`);
execFileSync('cargo', cargoArgs, { cwd: tauriRoot, stdio: 'inherit' });

const profileDir = profile === 'debug' ? 'debug' : profile;
const targetDir = cargoTargetDirectory();
const binarySource = target
  ? path.join(targetDir, target, profileDir, exeName)
  : path.join(targetDir, profileDir, exeName);

copyFileSync(binarySource, binaryDest);
if (!isWindows) {
  chmodSync(binaryDest, 0o755);
}

console.log(`[native-host] copied ${binarySource}`);
console.log(`[native-host] wrote ${binaryDest}`);
