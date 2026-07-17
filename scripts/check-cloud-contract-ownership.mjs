#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const errors = [];
const cloudPackagePath = 'packages/contracts/cloud-contracts';
const oldCloudPath = 'packages/services/src/cloud-contracts';
const cloudPackageName = '@agiworkforce/cloud-contracts';
const servicesPackageName = '@agiworkforce/services';

const cloudModules = [
  'generated-files',
  'library',
  'managed-media',
  'me',
  'sync',
  'managed-cloud-settings-client',
  'projects',
  'managed-cloud-projects-client',
  'conversations',
  'managed-cloud-chat-client',
  'tool-events',
  'tool-approval-resume',
  'connectors',
  'capability-handshake',
];

const cloudMovedFiles = [
  '__fixtures__/chat-memory-sync-cas.golden.json',
  '__fixtures__/managed-media-requests.golden.json',
  '__fixtures__/me-response.golden.json',
  '__fixtures__/projects-sync-cas.golden.json',
  '__tests__/connectors.test.ts',
  '__tests__/conversations.test.ts',
  '__tests__/generated-files.test.ts',
  '__tests__/library.test.ts',
  '__tests__/managed-cloud-chat-client.test.ts',
  '__tests__/managed-cloud-projects-client.test.ts',
  '__tests__/managed-cloud-settings-client.test.ts',
  '__tests__/managed-media.test.ts',
  '__tests__/me.test.ts',
  '__tests__/sync.test.ts',
  '__tests__/tool-approval-resume.test.ts',
  '__tests__/tool-events.test.ts',
  '__tests__/capability-handshake.test.ts',
  ...cloudModules.map((moduleName) => `${moduleName}.ts`),
];

const policyFixtureFiles = [
  'README.md',
  'manifest.json',
  'forged-key.agipolicy',
  'malformed-schema.agipolicy',
  'not-yet-valid.agipolicy',
  'org-mismatch.agipolicy',
  'over-granting.agipolicy',
  'tampered.agipolicy',
  'valid-tightening.agipolicy',
  'valid-unrestricted.agipolicy',
];

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
  return (
    actual.length === expected.length &&
    [...actual].sort().every((value, index) => value === [...expected].sort()[index])
  );
}

function dependency(packageJson, name) {
  return packageJson?.dependencies?.[name];
}

function dependencyInAnySection(packageJson, name) {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
    (section) => Boolean(packageJson?.[section]?.[name]),
  );
}

function requireWorkspaceDependency(packageJson, owner, name) {
  if (packageJson?.dependencies?.[name] !== 'workspace:*') {
    errors.push(`${owner} must directly depend on ${name} with workspace:*`);
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

function collectExportedNames() {
  const names = new Set();
  for (const moduleName of cloudModules) {
    const relativePath = `${cloudPackagePath}/src/${moduleName}.ts`;
    if (!exists(relativePath)) continue;
    const source = readText(relativePath);
    const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      const exported = statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!exported) continue;
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

function scanForCloudImportsFromServices(cloudExports) {
  function moduleName(node) {
    return ts.isStringLiteral(node) ? node.text : null;
  }

  function importTypeQualifierName(node) {
    if (!node) return null;
    let current = node;
    while (ts.isQualifiedName(current)) current = current.left;
    return ts.isIdentifier(current) ? current.text : null;
  }

  function containingVariableDeclaration(node) {
    let current = node.parent;
    while (current && !ts.isVariableDeclaration(current) && !ts.isSourceFile(current)) {
      current = current.parent;
    }
    return current && ts.isVariableDeclaration(current) ? current : null;
  }

  for (const scanRoot of ['apps/web', 'apps/desktop', 'apps/mobile']) {
    for (const relativePath of walk(scanRoot)) {
      if (!sourceExtensions.has(path.extname(relativePath))) continue;
      const source = readText(relativePath);
      const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);

      function visit(node) {
        if (
          ts.isImportDeclaration(node) &&
          moduleName(node.moduleSpecifier) === servicesPackageName
        ) {
          const bindings = node.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              const importedName = (element.propertyName ?? element.name).text;
              if (!cloudExports.has(importedName)) continue;
              errors.push(
                `${relativePath} imports cloud-contract symbol ${importedName} from ${servicesPackageName}`,
              );
            }
          } else {
            errors.push(
              `${relativePath} uses an opaque default/namespace import from ${servicesPackageName}`,
            );
          }
        }

        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          moduleName(node.moduleSpecifier) === servicesPackageName &&
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          for (const element of node.exportClause.elements) {
            const importedName = (element.propertyName ?? element.name).text;
            if (!cloudExports.has(importedName)) continue;
            errors.push(
              `${relativePath} re-exports cloud-contract symbol ${importedName} from ${servicesPackageName}`,
            );
          }
        }

        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          moduleName(node.argument.literal) === servicesPackageName
        ) {
          const importedName = importTypeQualifierName(node.qualifier);
          if (importedName && cloudExports.has(importedName)) {
            errors.push(
              `${relativePath} imports cloud-contract type ${importedName} from ${servicesPackageName}`,
            );
          }
        }

        if (
          ts.isCallExpression(node) &&
          node.arguments.length === 1 &&
          moduleName(node.arguments[0]) === servicesPackageName &&
          ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
            node.expression.kind === ts.SyntaxKind.ImportKeyword)
        ) {
          const declaration = containingVariableDeclaration(node);
          if (declaration?.name && ts.isObjectBindingPattern(declaration.name)) {
            for (const element of declaration.name.elements) {
              const importedName =
                element.propertyName?.getText(sourceFile) ?? element.name.getText(sourceFile);
              if (!cloudExports.has(importedName)) continue;
              errors.push(
                `${relativePath} requires cloud-contract symbol ${importedName} from ${servicesPackageName}`,
              );
            }
          } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            errors.push(
              `${relativePath} uses an opaque dynamic import from ${servicesPackageName}`,
            );
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }
  }
}

