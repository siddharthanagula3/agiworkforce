#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const npmDir = resolve(here, '..');
const repoRoot = resolve(npmDir, '../../..');
const pkg = JSON.parse(readFileSync(join(npmDir, 'package.json'), 'utf8'));

const platforms = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
];

const errors = [];

function requireCondition(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

requireCondition(pkg.name === '@agiworkforce/cli', 'package name must be @agiworkforce/cli');
requireCondition(Boolean(pkg.version), 'package version is required');
requireCondition(pkg.bin?.agi === 'bin/agi.js', 'bin.agi must point to bin/agi.js');
requireCondition(
  pkg.bin?.agiworkforce === 'bin/agiworkforce.js',
  'bin.agiworkforce must point to bin/agiworkforce.js',
);

for (const file of ['bin/agi.js', 'bin/agiworkforce.js', 'README.md']) {
  requireCondition(existsSync(join(npmDir, file)), `missing ${file}`);
}

for (const entry of ['bin', 'vendor', 'README.md']) {
  requireCondition(pkg.files?.includes(entry), `package files must include ${entry}`);
}

for (const platform of platforms) {
  const dep = `@agiworkforce/cli-${platform}`;
  requireCondition(
    pkg.optionalDependencies?.[dep] === pkg.version,
    `optional dependency ${dep} must equal package version ${pkg.version}`,
  );
}

if (process.argv.includes('--staged')) {
  const distDir = join(repoRoot, 'dist', 'cli');
  if (!existsSync(distDir) && process.env.CI !== 'true') {
    console.log(`staged package check skipped: ${distDir} does not exist outside CI`);
  } else {
    for (const platform of platforms) {
      const name = platform.startsWith('win32-') ? 'agi.exe' : 'agi';
      const path = join(distDir, platform, 'bin', name);
      requireCondition(existsSync(path), `missing staged binary ${path}`);
    }
  }
}

if (errors.length > 0) {
  console.error('npm package check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('npm package check passed');
