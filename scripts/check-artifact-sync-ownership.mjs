#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const errors = [];
const artifactsPath = 'packages/platform/artifacts';
const syncPath = 'packages/client/sync';
const servicesPath = 'packages/services';
const storesPath = 'packages/stores';
const artifactsPackage = '@agiworkforce/artifacts';
const syncPackage = '@agiworkforce/sync';
const servicesPackage = '@agiworkforce/services';
const storesPackage = '@agiworkforce/stores';

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

function collectExportedNames(relativeFiles) {
  const names = new Set();
  for (const relativePath of relativeFiles) {
    if (!exists(relativePath)) continue;
    const sourceFile = ts.createSourceFile(
      relativePath,
      readText(relativePath),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of sourceFile.statements) {
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if ('name' in statement && statement.name && ts.isIdentifier(statement.name)) {
        names.add(statement.name.text);
      }
    }
  }
  return names;
}

function scanCompatibilityImports(retiredExports) {
  function moduleName(node) {
    return ts.isStringLiteral(node) ? node.text : null;
  }

  function importTypeQualifierName(node) {
    let current = node;
    while (current && ts.isQualifiedName(current)) current = current.left;
    return current && ts.isIdentifier(current) ? current.text : null;
  }

  for (const scanRoot of ['apps/web', 'apps/desktop', 'apps/mobile']) {
    for (const relativePath of walk(scanRoot)) {
      if (!sourceExtensions.has(path.extname(relativePath))) continue;
      const sourceFile = ts.createSourceFile(
        relativePath,
        readText(relativePath),
        ts.ScriptTarget.Latest,
        true,
      );

      function visit(node) {
        if (
          ts.isImportDeclaration(node) &&
          [servicesPackage, storesPackage].includes(moduleName(node.moduleSpecifier))
        ) {
          const sourcePackage = moduleName(node.moduleSpecifier);
          const bindings = node.importClause?.namedBindings;
          if (!bindings || !ts.isNamedImports(bindings)) {
            errors.push(`${relativePath} uses an opaque import from ${sourcePackage}`);
          } else {
            for (const element of bindings.elements) {
              const importedName = (element.propertyName ?? element.name).text;
              if (retiredExports.has(importedName)) {
                errors.push(
                  `${relativePath} imports canonical artifact/sync symbol ${importedName} from ${sourcePackage}`,
                );
              }
            }
          }
        }

        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          [servicesPackage, storesPackage].includes(moduleName(node.argument.literal))
        ) {
          const importedName = importTypeQualifierName(node.qualifier);
          if (importedName && retiredExports.has(importedName)) {
            errors.push(
              `${relativePath} imports canonical artifact/sync type ${importedName} from ${moduleName(node.argument.literal)}`,
            );
          }
        }

        if (
          ts.isCallExpression(node) &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0]) &&
          [servicesPackage, storesPackage].includes(node.arguments[0].text) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
          const sourcePackage = node.arguments[0].text;
          let valueNode = node;
          if (ts.isAwaitExpression(valueNode.parent)) valueNode = valueNode.parent;
          const parent = valueNode.parent;
          let importedNames = null;

          if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
            importedNames = parent.name.elements
              .map((element) => element.propertyName ?? element.name)
              .filter(ts.isIdentifier)
              .map((identifier) => identifier.text);
          } else if (ts.isPropertyAccessExpression(parent) && parent.expression === valueNode) {
            importedNames = [parent.name.text];
          }

          if (!importedNames) {
            errors.push(`${relativePath} uses an opaque require/import() from ${sourcePackage}`);
          } else {
            for (const importedName of importedNames) {
              if (retiredExports.has(importedName)) {
                errors.push(
                  `${relativePath} imports canonical artifact/sync symbol ${importedName} from ${sourcePackage}`,
                );
              }
            }
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }
  }
}

function importsPackage(relativePath, packageName) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    readText(relativePath),
    ts.ScriptTarget.Latest,
    true,
  );
  let found = false;
  function visit(node) {
    if (
      ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === packageName) ||
      (ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal) &&
        node.argument.literal.text === packageName) ||
      (ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === packageName)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