function scanCurrentSourceForRetiredPath() {
  for (const scanRoot of ['apps', 'packages', 'crates', 'services']) {
    for (const relativePath of walk(scanRoot)) {
      const extension = path.extname(relativePath);
      if (!sourceExtensions.has(extension) && extension !== '.rs') continue;
      if (readText(relativePath).includes('packages/services/src/cloud-contracts')) {
        errors.push(`${relativePath} retains the retired Services cloud-contract path`);
      }
    }
  }
}

function scanPackageBoundaryImports() {
  function importsPackage(relativePath, packageName) {
    const source = readText(relativePath);
    const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
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

  for (const relativePath of walk(`${cloudPackagePath}/src`)) {
    if (!sourceExtensions.has(path.extname(relativePath))) continue;
    for (const forbidden of [servicesPackageName, '@agiworkforce/licensing']) {
      if (importsPackage(relativePath, forbidden)) {
        errors.push(`${relativePath} must not import ${forbidden}`);
      }
    }
  }
  for (const relativePath of walk('packages/contracts/licensing/src')) {
    if (!sourceExtensions.has(path.extname(relativePath))) continue;
    if (importsPackage(relativePath, servicesPackageName)) {
      errors.push(`${relativePath} must not import ${servicesPackageName}`);
    }
  }
}

function licensingOrgPolicyExports() {
  const result = new Set();
  const relativePath = 'packages/contracts/licensing/src/index.ts';
  if (!exists(relativePath)) return result;
  const sourceFile = ts.createSourceFile(
    relativePath,
    readText(relativePath),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== './org-policy' ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      result.add((element.propertyName ?? element.name).text);
    }
  }
  return result;
}

const cloudBasename = path.posix.basename(cloudPackagePath);
const caseVariants = fs
  .readdirSync(absolute(path.posix.dirname(cloudPackagePath)))
  .filter((entry) => entry.toLowerCase() === cloudBasename.toLowerCase());
if (!sameMembers(caseVariants, [cloudBasename])) {
  errors.push(
    `Expected exactly ${cloudPackagePath} with canonical casing; found ${JSON.stringify(caseVariants)}`,
  );
}

const packageNameVariants = walk('packages')
  .filter((relativePath) => relativePath.endsWith('/package.json'))
  .map((relativePath) => ({ relativePath, manifest: readJson(relativePath) }))
  .filter(({ manifest }) => manifest?.name?.toLowerCase() === cloudPackageName.toLowerCase());
if (
  packageNameVariants.length !== 1 ||
  packageNameVariants[0]?.relativePath !== `${cloudPackagePath}/package.json` ||
  packageNameVariants[0]?.manifest?.name !== cloudPackageName
) {
  errors.push(
    `Expected one canonical ${cloudPackageName} manifest; found ${JSON.stringify(
      packageNameVariants.map(({ relativePath, manifest }) => ({
        relativePath,
        name: manifest?.name,
      })),
    )}`,
  );
}

if (exists(oldCloudPath)) {
  errors.push(`Legacy cloud-contract owner must be removed: ${oldCloudPath}`);
}

