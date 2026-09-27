import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch } from 'electron-builder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');

const RUST_TARGETS = {
  darwin: { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' },
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`, { cause: result.error });
  }
}

export default async function bundleCli(context) {
  const arch = Arch[context.arch];
  const target = RUST_TARGETS[context.electronPlatformName]?.[arch];
  if (!target) {
    throw new Error(`No AGI CLI build is defined for ${context.electronPlatformName} ${arch}.`);
  }
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
  const staged = path.join(__dirname, 'dist', 'cli', arch, 'agi');
  mkdirSync(path.dirname(staged), { recursive: true });
  copyFileSync(path.join(repoRoot, 'target', target, 'release', 'agi'), staged);
  chmodSync(staged, 0o755);
}
