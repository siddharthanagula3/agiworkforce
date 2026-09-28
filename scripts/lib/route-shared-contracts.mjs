/**
 * A route a client calls has to agree with that client about the body it
 * sends back, and the only agreement that survives a change on either side is
 * a schema both of them import from a shared contract package. A route is
 * client-called when a client source names its path, the same evidence
 * routes-without-callers uses, so a route gains the obligation the day a
 * client starts calling it.
 */
import fs from 'node:fs';
import path from 'node:path';

export const API_ROOT = 'apps/web/app/api';
export const BASELINE_FILE = 'scripts/config/route-shared-contracts-baseline.json';

export const CLIENT_ROOTS = Object.freeze([
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/web/lib/hooks',
  'apps/web/lib/client',
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/mobile/services',
  'apps/desktop/src',
  'apps/desktop/electron',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'packages',
]);

export const SHARED_CONTRACT_PACKAGES = Object.freeze([
  '@agiworkforce/cloud-contracts',
  '@agiworkforce/types',
  '@agiworkforce/client-runtime',
  '@agiworkforce/sync',
  '@agiworkforce/ide-runtime',
]);

const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__tests__$|__mocks__$)/;
const SOURCE_FILE = /\.(?:tsx?|mts|mjs|jsx?)$/;
const TEST_FILE = /\.(?:test|spec)\.[tj]sx?$/;

function walk(dir, include, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORY.test(entry.name)) walk(full, include, out);
    } else if (include(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function listRoutes(root) {
  const apiRoot = path.join(root, API_ROOT);
  return walk(apiRoot, (name) => name === 'route.ts' || name === 'route.tsx')
    .map((file) => ({
      file,
      route: path
        .relative(apiRoot, file)
        .split(path.sep)
        .join('/')
        .replace(/\/route\.tsx?$/, ''),
    }))
    .sort((left, right) => left.route.localeCompare(right.route));
}

export function readClientCorpus(root) {
  return CLIENT_ROOTS.flatMap((clientRoot) =>
    walk(path.join(root, clientRoot), (name) => SOURCE_FILE.test(name) && !TEST_FILE.test(name)),
  ).map((file) => fs.readFileSync(file, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function segmentPattern(segment) {
  if (segment.startsWith('[...')) return '.+';
  if (segment.startsWith('[')) return '[^"\'`\\s]+';
  return escapeRegExp(segment);
}

export function routeCallPatterns(route) {
  const segments = route.split('/');
  const patterns = [
    new RegExp(`\\/api\\/${segments.map(segmentPattern).join('\\/')}(?![A-Za-z0-9_-])`),
  ];
  const firstDynamic = segments.findIndex((segment) => segment.startsWith('['));
  if (firstDynamic > 0) {
    const prefix = segments.slice(0, firstDynamic).map(escapeRegExp).join('\\/');
    patterns.push(new RegExp(`\\/api\\/${prefix}['"\`/]`));
  }
  return patterns;
}

export function isClientCalled(route, corpus) {
  const patterns = routeCallPatterns(route);
  return corpus.some((source) => patterns.some((pattern) => pattern.test(source)));
}

const SHARED_IMPORT = new RegExp(
  `from\\s+['"](?:${SHARED_CONTRACT_PACKAGES.map(escapeRegExp).join('|')})(?:\\/[^'"]*)?['"]`,
);

export function importsSharedContract(source) {
  return SHARED_IMPORT.test(source);
}

export function auditRouteContracts(root) {
  const corpus = readClientCorpus(root);
  const called = listRoutes(root).filter(({ route }) => isClientCalled(route, corpus));
  const missing = called
    .filter(({ file }) => !importsSharedContract(fs.readFileSync(file, 'utf8')))
    .map(({ route }) => route);
  return { called: called.map(({ route }) => route), missing };
}

export function compareWithBaseline(missing, baseline) {
  const accepted = new Set(baseline.routes ?? []);
  const found = new Set(missing);
  return {
    unexpected: missing.filter((route) => !accepted.has(route)),
    stale: [...accepted].filter((route) => !found.has(route)).sort(),
  };
}
