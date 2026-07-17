#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const trustPath = 'packages/contracts/trust-boundaries';
const searchPath = 'packages/ai/search';
const routingPath = 'packages/ai/routing';
const trustPackage = '@agiworkforce/trust-boundaries';
const searchPackage = '@agiworkforce/search';
const routingPackage = '@agiworkforce/routing';
const servicesPackage = '@agiworkforce/services';

const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.expo',
  '.vercel',
]);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    errors.push(`${relativePath} is missing or invalid JSON: ${error.message}`);
    return null;
  }
}

function walk(relativeDirectory, files = []) {
  const directory = absolute(relativeDirectory);
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) walk(relativePath, files);
    else files.push(relativePath);
  }
  return files;
}

function sameMembers(actual, expected) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return (
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((value, index) => value === sortedExpected[index])
  );
}

function requireFile(relativePath) {
  if (!exists(relativePath)) errors.push(`Missing canonical file: ${relativePath}`);
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing canonical file: ${relativePath}`);
    return;
  }
  if (!readText(relativePath).includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function dependencyInAnySection(manifest, name) {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
    (section) => Boolean(manifest?.[section]?.[name]),
  );
}

function requireWorkspaceDependency(manifest, owner, name, section = 'dependencies') {
  if (manifest?.[section]?.[name] !== 'workspace:*') {
    errors.push(`${owner} must directly depend on ${name} with workspace:* in ${section}`);
  }
}

function importerBlock(lockfile, importer) {
  const escaped = importer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = lockfile.match(
    new RegExp(`^  ${escaped}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`, 'm'),
  );
  return match?.[1] ?? '';
}

function lockWorkspaceLink(block, dependencyName, relativeTarget) {
  const escapedName = dependencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedTarget = relativeTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:'${escapedName}'|${escapedName}):\\n\\s+specifier: workspace:\\*\\n\\s+version: link:${escapedTarget}(?:\\n|$)`,
  ).test(block);
}

function requireCanonicalPackage(relativePath, packageName) {
  const expectedDirectory = path.posix.basename(relativePath);
  const caseVariants = fs
    .readdirSync(absolute(path.posix.dirname(relativePath)))
    .filter((entry) => entry.toLowerCase() === expectedDirectory.toLowerCase());
  if (!sameMembers(caseVariants, [expectedDirectory])) {
    errors.push(
      `Expected exactly ${relativePath} with canonical casing; found ${JSON.stringify(caseVariants)}`,
    );
  }

  const packageVariants = walk('packages')
    .filter((candidate) => candidate.endsWith('/package.json'))
    .map((candidate) => ({ candidate, manifest: readJson(candidate) }))
    .filter(({ manifest }) => manifest?.name?.toLowerCase() === packageName.toLowerCase());
  if (
    packageVariants.length !== 1 ||
    packageVariants[0]?.candidate !== `${relativePath}/package.json` ||
    packageVariants[0]?.manifest?.name !== packageName
  ) {
    errors.push(`Expected one canonical ${packageName} manifest at ${relativePath}/package.json`);
  }
}

for (const [canonicalPath, canonicalPackage] of [
  [trustPath, trustPackage],
  [searchPath, searchPackage],
]) {
  requireCanonicalPackage(canonicalPath, canonicalPackage);
}

for (const relativePath of [
  `${trustPath}/package.json`,
  `${trustPath}/README.md`,
  `${trustPath}/tsconfig.json`,
  `${trustPath}/vitest.config.ts`,
  `${trustPath}/src/index.ts`,
  `${trustPath}/src/egress-policy.ts`,
  `${trustPath}/src/__tests__/egress-policy.test.ts`,
  `${searchPath}/package.json`,
  `${searchPath}/README.md`,
  `${searchPath}/tsconfig.json`,
  `${searchPath}/vitest.config.ts`,
  `${searchPath}/src/index.ts`,
  `${searchPath}/src/web-search-support.ts`,
  `${searchPath}/src/__tests__/web-search-support.test.ts`,
  `${routingPath}/src/model-switch-cache.ts`,
  `${routingPath}/src/__tests__/model-switch-cache.test.ts`,
]) {
  requireFile(relativePath);
}

