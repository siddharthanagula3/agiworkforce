#!/usr/bin/env node
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredParts = new Set([
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
  'Pods',
  '.vercel',
  'dist-web',
  '.vscode-test',
  'public',
  'playwright-report',
  'test-results',
]);

const uiPackages = new Set(['@agiworkforce/unified-chat', '@agiworkforce/design-tokens']);

const MANAGED_COMPUTE_ROUTE_ROOT = 'apps/web/app/api';
const MANAGED_COMPUTE_ALLOWLIST_PATH = 'scripts/config/managed-compute-evaluator-allowlist.json';
const MANAGED_COMPUTE_EVALUATOR_MARKER = 'evaluateManagedComputeAccess';
const MANAGED_COMPUTE_START_MARKERS = ['reserveManagedUsageRequest', 'getE2BExecutor'];
const MANAGED_COMPUTE_EVALUATOR_PATTERN = new RegExp(`\\b${MANAGED_COMPUTE_EVALUATOR_MARKER}\\b`);
const MANAGED_COMPUTE_START_PATTERNS = MANAGED_COMPUTE_START_MARKERS.map(
  (marker) => new RegExp(`\\b${marker}\\b`),
);

/**
 * Vendor SDKs that may only be reached through the port adapter that owns them.
 * A second consumer means a second retry budget, a second credential
 * resolution, and a swap that has to visit every call site.
 */
const vendorAdapterOwnership = [
  {
    packages: ['@upstash/redis', '@upstash/ratelimit'],
    owner: 'packages/platform/key-value/src/adapters/upstash.ts',
    port: '@agiworkforce/key-value',
    alsoAllowed: [],
  },
  {
    packages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    owner: 'packages/platform/object-storage/src/adapters/s3.ts',
    port: '@agiworkforce/object-storage',
    alsoAllowed: ['packages/platform/object-storage/src/__tests__/fake-s3-endpoint.ts'],
  },
  {
    packages: ['@neondatabase/serverless'],
    owner: 'packages/platform/data-layer/src/adapters/neon.ts',
    port: '@agiworkforce/data-layer',
    alsoAllowed: [
      'packages/platform/data-layer/src/__tests__/adapter-contract.test.ts',
      'packages/platform/data-layer/src/__tests__/neon-adapter.test.ts',
      'packages/platform/data-layer/src/__tests__/neon-tls.test.ts',
      'packages/platform/data-layer/src/__tests__/neon-ws-proxy.test.ts',
      'services/signaling-server/src/db.ts',
    ],
  },
  /**
   * The two out-of-band scripts hold their own client on purpose. The RLS probe
   * is the independent check on the policies the adapter binds, so routing it
   * through that adapter would make it confirm its own premise rather than test
   * it, and neither script runs inside a request.
   */
  {
    packages: ['pg'],
    owner: 'packages/platform/data-layer/src/adapters/postgres.ts',
    port: '@agiworkforce/data-layer',
    alsoAllowed: [
      'packages/platform/data-layer/src/__tests__/adapter-contract.test.ts',
      'apps/web/scripts/rls-probe.mjs',
      'apps/web/scripts/route-cache-observability-report.mjs',
    ],
  },
];

const workspacePackages = new Map();

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectWorkspacePackages(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectWorkspacePackages(fullPath);
      continue;
    }

    if (entry.name !== 'package.json') continue;

    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!packageJson.name) continue;

    workspacePackages.set(packageJson.name, {
      relativePath: relativePath(fullPath),
      exportedSubpaths: exportedSubpaths(packageJson.exports),
    });
  }
}

