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

// The README ships to every installer, so a claim in it is a promise. Each
// entry below was advertised at some point and did not resolve: the installer
// URL and the Homebrew tap 404, the two doc paths name files that are not in
// the repo, and `agi mcp-server` answers tools/list with an empty set, so
// calling the CLI an MCP server tells users to wire up something inert.
// Re-add a line here only once the thing it describes actually works.
const readme = readFileSync(join(npmDir, 'README.md'), 'utf8');
const forbiddenReadmeClaims = [
  ['agiworkforce.com/install.sh', 'no install.sh is published at that URL'],
  ['brew install', 'the Homebrew tap does not exist'],
  ['agiworkforce/tap', 'the Homebrew tap does not exist'],
  ['ARCHITECTURE.md', 'apps/cli/ARCHITECTURE.md is not in the repository'],
  ['AGI_WORKFORCE.md', 'AGI_WORKFORCE.md is not in the repository'],
  ['and an MCP server', '`agi mcp-server` exposes no tools'],
];
for (const [needle, why] of forbiddenReadmeClaims) {
  requireCondition(!readme.includes(needle), `README.md must not advertise "${needle}": ${why}`);
}

requireCondition(
  readme.includes(`npm install -g ${pkg.name}`),
  `README.md must document the one install path that resolves: npm install -g ${pkg.name}`,
);

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