for (const relativePath of [
  `${cloudPackagePath}/package.json`,
  `${cloudPackagePath}/README.md`,
  `${cloudPackagePath}/tsconfig.json`,
  `${cloudPackagePath}/vitest.config.ts`,
  `${cloudPackagePath}/src/index.ts`,
  'packages/contracts/licensing/src/org-policy.ts',
  'packages/contracts/licensing/src/__tests__/org-policy.test.ts',
]) {
  requireFile(relativePath);
}
for (const relativePath of cloudMovedFiles) requireFile(`${cloudPackagePath}/src/${relativePath}`);
for (const relativePath of policyFixtureFiles) {
  requireFile(`packages/contracts/licensing/src/__fixtures__/org-policy/${relativePath}`);
}
for (const retiredPolicyPath of [
  `${cloudPackagePath}/src/org-policy.ts`,
  `${cloudPackagePath}/src/__tests__/org-policy.test.ts`,
  `${cloudPackagePath}/src/__fixtures__/org-policy`,
]) {
  if (exists(retiredPolicyPath)) errors.push(`Org-policy must not remain in ${retiredPolicyPath}`);
}

const cloudManifest = exists(`${cloudPackagePath}/package.json`)
  ? readJson(`${cloudPackagePath}/package.json`)
  : null;
if (cloudManifest) {
  if (cloudManifest.name !== cloudPackageName) {
    errors.push(`${cloudPackagePath}/package.json must use package name ${cloudPackageName}`);
  }
  if (cloudManifest.exports?.['.'] !== './src/index.ts') {
    errors.push(`${cloudPackageName} root export must resolve to ./src/index.ts`);
  }
  const productionDependencies = Object.keys(cloudManifest.dependencies ?? {});
  if (!sameMembers(productionDependencies, ['@agiworkforce/types', 'zod'])) {
    errors.push(
      `${cloudPackageName} production dependencies must be exactly @agiworkforce/types and zod`,
    );
  }
  requireWorkspaceDependency(cloudManifest, cloudPackageName, '@agiworkforce/types');
  if (
    dependencyInAnySection(cloudManifest, servicesPackageName) ||
    dependencyInAnySection(cloudManifest, '@agiworkforce/licensing')
  ) {
    errors.push(`${cloudPackageName} must not depend on Services or licensing`);
  }
  for (const script of ['typecheck', 'test', 'lint']) {
    if (!cloudManifest.scripts?.[script])
      errors.push(`${cloudPackageName} is missing ${script} script`);
  }
}

if (exists(`${cloudPackagePath}/src/index.ts`)) {
  const actualModules = [
    ...readText(`${cloudPackagePath}/src/index.ts`).matchAll(
      /export \* from ['"]\.\/([^'"]+)['"]/g,
    ),
  ].map((match) => match[1]);
  if (JSON.stringify(actualModules) !== JSON.stringify(cloudModules)) {
    errors.push(`${cloudPackageName} index exports must match the canonical module order`);
  }
}

const licensingManifest = readJson('packages/contracts/licensing/package.json');
if (licensingManifest) {
  if (licensingManifest.exports?.['./org-policy'] !== './src/org-policy.ts') {
    errors.push('@agiworkforce/licensing must export ./org-policy from ./src/org-policy.ts');
  }
  if (dependencyInAnySection(licensingManifest, servicesPackageName)) {
    errors.push('@agiworkforce/licensing must not depend on Services');
  }
}

if (exists('packages/contracts/licensing/src/org-policy.ts')) {
  const source = readText('packages/contracts/licensing/src/org-policy.ts');
  if (source.includes("from '@agiworkforce/licensing'")) {
    errors.push(
      'packages/contracts/licensing/src/org-policy.ts must use local container/claims imports',
    );
  }
  for (const localImport of ["from './container'", "from './claims'"]) {
    if (!source.includes(localImport)) errors.push(`org-policy.ts must import ${localImport}`);
  }
}
if (exists('packages/contracts/licensing/src/__tests__/org-policy.test.ts')) {
  const source = readText('packages/contracts/licensing/src/__tests__/org-policy.test.ts');
  if (source.includes("from '@agiworkforce/licensing'")) {
    errors.push('org-policy.test.ts must use a local claims import');
  }
}

