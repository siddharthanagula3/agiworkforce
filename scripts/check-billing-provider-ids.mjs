#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// A billing provider's own identifiers are deployment facts: a Stripe price,
// a Stripe product, an App Store or Play product. Product behaviour is keyed
// on the plan catalog instead, and the mapping from a provider identifier to a
// plan is resolved at the adapter boundary from configuration. A literal
// anywhere else pins behaviour to one account's objects: it cannot be changed
// without a deploy, it is wrong in every other environment, and it makes a
// price the customer sees depend on a string nobody owns.
export const ADAPTER_PATHS = Object.freeze([
  {
    file: 'apps/web/lib/price-tier-mapping.ts',
    why: 'the Stripe adapter: resolves a configured price or product id to a catalog plan',
  },
  {
    file: 'apps/web/lib/pricing.ts',
    why: 'names the environment variables each published price point is configured through',
  },
  {
    file: 'packages/contracts/types/src/mobile-iap.ts',
    why: 'the mobile store catalog: product keys and their plan mapping, with store ids supplied by configuration',
  },
]);

const ADAPTER_PATH_SET = new Set(ADAPTER_PATHS.map((entry) => entry.file));

export const SCAN_ROOTS = Object.freeze(['apps', 'packages', 'scripts']);

export const MOBILE_BUNDLE_ID = 'com.agiworkforce.app';

export const MOBILE_IAP_CATALOG_PATH = 'packages/contracts/types/src/mobile-iap.ts';

/**
 * The store product keys the catalog declares, read from the catalog rather
 * than restated. A store identifier is one of these under the app's bundle
 * prefix, which is what separates it from the bundle-prefixed identifiers a
 * mobile app legitimately carries: app groups, extensions, native packages.
 */
export function mobileIapProductKeys(repoRoot = REPO_ROOT) {
  const source = readFileSync(path.join(repoRoot, MOBILE_IAP_CATALOG_PATH), 'utf8');
  const definitions = source.slice(source.indexOf('MOBILE_IAP_PRODUCT_DEFINITIONS'));
  const keys = [...definitions.matchAll(/^\s*key: '([a-z0-9_]+)',$/gm)].map((match) => match[1]);
  if (keys.length === 0) {
    throw new Error(`No product keys found in ${MOBILE_IAP_CATALOG_PATH}`);
  }
  return keys;
}

function storeProductPattern(repoRoot) {
  const keys = mobileIapProductKeys(repoRoot)
    .map((key) => key.replace(/_/g, '[._]'))
    .join('|');
  return new RegExp(`${MOBILE_BUNDLE_ID.replace(/\./g, '\\.')}[._](?:${keys})\\b`, 'g');
}

/**
 * Each rule names the provider whose identifier space it protects, so a
 * violation report says what was hardcoded rather than which regex fired.
 */
export function providerIdRules(repoRoot = REPO_ROOT) {
  return [
    { provider: 'stripe', kind: 'price id', pattern: /\bprice_[A-Za-z0-9]{8,}\b/g },
    { provider: 'stripe', kind: 'product id', pattern: /\bprod_[A-Za-z0-9]{8,}\b/g },
    {
      provider: 'apple or google',
      kind: 'store product id',
      pattern: storeProductPattern(repoRoot),
    },
  ];
}

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.rs',
  '.sql',
  '.swift',
  '.kt',
]);

const SKIP_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'generated',
  'target',
]);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|test|fixtures|e2e)\//.test(relativePath)
  );
}

export function findProviderIdLiterals(text, rules = providerIdRules()) {
  const lines = text.split('\n');
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        hits.push({
          line: index + 1,
          provider: rule.provider,
          kind: rule.kind,
          literal: match[0],
        });
      }
    }
  }
  return hits;
}

export function scanProviderIdFiles({ repoRoot = REPO_ROOT, filePaths, scanRoots = SCAN_ROOTS }) {
  const violations = [];
  // A tree without the catalog is a fixture; the identifier space it is being
  // checked against is still this repository's.
  const rules = existsSync(path.join(repoRoot, MOBILE_IAP_CATALOG_PATH))
    ? providerIdRules(repoRoot)
    : providerIdRules(REPO_ROOT);
  for (const filePath of [...new Set(filePaths)].sort()) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!scanRoots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`))) {
      continue;
    }
    if (ADAPTER_PATH_SET.has(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;

    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const hit of findProviderIdLiterals(text, rules)) {
      violations.push({ file: relativePath, ...hit });
    }
  }
  return violations;
}

export function discoverRepositoryFiles(repoRoot = REPO_ROOT) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`Cannot enumerate repository files with git ls-files: ${error.message}`);
  }
  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : REPO_ROOT;
  const violations = scanProviderIdFiles({
    repoRoot,
    filePaths: discoverRepositoryFiles(repoRoot),
  });

  if (violations.length > 0) {
    console.error('Billing provider identifiers are hardcoded outside the adapter boundary:\n');
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}  ${violation.provider} ${violation.kind} ${violation.literal}`,
      );
    }
    console.error('\nResolve the identifier through the adapter instead:');
    for (const adapter of ADAPTER_PATHS) {
      console.error(`  ${adapter.file}: ${adapter.why}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-billing-provider-ids: no provider identifiers outside ${ADAPTER_PATHS.length} adapter files`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
