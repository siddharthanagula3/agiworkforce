#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  collectReachable,
  collectWorkspacePackageAliases,
  createResolver,
  isTestPath,
  listSourceFiles,
  toRepoRelative,
} from './lib/module-graph.mjs';

const repoRoot = process.cwd();
export const ALLOWLIST_PATH = 'scripts/config/surface-reachability-allowlist.json';

const absolute = (relativePath) => path.join(repoRoot, relativePath);

const NEXT_ROUTE_BASENAMES = new Set([
  'apple-icon',
  'default',
  'error',
  'global-error',
  'icon',
  'layout',
  'loading',
  'manifest',
  'not-found',
  'opengraph-image',
  'page',
  'robots',
  'route',
  'sitemap',
  'template',
  'twitter-image',
]);

function nextAppRouterEntries(appDirectory) {
  return listSourceFiles(absolute(appDirectory)).filter((file) => {
    const basename = path.basename(file).replace(/\.[cm]?[jt]sx?$/, '');
    return NEXT_ROUTE_BASENAMES.has(basename);
  });
}

export function chromeManifestEntries(manifest, sourceDirectory) {
  const entries = [];
  const push = (value) => {
    if (typeof value === 'string' && value.length > 0) entries.push(value);
  };

  push(manifest?.background?.service_worker);
  for (const script of manifest?.content_scripts ?? []) {
    for (const file of script?.js ?? []) push(file);
  }
  push(manifest?.action?.default_popup);
  push(manifest?.options_page);
  push(manifest?.options_ui?.page);
  push(manifest?.side_panel?.default_path);
  for (const resource of manifest?.web_accessible_resources ?? []) {
    for (const file of resource?.resources ?? []) push(file);
  }

  return [...new Set(entries)].map((entry) => path.join(sourceDirectory, '..', entry));
}

function htmlScriptEntries(htmlPath) {
  if (!fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, 'utf8');
  const entries = [];
  for (const match of html.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    entries.push(path.resolve(path.dirname(htmlPath), match[1]));
  }
  return entries;
}

function existingFiles(candidates) {
  const seen = new Set();
  const files = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    for (const variant of [resolved, ...jsToTsVariants(resolved)]) {
      if (fs.existsSync(variant) && fs.statSync(variant).isFile()) {
        files.push(variant);
        break;
      }
    }
  }
  return files;
}

function jsToTsVariants(filePath) {
  const match = filePath.match(/^(.*)\.(c|m)?js$/);
  if (!match) return [];
  return [`${match[1]}.ts`, `${match[1]}.tsx`];
}

export function buildSurfaces() {
  const workspaceAliases = collectWorkspacePackageAliases(repoRoot);

  const chromeManifestPath = absolute('apps/extension/manifest.json');
  const chromeManifest = fs.existsSync(chromeManifestPath)
    ? JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'))
    : null;

  return [
    {
      id: 'desktop',
      label: 'Desktop renderer (Tauri)',
      entries: existingFiles([absolute('apps/desktop/src/main.tsx')]),
      productRoots: ['apps/desktop/src'],
      aliases: {
        '@/*': absolute('apps/desktop/src'),
        '@components/*': absolute('apps/desktop/src/components'),
        '@stores/*': absolute('apps/desktop/src/stores'),
        '@hooks/*': absolute('apps/desktop/src/hooks'),
        '@utils/*': absolute('apps/desktop/src/utils'),
        '@styles/*': absolute('apps/desktop/src/styles'),
        '@types/*': absolute('apps/desktop/src/types'),
        '@assets/*': absolute('apps/desktop/src/assets'),
        '@lib/*': absolute('apps/desktop/src/lib'),
        ...workspaceAliases,
      },
    },
    {
      id: 'web',
      label: 'Web (Next.js App Router)',
      entries: existingFiles([
        ...nextAppRouterEntries('apps/web/app'),
        absolute('apps/web/proxy.ts'),
        absolute('apps/web/instrumentation.ts'),
        absolute('apps/web/instrumentation-client.ts'),
        absolute('apps/web/next.config.ts'),
      ]),
      productRoots: ['apps/web/app', 'apps/web/features', 'apps/web/lib', 'apps/web/shared'],
      aliases: {
        '@/*': absolute('apps/web'),
        '@features/*': absolute('apps/web/features'),
        '@shared/*': absolute('apps/web/shared'),
        ...workspaceAliases,
      },
    },
    {
      id: 'mobile',
      label: 'Mobile (Expo Router)',
      entries: existingFiles([
        ...listSourceFiles(absolute('apps/mobile/app')),
        absolute('apps/mobile/index.js'),
        absolute('apps/mobile/app.config.js'),
      ]),
      productRoots: [
        'apps/mobile/app',
        'apps/mobile/components',
        'apps/mobile/hooks',
        'apps/mobile/lib',
        'apps/mobile/services',
        'apps/mobile/src',
        'apps/mobile/stores',
      ],
      aliases: { '@/*': absolute('apps/mobile'), ...workspaceAliases },
    },
    {
      id: 'chrome',
      label: 'Chrome extension (MV3 manifest entry points)',
      entries: existingFiles([
        ...(chromeManifest
          ? chromeManifestEntries(chromeManifest, absolute('apps/extension/src'))
          : []),
        ...htmlScriptEntries(absolute('apps/extension/src/side_panel.html')),
        ...htmlScriptEntries(absolute('apps/extension/src/options.html')),
      ]),
      productRoots: ['apps/extension/src'],
      aliases: { ...workspaceAliases },
    },
    {
      id: 'vscode',
      label: 'VS Code extension (activation entry point)',
      entries: existingFiles([absolute('apps/extension-vscode/src/extension.ts')]),
      productRoots: ['apps/extension-vscode/src'],
      aliases: { ...workspaceAliases },
    },
  ];
}