const expectedPolicyExports = [
  'POLICY_CONTAINER_FORMAT',
  'OrgPolicyByokSchema',
  'OrgPolicyByok',
  'OrgPolicyEgressSchema',
  'OrgPolicyAuditExportSchema',
  'OrgPolicySchema',
  'OrgPolicy',
  'PolicyPermissions',
  'DEFAULT_POLICY_BASELINE',
  'TighteningResult',
  'checkPolicyTightening',
  'OrgPolicyErrorCode',
  'OrgPolicyError',
  'OrgPolicyVerifyResult',
  'VerifyOrgPolicyOptions',
  'verifyOrgPolicy',
];
const actualPolicyExports = licensingOrgPolicyExports();
for (const expectedExport of expectedPolicyExports) {
  if (!actualPolicyExports.has(expectedExport)) {
    errors.push(
      `packages/contracts/licensing/src/index.ts must export org-policy symbol ${expectedExport}`,
    );
  }
}

requireIncludes('packages/contracts/licensing/src/index.ts', "from './org-policy'");
requireIncludes(
  'packages/contracts/licensing/scripts/generate-fixtures.ts',
  "from '../src/org-policy'",
);
requireIncludes(
  'packages/contracts/licensing/scripts/generate-fixtures.ts',
  "const policyFixturesDir = join(here, '..', 'src', '__fixtures__', 'org-policy');",
);
if (
  exists('packages/contracts/licensing/scripts/generate-fixtures.ts') &&
  /const\s+POLICY_CONTAINER_FORMAT\s*=\s*['"]agipolicy-v1['"]/.test(
    readText('packages/contracts/licensing/scripts/generate-fixtures.ts'),
  )
) {
  errors.push('Fixture generation must import POLICY_CONTAINER_FORMAT instead of hardcoding it');
}

// The @agiworkforce/services compatibility facade was deleted at M8
// (2026-07-15); only anti-regression checks on the name remain elsewhere in
// this script. The facade directory must not reappear.
if (exists('packages/services')) {
  errors.push('packages/services facade was deleted at M8 and must not reappear');
}

for (const rustFile of [
  'apps/desktop/src-tauri/src/data/cloud_sync.rs',
  'apps/desktop/src-tauri/src/data/memory_sync.rs',
  'apps/desktop/src-tauri/src/data/projects_sync.rs',
  'apps/desktop/src-tauri/src/sys/commands/media.rs',
  'crates/agiworkforce-licensing/src/tests.rs',
]) {
  if (exists(rustFile) && readText(rustFile).includes('packages/services/src/cloud-contracts')) {
    errors.push(`${rustFile} retains a fixture path owned by Services`);
  }
}

for (const appPackage of ['apps/web', 'apps/desktop', 'apps/mobile']) {
  const manifest = readJson(`${appPackage}/package.json`);
  if (manifest)
    requireWorkspaceDependency(manifest, `${appPackage}/package.json`, cloudPackageName);
}

const cloudExports = collectExportedNames();
if (cloudExports.size > 0) scanForCloudImportsFromServices(cloudExports);
scanCurrentSourceForRetiredPath();
scanPackageBoundaryImports();

if (exists('pnpm-lock.yaml')) {
  const lockfile = readText('pnpm-lock.yaml');
  for (const [importer, requiredDependencies] of [
    ['packages/contracts/cloud-contracts', ['@agiworkforce/types', 'zod']],
    ['apps/web', [cloudPackageName]],
    ['apps/desktop', [cloudPackageName]],
    ['apps/mobile', [cloudPackageName]],
  ]) {
    const block = importerBlock(lockfile, importer);
    if (!block) {
      errors.push(`pnpm-lock.yaml is missing importer ${importer}`);
      continue;
    }
    for (const requiredDependency of requiredDependencies) {
      if (
        !block.includes(`'${requiredDependency}':`) &&
        !block.includes(`${requiredDependency}:`)
      ) {
        errors.push(`pnpm-lock.yaml importer ${importer} is missing ${requiredDependency}`);
      }
    }
  }

  for (const [importer, dependencyName, relativeTarget] of [
    ['packages/contracts/cloud-contracts', '@agiworkforce/types', '../types'],
    ['apps/web', cloudPackageName, '../../packages/contracts/cloud-contracts'],
    ['apps/desktop', cloudPackageName, '../../packages/contracts/cloud-contracts'],
    ['apps/mobile', cloudPackageName, '../../packages/contracts/cloud-contracts'],
  ]) {
    const block = importerBlock(lockfile, importer);
    if (block && !lockWorkspaceLink(block, dependencyName, relativeTarget)) {
      errors.push(
        `pnpm-lock.yaml importer ${importer} must link ${dependencyName} to ${relativeTarget}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Cloud-contract ownership check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Cloud-contract ownership check passed.');
