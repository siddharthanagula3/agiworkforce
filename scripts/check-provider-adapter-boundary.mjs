#!/usr/bin/env node

/**
 * A provider SDK is the one dependency that cannot be made provider neutral, so
 * it may only be imported by the adapter that exists to translate it. Every
 * other module asks the adapter what a provider can do, never who it is.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, providerIds, repositoryFiles } from './check-capability-boundaries.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);

/** Where a provider SDK is allowed to be imported: the adapters themselves. */
export const ADAPTER_ROOTS = Object.freeze(['packages/ai/providers/']);

/**
 * Provider SDKs the repository currently depends on. The list is not trusted:
 * every entry must still be imported by an adapter, and any vendor package an
 * adapter imports must be listed, so it can neither go stale nor be bypassed.
 */
export const PROVIDER_SDK_MODULES = Object.freeze(['openai', '@anthropic-ai/sdk']);

/** Vendor names that never appear in a package a domain module may import. */
const NON_PROVIDER_SCOPES = new Set(['@agiworkforce', '@types']);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const IMPORT_RE =
  /^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/;

/** The package a specifier resolves to: `openai/resources` is still `openai`. */
export function packageOfSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null;
  }
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

export function importedPackages(source) {
  const packages = new Set();
  for (const line of source.split('\n')) {
    const match = IMPORT_RE.exec(line);
    if (match === null) continue;
    const packageName = packageOfSpecifier(match[1] ?? match[2] ?? match[3] ?? '');
    if (packageName !== null) packages.add(packageName);
  }
  return packages;
}

function isAdapterPath(relativePath) {
  return ADAPTER_ROOTS.some((root) => relativePath.startsWith(root));
}

/**
 * A package is a provider SDK when its name carries a provider id from the
 * canonical `Provider` union. That is what keeps the declared list honest when
 * a new vendor arrives with a differently spelled package.
 */
export function looksLikeProviderSdk(packageName, providers) {
  const scope = packageName.startsWith('@') ? packageName.split('/')[0] : null;
  if (scope !== null && NON_PROVIDER_SCOPES.has(scope)) return false;
  const normalized = packageName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return providers.some((provider) => {
    const id = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    return id.length >= 3 && normalized.includes(id);
  });
}

export function providerSdkViolations({
  repoRoot = REPO_ROOT,
  files,
  providers = providerIds(repoRoot),
  declared = PROVIDER_SDK_MODULES,
}) {
  if (providers.length === 0) {
    return [
      'packages/contracts/types/src/provider.ts: Provider is unreadable, so this guard cannot run.',
    ];
  }

  const violations = [];
  const declaredSet = new Set(declared);
  const importedByAdapter = new Set();

  for (const relativePath of files) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;

    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const packages = importedPackages(source);
    const adapter = isAdapterPath(relativePath);

    for (const packageName of packages) {
      const declaredSdk = declaredSet.has(packageName);
      const looksLike = looksLikeProviderSdk(packageName, providers);
      if (!declaredSdk && !looksLike) continue;

      if (adapter) {
        importedByAdapter.add(packageName);
        if (!declaredSdk) {
          violations.push(
            `${relativePath}: imports the vendor package '${packageName}', which is not in ` +
              `PROVIDER_SDK_MODULES. Add it, so every module that may not import it is guarded too.`,
          );
        }
        continue;
      }

      if (!declaredSdk) continue;
      violations.push(
        `${relativePath}: imports the provider SDK '${packageName}'. A provider SDK belongs to its ` +
          `adapter under ${ADAPTER_ROOTS[0]}; this module should ask the adapter what the provider ` +
          `can do through a ProviderTrait in packages/contracts/types/src/provider-adapter.ts.`,
      );
    }
  }

  for (const packageName of declaredSet) {
    if (importedByAdapter.has(packageName)) continue;
    violations.push(
      `PROVIDER_SDK_MODULES lists '${packageName}', which no adapter imports any more. ` +
        `Drop it: a guard that names a dependency nobody has stops proving anything.`,
    );
  }

  return violations;
}

export function checkProviderAdapterBoundary(repoRoot = REPO_ROOT) {
  return providerSdkViolations({ repoRoot, files: repositoryFiles(repoRoot) });
}

function main() {
  const errors = checkProviderAdapterBoundary(REPO_ROOT);
  if (errors.length > 0) {
    console.error('✗ provider-adapter boundary check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(
    `✓ provider-adapter boundary: ${PROVIDER_SDK_MODULES.length} provider SDK(s) are imported only ` +
      `under ${ADAPTER_ROOTS.join(', ')}.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