for (const [canonicalPath, canonicalName] of [
  [artifactsPath, artifactsPackage],
  [syncPath, syncPackage],
]) {
  const expectedDirectory = path.posix.basename(canonicalPath);
  const caseVariants = fs
    .readdirSync(absolute(path.posix.dirname(canonicalPath)))
    .filter((entry) => entry.toLowerCase() === expectedDirectory.toLowerCase());
  if (!sameMembers(caseVariants, [expectedDirectory])) {
    errors.push(
      `Expected exactly ${canonicalPath} with canonical casing; found ${JSON.stringify(caseVariants)}`,
    );
  }

  const packageVariants = walk('packages')
    .filter((relativePath) => relativePath.endsWith('/package.json'))
    .map((relativePath) => ({ relativePath, manifest: readJson(relativePath) }))
    .filter(({ manifest }) => manifest?.name?.toLowerCase() === canonicalName.toLowerCase());
  if (
    packageVariants.length !== 1 ||
    packageVariants[0]?.relativePath !== `${canonicalPath}/package.json` ||
    packageVariants[0]?.manifest?.name !== canonicalName
  ) {
    errors.push(
      `Expected one canonical ${canonicalName} manifest at ${canonicalPath}/package.json`,
    );
  }
}

const artifactFiles = [
  'artifact-derivation.ts',
  'artifacts.ts',
  'artifact-sync.ts',
  'artifact-store.ts',
];
const syncFiles = [
  'cursor.ts',
  'conversations.ts',
  'messages.ts',
  'memory.ts',
  'projects.ts',
  'settings.ts',
];

for (const relativePath of [
  `${artifactsPath}/package.json`,
  `${artifactsPath}/tsconfig.json`,
  `${artifactsPath}/vitest.config.ts`,
  `${artifactsPath}/src/index.ts`,
  `${syncPath}/package.json`,
  `${syncPath}/tsconfig.json`,
  `${syncPath}/vitest.config.ts`,
  `${syncPath}/src/index.ts`,
]) {
  requireFile(relativePath);
}
for (const file of artifactFiles) requireFile(`${artifactsPath}/src/${file}`);
for (const file of syncFiles) requireFile(`${syncPath}/src/${file}`);
for (const fixture of ['cursor-compare.json', 'pull-apply.json', 'push-body.json']) {
  requireFile(`${syncPath}/src/__fixtures__/${fixture}`);
}

// The @agiworkforce/services and @agiworkforce/stores compatibility facades
// were deleted at M8 (2026-07-15). Only anti-regression checks remain: the
// directories must not reappear and nothing may import/depend on the names.
for (const retiredFacade of [servicesPath, storesPath]) {
  if (exists(retiredFacade)) {
    errors.push(`${retiredFacade} facade was deleted at M8 and must not reappear`);
  }
}

const artifactsManifest = readJson(`${artifactsPath}/package.json`);
if (artifactsManifest) {
  if (artifactsManifest.name !== artifactsPackage) {
    errors.push(`${artifactsPath}/package.json must use package name ${artifactsPackage}`);
  }
  if (artifactsManifest.exports?.['.'] !== './src/index.ts') {
    errors.push(`${artifactsPackage} root export must resolve to ./src/index.ts`);
  }
  if (
    !sameMembers(Object.keys(artifactsManifest.dependencies ?? {}), [
      '@agiworkforce/cloud-contracts',
      '@agiworkforce/types',
      'uuid',
      'zustand',
    ])
  ) {
    errors.push(`${artifactsPackage} production dependency set has drifted`);
  }
  for (const dependency of ['@agiworkforce/cloud-contracts', '@agiworkforce/types']) {
    requireWorkspaceDependency(artifactsManifest, `${artifactsPath}/package.json`, dependency);
  }
  for (const forbidden of [servicesPackage, storesPackage, syncPackage]) {
    if (dependencyInAnySection(artifactsManifest, forbidden)) {
      errors.push(`${artifactsPackage} must not depend on ${forbidden}`);
    }
  }
}

const syncManifest = readJson(`${syncPath}/package.json`);
if (syncManifest) {
  if (syncManifest.name !== syncPackage) {
    errors.push(`${syncPath}/package.json must use package name ${syncPackage}`);
  }
  if (syncManifest.exports?.['.'] !== './src/index.ts') {
    errors.push(`${syncPackage} root export must resolve to ./src/index.ts`);
  }
  if (
    !sameMembers(Object.keys(syncManifest.dependencies ?? {}), ['@agiworkforce/cloud-contracts'])
  ) {
    errors.push(`${syncPackage} production dependency set has drifted`);
  }
  requireWorkspaceDependency(
    syncManifest,
    `${syncPath}/package.json`,
    '@agiworkforce/cloud-contracts',
  );
  requireWorkspaceDependency(
    syncManifest,
    `${syncPath}/package.json`,
    artifactsPackage,
    'devDependencies',
  );
  for (const forbidden of [servicesPackage, storesPackage]) {
    if (dependencyInAnySection(syncManifest, forbidden)) {
      errors.push(`${syncPackage} must not depend on ${forbidden}`);
    }
  }
}