export function readAllowlist(rawJson) {
  const allowlist = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

  if (!allowlist || allowlist.schemaVersion !== 1 || typeof allowlist.surfaces !== 'object') {
    throw new Error(`${ALLOWLIST_PATH} must have schemaVersion 1 and a surfaces object`);
  }

  for (const [surfaceId, surface] of Object.entries(allowlist.surfaces)) {
    for (const [index, entry] of (surface.intentional ?? []).entries()) {
      if (typeof entry?.pathPrefix !== 'string' || entry.pathPrefix.length === 0) {
        throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.intentional[${index}] needs a pathPrefix`);
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
        throw new Error(
          `${ALLOWLIST_PATH}: ${surfaceId}.intentional[${index}] needs a reason of at least 20 characters`,
        );
      }
    }

    const debt = surface.unreachableDebt;
    if (debt !== undefined) {
      if (typeof debt.reason !== 'string' || debt.reason.trim().length < 20) {
        throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.unreachableDebt needs a reason`);
      }
      if (typeof debt.trackedBy !== 'string' || debt.trackedBy.trim().length === 0) {
        throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.unreachableDebt needs a trackedBy id`);
      }
      if (!Array.isArray(debt.paths)) {
        throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.unreachableDebt.paths must be an array`);
      }
      const seen = new Set();
      for (const entry of debt.paths) {
        if (typeof entry !== 'string') {
          throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.unreachableDebt.paths must be strings`);
        }
        if (seen.has(entry)) {
          throw new Error(`${ALLOWLIST_PATH}: ${surfaceId}.unreachableDebt lists ${entry} twice`);
        }
        seen.add(entry);
      }
    }
  }

  return allowlist;
}

/**
 * Compare one surface's measured unreachable set against its declared
 * exceptions.
 *
 * @param unreachable repo-relative paths with no path from an entry point
 * @param productFiles every repo-relative product file considered by the surface
 */
export function analyzeSurface({ unreachable, productFiles, surfaceAllowlist }) {
  const intentional = surfaceAllowlist?.intentional ?? [];
  const debtPaths = surfaceAllowlist?.unreachableDebt?.paths ?? [];
  const unreachableSet = new Set(unreachable);
  const productSet = new Set(productFiles);

  const matchesIntentional = (file) =>
    intentional.some(({ pathPrefix }) =>
      pathPrefix.endsWith('/') ? file.startsWith(pathPrefix) : file === pathPrefix,
    );

  const debtSet = new Set(debtPaths);
  const undeclared = unreachable
    .filter((file) => !matchesIntentional(file) && !debtSet.has(file))
    .sort();

  const staleDebt = debtPaths
    .filter((file) => !unreachableSet.has(file))
    .map((file) => ({
      path: file,
      why: productSet.has(file) ? 'now reachable' : 'no longer a product file',
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const staleIntentional = intentional
    .filter(({ pathPrefix }) =>
      pathPrefix.endsWith('/')
        ? !unreachable.some((file) => file.startsWith(pathPrefix))
        : !unreachableSet.has(pathPrefix),
    )
    .map(({ pathPrefix }) => pathPrefix)
    .sort();

  return { undeclared, staleDebt, staleIntentional };
}

export function measureSurface(surface) {
  const resolve = createResolver(surface.aliases);
  const reachable = collectReachable(surface.entries, resolve);

  const productFiles = [];
  for (const root of surface.productRoots) {
    for (const file of listSourceFiles(absolute(root))) {
      const relativePath = toRepoRelative(repoRoot, file);
      if (isTestPath(relativePath)) continue;
      productFiles.push(relativePath);
    }
  }
  productFiles.sort();

  const reachableRelative = new Set(
    [...reachable].map((file) => toRepoRelative(repoRoot, path.resolve(file))),
  );
  const unreachable = productFiles.filter((file) => !reachableRelative.has(file));

  return { productFiles, unreachable, reachableCount: reachable.size };
}

export function main(argv = process.argv.slice(2)) {
  const emitBaseline = argv.includes('--emit-baseline');
  const allowlist = readAllowlist(fs.readFileSync(absolute(ALLOWLIST_PATH), 'utf8'));
  const surfaces = buildSurfaces();
  const failures = [];
  const summary = [];
  const baseline = { schemaVersion: 1, surfaces: {} };

  for (const surface of surfaces) {
    if (surface.entries.length === 0) {
      failures.push(`${surface.label}: no entry point found; the walk would be vacuously green`);
      continue;
    }

    const { productFiles, unreachable, reachableCount } = measureSurface(surface);
    const surfaceAllowlist = allowlist.surfaces[surface.id];
    if (!surfaceAllowlist) {
      failures.push(`${ALLOWLIST_PATH} has no entry for surface "${surface.id}"`);
    }

    if (emitBaseline) {
      baseline.surfaces[surface.id] = {
        intentional: surfaceAllowlist?.intentional ?? [],
        unreachableDebt: {
          reason: surfaceAllowlist?.unreachableDebt?.reason ?? 'TODO',
          trackedBy: surfaceAllowlist?.unreachableDebt?.trackedBy ?? 'SIX-32',
          paths: unreachable.filter(
            (file) =>
              !(surfaceAllowlist?.intentional ?? []).some(({ pathPrefix }) =>
                pathPrefix.endsWith('/') ? file.startsWith(pathPrefix) : file === pathPrefix,
              ),
          ),
        },
      };
    }

    const { undeclared, staleDebt, staleIntentional } = analyzeSurface({
      unreachable,
      productFiles,
      surfaceAllowlist,
    });

    summary.push(
      `${surface.id}: ${surface.entries.length} entry point(s), ${productFiles.length} product ` +
        `module(s), ${reachableCount} reachable node(s), ${unreachable.length} unreachable ` +
        `(${undeclared.length} undeclared)`,
    );

    if (undeclared.length > 0) {
      failures.push(
        `${surface.label}: ${undeclared.length} module(s) are unreachable from every entry point ` +
          `and not declared in ${ALLOWLIST_PATH}:\n` +
          undeclared.map((file) => `    - ${file}`).join('\n'),
      );
    }
    if (staleDebt.length > 0) {
      failures.push(
        `${surface.label}: ${staleDebt.length} unreachableDebt entr(ies) are stale; remove them ` +
          `from ${ALLOWLIST_PATH} so the list keeps ratcheting down:\n` +
          staleDebt.map(({ path: file, why }) => `    - ${file} (${why})`).join('\n'),
      );
    }
    if (staleIntentional.length > 0) {
      failures.push(
        `${surface.label}: ${staleIntentional.length} intentional exception(s) no longer match any ` +
          `unreachable module; remove them from ${ALLOWLIST_PATH}:\n` +
          staleIntentional.map((prefix) => `    - ${prefix}`).join('\n'),
      );
    }
  }

  if (emitBaseline) {
    fs.writeFileSync(absolute(ALLOWLIST_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote baseline to ${ALLOWLIST_PATH}`);
    return 0;
  }

  for (const line of summary) console.log(`  ${line}`);

  if (failures.length > 0) {
    console.error('Surface reachability check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    return 1;
  }

  console.log('Surface reachability check passed for all shipping surfaces.');
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) process.exit(main());