function exportedSubpaths(exportsField) {
  if (!exportsField || typeof exportsField === 'string') {
    return new Set();
  }

  if (typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return new Set();
  }

  return new Set(
    Object.keys(exportsField)
      .filter((subpath) => subpath !== '.')
      .map((subpath) => subpath.replace(/^\.\//, '')),
  );
}

function stripComments(source) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line';
        out += '  ';
        i++;
      } else if (c === '/' && next === '*') {
        state = 'block';
        out += '  ';
        i++;
      } else if (c === "'") {
        state = 'sq';
        out += c;
      } else if (c === '"') {
        state = 'dq';
        out += c;
      } else if (c === '`') {
        state = 'tpl';
        out += c;
      } else {
        out += c;
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += c;
      } else {
        out += ' ';
      }
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i++;
      } else {
        out += c === '\n' ? '\n' : ' ';
      }
    } else {
      if (c === '\\') {
        out += c + (next ?? '');
        i++;
      } else if (
        (state === 'sq' && c === "'") ||
        (state === 'dq' && c === '"') ||
        (state === 'tpl' && c === '`')
      ) {
        state = 'code';
        out += c;
      } else {
        out += c;
      }
    }
  }
  return out;
}

{
  const s = stripComments;
  assert(!/from ['"]x['"]/.test(s('// import a from "x"')), 'line-comment import leaked');
  assert(!/from ['"]y['"]/.test(s('/* import b from "y" */')), 'block-comment import leaked');
  assert(/from ['"]z['"]/.test(s('import c from "z"; // real')), 'real import was stripped');
  assert(s("const u = 'a//b';").includes('a//b'), 'string content corrupted by stripper');
}

function importsFrom(rawSource) {
  const source = stripComments(rawSource);
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function relativePath(fullPath) {
  return path.relative(root, fullPath).split(path.sep).join('/');
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.normalize(path.resolve(path.dirname(file), specifier));
}

function appNameFromPath(relative) {
  const parts = relative.split('/');
  return parts[0] === 'apps' ? parts[1] : null;
}

const scanRoots = ['apps', 'packages', 'services']
  .map((dir) => path.join(root, dir))
  .filter((dir) => fs.existsSync(dir));

collectWorkspacePackages(path.join(root, 'packages'));

for (const scanRoot of scanRoots) {
  for (const file of walk(scanRoot)) {
    const rel = relativePath(file);
    const source = fs.readFileSync(file, 'utf8');
    const imports = importsFrom(source);

    for (const specifier of imports) {
      const resolved = resolveRelativeImport(file, specifier);

      if (rel.startsWith('apps/')) {
        const currentApp = appNameFromPath(rel);
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          const importedApp = appNameFromPath(resolvedRel);
          if (importedApp && importedApp !== currentApp) {
            errors.push(`${rel} imports another app via ${specifier}`);
          }
        }
        if (specifier.startsWith('apps/')) {
          errors.push(`${rel} imports another app via root path ${specifier}`);
        }
      }

      if (rel.startsWith('packages/')) {
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          if (resolvedRel.startsWith('apps/')) {
            errors.push(`${rel} imports app code via ${specifier}`);
          }
        }
        if (
          specifier.startsWith('apps/') ||
          specifier.startsWith('@agiworkforce/desktop') ||
          specifier.startsWith('@agiworkforce/web')
        ) {
          errors.push(`${rel} imports app code via ${specifier}`);
        }
      }

      if (rel.startsWith('services/')) {
        if (uiPackages.has(specifier)) {
          errors.push(`${rel} imports UI package ${specifier}`);
        }
        if (resolved) {
          const resolvedRel = relativePath(resolved);
          if (resolvedRel.startsWith('apps/')) {
            errors.push(`${rel} imports app code via ${specifier}`);
          }
        }
      }

      for (const ownership of vendorAdapterOwnership) {
        if (
          !ownership.packages.some((name) => specifier === name || specifier.startsWith(`${name}/`))
        ) {
          continue;
        }
        if (rel === ownership.owner || ownership.alsoAllowed.includes(rel)) continue;
        errors.push(
          `${rel} imports ${specifier} directly; reach it through ${ownership.port}, whose adapter in ${ownership.owner} owns that SDK.`,
        );
      }

      for (const [packageName, packageInfo] of workspacePackages.entries()) {
        const deepImportPrefix = `${packageName}/`;
        if (!specifier.startsWith(deepImportPrefix)) continue;

        const subpath = specifier.slice(deepImportPrefix.length);
        if (!packageInfo.exportedSubpaths.has(subpath)) {
          errors.push(
            `${rel} deep-imports workspace package ${specifier}; import ${packageName} or an exported subpath from ${packageInfo.relativePath}.`,
          );
        }
      }
    }
  }
}

function loadManagedComputeAllowlist() {
  const abs = path.join(root, MANAGED_COMPUTE_ALLOWLIST_PATH);
  if (!fs.existsSync(abs)) return { schemaVersion: 1, entries: [] };
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function validateManagedComputeAllowlist(allowlist) {
  const seen = new Set();
  for (const entry of allowlist.entries ?? []) {
    if (!entry.path || typeof entry.path !== 'string') {
      errors.push(`${MANAGED_COMPUTE_ALLOWLIST_PATH}: an entry is missing a "path" string.`);
      continue;
    }
    if (seen.has(entry.path)) {
      errors.push(`${MANAGED_COMPUTE_ALLOWLIST_PATH}: duplicate entry for ${entry.path}.`);
    }
    seen.add(entry.path);
    if (!entry.reason || typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      errors.push(
        `${MANAGED_COMPUTE_ALLOWLIST_PATH}: entry ${entry.path} needs a one-line reason.`,
      );
    }
  }
}

function findManagedComputeRouteOffenders() {
  const offenders = new Map();
  const routeDir = path.join(root, MANAGED_COMPUTE_ROUTE_ROOT);
  if (!fs.existsSync(routeDir)) return offenders;
  const routeFiles = walk(routeDir).filter((file) => path.basename(file) === 'route.ts');
  for (const file of routeFiles) {
    const rel = relativePath(file);
    const stripped = stripComments(fs.readFileSync(file, 'utf8'));
    if (MANAGED_COMPUTE_EVALUATOR_PATTERN.test(stripped)) continue;
    const startedBy = MANAGED_COMPUTE_START_MARKERS.filter((marker, index) =>
      MANAGED_COMPUTE_START_PATTERNS[index].test(stripped),
    );
    if (startedBy.length === 0) continue;
    offenders.set(rel, startedBy);
  }
  return offenders;
}

const managedComputeAllowlist = loadManagedComputeAllowlist();
validateManagedComputeAllowlist(managedComputeAllowlist);
const managedComputeAllowlistByPath = new Map(
  (managedComputeAllowlist.entries ?? []).map((entry) => [entry.path, entry]),
);
const managedComputeOffenders = findManagedComputeRouteOffenders();

for (const [rel, startedBy] of managedComputeOffenders) {
  if (managedComputeAllowlistByPath.has(rel)) continue;
  errors.push(
    `${rel} starts managed compute (${startedBy.join(', ')}) without importing and calling ` +
      `${MANAGED_COMPUTE_EVALUATOR_MARKER} from apps/web/lib/services/managed-compute-access.ts, ` +
      `and carries no entry in ${MANAGED_COMPUTE_ALLOWLIST_PATH}.`,
  );
}

const staleManagedComputeAllowlistPaths = (managedComputeAllowlist.entries ?? [])
  .map((entry) => entry.path)
  .filter((relPath) => !managedComputeOffenders.has(relPath));

if (staleManagedComputeAllowlistPaths.length > 0) {
  errors.push(
    `${MANAGED_COMPUTE_ALLOWLIST_PATH}: ${staleManagedComputeAllowlistPaths.length} entr(ies) ` +
      `no longer need an allowlist entry and must be removed:\n  ` +
      staleManagedComputeAllowlistPaths.join('\n  '),
  );
}

if (errors.length > 0) {
  console.error('Boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Boundary check passed (${managedComputeOffenders.size} managed-compute route(s) checked ` +
    `for ${MANAGED_COMPUTE_EVALUATOR_MARKER}, all allowlisted).`,
);