for (const script of ['build', 'typecheck', 'test', 'lint']) {
  if (!artifactsManifest?.scripts?.[script])
    errors.push(`${artifactsPackage} is missing ${script}`);
  if (!syncManifest?.scripts?.[script]) errors.push(`${syncPackage} is missing ${script}`);
}

for (const exported of [
  './artifact-derivation',
  './artifacts',
  './artifact-sync',
  './artifact-store',
]) {
  requireIncludes(`${artifactsPath}/src/index.ts`, `export * from '${exported}'`);
}
for (const exported of [
  './cursor',
  './conversations',
  './messages',
  './memory',
  './projects',
  './settings',
]) {
  requireIncludes(`${syncPath}/src/index.ts`, `export * from '${exported}'`);
}
for (const packageRoot of [`${artifactsPath}/src`, `${syncPath}/src`]) {
  for (const relativePath of walk(packageRoot)) {
    if (!sourceExtensions.has(path.extname(relativePath))) continue;
    for (const forbidden of [servicesPackage, storesPackage]) {
      if (importsPackage(relativePath, forbidden)) {
        errors.push(`${relativePath} must not import compatibility facade ${forbidden}`);
      }
    }
  }
}

const artifactExports = collectExportedNames(
  artifactFiles.map((file) => `${artifactsPath}/src/${file}`),
);
const syncExports = collectExportedNames(syncFiles.map((file) => `${syncPath}/src/${file}`));
scanCompatibilityImports(new Set([...artifactExports, ...syncExports]));

for (const [appPath, requiredDependencies] of [
  ['apps/web', [artifactsPackage]],
  ['apps/desktop', [artifactsPackage, syncPackage]],
  ['apps/mobile', [artifactsPackage, syncPackage]],
]) {
  const manifest = readJson(`${appPath}/package.json`);
  for (const dependency of requiredDependencies) {
    requireWorkspaceDependency(manifest, `${appPath}/package.json`, dependency);
  }
  if (dependencyInAnySection(manifest, storesPackage)) {
    errors.push(`${appPath}/package.json must not depend on the ${storesPackage} facade`);
  }
}

for (const scanRoot of ['apps', 'packages', 'crates', 'services']) {
  for (const relativePath of walk(scanRoot)) {
    if (![...sourceExtensions, '.rs'].includes(path.extname(relativePath))) continue;
    const source = readText(relativePath);
    for (const retiredMarker of [
      'packages/services/src/sync-apply',
      'packages/stores/src/artifacts',
    ]) {
      if (source.includes(retiredMarker)) {
        errors.push(`${relativePath} retains retired ownership path ${retiredMarker}`);
      }
    }
  }
}

requireIncludes(
  'apps/desktop/src-tauri/src/data/cloud_sync.rs',
  '../../../../../packages/client/sync/src/__fixtures__/pull-apply.json',
);
requireIncludes(
  'apps/desktop/src-tauri/src/data/cloud_sync.rs',
  '../../../../../packages/client/sync/src/__fixtures__/cursor-compare.json',
);

if (exists('pnpm-lock.yaml')) {
  const lockfile = readText('pnpm-lock.yaml');
  for (const [importer, dependencies] of [
    [artifactsPath, ['@agiworkforce/cloud-contracts', '@agiworkforce/types']],
    [syncPath, ['@agiworkforce/cloud-contracts', artifactsPackage]],
    ['apps/web', [artifactsPackage]],
    ['apps/desktop', [artifactsPackage, syncPackage]],
    ['apps/mobile', [artifactsPackage, syncPackage]],
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
  }

  for (const [importer, dependency, target] of [
    [artifactsPath, '@agiworkforce/cloud-contracts', '../../contracts/cloud-contracts'],
    [artifactsPath, '@agiworkforce/types', '../../contracts/types'],
    [syncPath, '@agiworkforce/cloud-contracts', '../../contracts/cloud-contracts'],
    [syncPath, artifactsPackage, '../../platform/artifacts'],
    ['apps/web', artifactsPackage, '../../packages/platform/artifacts'],
    ['apps/desktop', artifactsPackage, '../../packages/platform/artifacts'],
    ['apps/desktop', syncPackage, '../../packages/client/sync'],
    ['apps/mobile', artifactsPackage, '../../packages/platform/artifacts'],
    ['apps/mobile', syncPackage, '../../packages/client/sync'],
  ]) {
    const block = importerBlock(lockfile, importer);
    if (block && !lockWorkspaceLink(block, dependency, target)) {
      errors.push(`pnpm-lock.yaml importer ${importer} must link ${dependency} to ${target}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Artifact/sync ownership check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Artifact/sync ownership check passed.');