// The @agiworkforce/services compatibility facade was deleted at M8
// (2026-07-15). Only the anti-regression checks below remain: nothing may
// depend on or import the facade name, and the facade directory must not
// reappear.
if (exists('packages/services')) {
  errors.push('packages/services facade was deleted at M8 and must not reappear');
}

const trustManifest = readJson(`${trustPath}/package.json`);
if (trustManifest) {
  if (trustManifest.name !== trustPackage) {
    errors.push(`${trustPath}/package.json must use package name ${trustPackage}`);
  }
  if (trustManifest.exports?.['.'] !== './src/index.ts') {
    errors.push(`${trustPackage} root export must resolve to ./src/index.ts`);
  }
  if (!sameMembers(Object.keys(trustManifest.dependencies ?? {}), [])) {
    errors.push(`${trustPackage} must have zero production dependencies`);
  }
  if (dependencyInAnySection(trustManifest, servicesPackage)) {
    errors.push(`${trustPackage} must not depend on ${servicesPackage}`);
  }
}

const searchManifest = readJson(`${searchPath}/package.json`);
if (searchManifest) {
  if (searchManifest.name !== searchPackage) {
    errors.push(`${searchPath}/package.json must use package name ${searchPackage}`);
  }
  if (searchManifest.exports?.['.'] !== './src/index.ts') {
    errors.push(`${searchPackage} root export must resolve to ./src/index.ts`);
  }
  if (!sameMembers(Object.keys(searchManifest.dependencies ?? {}), ['@agiworkforce/types'])) {
    errors.push(`${searchPackage} production dependency set has drifted`);
  }
  requireWorkspaceDependency(searchManifest, `${searchPath}/package.json`, '@agiworkforce/types');
  if (dependencyInAnySection(searchManifest, servicesPackage)) {
    errors.push(`${searchPackage} must not depend on ${servicesPackage}`);
  }
}

const routingManifest = readJson(`${routingPath}/package.json`);
if (routingManifest) {
  if (
    !sameMembers(Object.keys(routingManifest.dependencies ?? {}), [
      '@agiworkforce/model-registry',
      '@agiworkforce/types',
    ])
  ) {
    errors.push(`${routingPackage} production dependency set has drifted`);
  }
  if (dependencyInAnySection(routingManifest, servicesPackage)) {
    errors.push(`${routingPackage} must not depend on ${servicesPackage}`);
  }
}

for (const script of ['build', 'typecheck', 'test', 'lint']) {
  if (!trustManifest?.scripts?.[script]) errors.push(`${trustPackage} is missing ${script}`);
  if (!searchManifest?.scripts?.[script]) errors.push(`${searchPackage} is missing ${script}`);
}

requireIncludes(`${trustPath}/src/index.ts`, `export * from './egress-policy'`);
requireIncludes(`${searchPath}/src/index.ts`, `export * from './web-search-support'`);
requireIncludes(`${routingPath}/src/index.ts`, `from './model-switch-cache'`);

for (const [appPath, requiredDependencies] of [
  ['apps/web', [routingPackage, searchPackage]],
  ['apps/desktop', [routingPackage, trustPackage]],
  ['apps/mobile', [routingPackage, trustPackage]],
]) {
  const manifest = readJson(`${appPath}/package.json`);
  for (const dependency of requiredDependencies) {
    requireWorkspaceDependency(manifest, `${appPath}/package.json`, dependency);
  }
  if (dependencyInAnySection(manifest, servicesPackage)) {
    errors.push(`${appPath}/package.json must not depend on the ${servicesPackage} facade`);
  }
}

for (const relativePath of walk('apps')) {
  if (!sourceExtensions.has(path.extname(relativePath))) continue;
  const source = readText(relativePath);
  if (
    source.includes(`'${servicesPackage}'`) ||
    source.includes(`"${servicesPackage}"`) ||
    source.includes(`${servicesPackage}/`)
  ) {
    errors.push(`${relativePath} must import a canonical M5 owner, not ${servicesPackage}`);
  }
}

