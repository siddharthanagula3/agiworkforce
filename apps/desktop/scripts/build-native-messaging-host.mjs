#!/usr/bin/env node
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
const requestedTarget =
  parseFlag('target') ??
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  process.env.CARGO_BUILD_TARGET ??
  process.env.TARGET ??
  null;
const hostTriple = rustHostTriple();
const buildTargets =
  requestedTarget === 'universal-apple-darwin'
    ? ['aarch64-apple-darwin', 'x86_64-apple-darwin']
    : [requestedTarget ?? hostTriple];
const outDir = path.join(tauriRoot, 'binaries');
mkdirSync(outDir, { recursive: true });

const profileDir = profile === 'debug' ? 'debug' : profile;
const targetDir = cargoTargetDirectory();
const compiledBinaries = [];

for (const target of buildTargets) {
  const isWindows = target.includes('windows');
  const exeName = `native_messaging_host${isWindows ? '.exe' : ''}`;
  const binaryDest = path.join(outDir, `native_messaging_host-${target}${isWindows ? '.exe' : ''}`);

  if (!existsSync(binaryDest)) {
    writeFileSync(binaryDest, isWindows ? '' : '#!/usr/bin/env sh\nexit 1\n');
    if (!isWindows) chmodSync(binaryDest, 0o755);
  }

  const cargoArgs = ['build', '--bin', 'native_messaging_host'];
  if (profile === 'release') {
    cargoArgs.push('--release');
  } else if (profile !== 'debug') {
    cargoArgs.push('--profile', profile);
  }
  const explicitTarget = requestedTarget !== null;
  if (explicitTarget) cargoArgs.push('--target', target);

  console.log(`[native-host] cargo ${cargoArgs.join(' ')}`);
  execFileSync('cargo', cargoArgs, { cwd: tauriRoot, stdio: 'inherit' });

  const binarySource = explicitTarget
    ? path.join(targetDir, target, profileDir, exeName)
    : path.join(targetDir, profileDir, exeName);
  copyFileSync(binarySource, binaryDest);
  if (!isWindows) chmodSync(binaryDest, 0o755);
  compiledBinaries.push(binaryDest);
  console.log(`[native-host] copied ${binarySource}`);
  console.log(`[native-host] wrote ${binaryDest}`);
}

if (requestedTarget === 'universal-apple-darwin') {
  const universalDest = path.join(outDir, 'native_messaging_host-universal-apple-darwin');
  execFileSync('lipo', ['-create', ...compiledBinaries, '-output', universalDest], {
    stdio: 'inherit',
  });
  chmodSync(universalDest, 0o755);
  const architectures = execFileSync('lipo', ['-archs', universalDest], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/u);
  for (const requiredArchitecture of ['arm64', 'x86_64']) {
    if (!architectures.includes(requiredArchitecture)) {
      throw new Error(`Universal native host is missing ${requiredArchitecture}`);
    }
  }
  const universalBundleDir = path.join(targetDir, requestedTarget, profileDir);
  const universalBundleSource = path.join(universalBundleDir, 'native_messaging_host');
  mkdirSync(universalBundleDir, { recursive: true });
  copyFileSync(universalDest, universalBundleSource);
  chmodSync(universalBundleSource, 0o755);
  console.log(`[native-host] wrote ${universalDest} (${architectures.join(', ')})`);
  console.log(`[native-host] staged ${universalBundleSource}`);
}