for (const relativePath of walk('apps').filter((candidate) =>
  candidate.endsWith('/package.json'),
)) {
  const manifest = readJson(relativePath);
  if (dependencyInAnySection(manifest, servicesPackage)) {
    errors.push(`${relativePath} must not depend on the ${servicesPackage} facade`);
  }
}

for (const scanRoot of [trustPath, searchPath, routingPath]) {
  for (const relativePath of walk(scanRoot)) {
    if (!sourceExtensions.has(path.extname(relativePath))) continue;
    const source = readText(relativePath);
    if (source.includes(servicesPackage) || source.includes('packages/services/src/')) {
      errors.push(`${relativePath} reverses the canonical owner -> facade boundary`);
    }
  }
}

for (const scanRoot of ['apps', 'packages', 'crates', 'services']) {
  for (const relativePath of walk(scanRoot)) {
    if (![...sourceExtensions, '.rs'].includes(path.extname(relativePath))) continue;
    const source = readText(relativePath);
    for (const retiredMarker of [
      'packages/services/src/egress-policy',
      'packages/services/src/model-switch-cache',
      'packages/services/src/web-search-support',
    ]) {
      if (source.includes(retiredMarker)) {
        errors.push(`${relativePath} retains retired ownership path ${retiredMarker}`);
      }
    }
  }
}

requireIncludes('apps/desktop/src/lib/egressGuard.ts', `from '${trustPackage}'`);
requireIncludes('apps/mobile/lib/egressGuard.ts', `from '${trustPackage}'`);
requireIncludes(
  'apps/web/features/chat/components/Composer/ComposerFooter.tsx',
  `from '${routingPackage}'`,
);
requireIncludes(
  'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts',
  `from '${searchPackage}'`,
);
requireIncludes('apps/web/lib/web-search-support.ts', `from '${searchPackage}'`);

if (exists('apps/desktop/vite.config.ts')) {
  requireIncludes('apps/desktop/vite.config.ts', `'${trustPackage}'`);
  if (readText('apps/desktop/vite.config.ts').includes(`'${servicesPackage}'`)) {
    errors.push('apps/desktop/vite.config.ts must not retain the Services alias');
  }
}

if (exists('apps/mobile/jest.config.js')) {
  requireIncludes('apps/mobile/jest.config.js', trustPackage);
  if (readText('apps/mobile/jest.config.js').includes(servicesPackage)) {
    errors.push('apps/mobile/jest.config.js must not retain Services transforms or mappings');
  }
}

if (exists('pnpm-lock.yaml')) {
  const lockfile = readText('pnpm-lock.yaml');
  for (const [importer, dependencies] of [
    [trustPath, []],
    [searchPath, ['@agiworkforce/types']],
    ['apps/web', [routingPackage, searchPackage]],
    ['apps/desktop', [routingPackage, trustPackage]],
    ['apps/mobile', [routingPackage, trustPackage]],
  ]) {
    const block = importerBlock(lockfile, importer);
    if (!block) {
      errors.push(`pnpm-lock.yaml is missing importer ${importer}`);
      continue;
    }
    for (const dependency of dependencies) {
      if (!block.includes(`'${dependency}':`) && !block.includes(`${dependency}:`)) {
        errors.push(`pnpm-lock.yaml importer ${importer} is missing ${dependency}`);
      }
    }
    if (['apps/web', 'apps/desktop', 'apps/mobile'].includes(importer)) {
      if (block.includes(`'${servicesPackage}':`) || block.includes(`${servicesPackage}:`)) {
        errors.push(`pnpm-lock.yaml importer ${importer} must not retain ${servicesPackage}`);
      }
    }
  }

  for (const [importer, dependency, target] of [
    [searchPath, '@agiworkforce/types', '../../contracts/types'],
    ['apps/web', searchPackage, '../../packages/ai/search'],
    ['apps/desktop', trustPackage, '../../packages/contracts/trust-boundaries'],
    ['apps/mobile', trustPackage, '../../packages/contracts/trust-boundaries'],
  ]) {
    const block = importerBlock(lockfile, importer);
    if (block && !lockWorkspaceLink(block, dependency, target)) {
      errors.push(`pnpm-lock.yaml importer ${importer} must link ${dependency} to ${target}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Service-domain ownership check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Service-domain ownership check passed.');
