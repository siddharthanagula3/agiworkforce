#!/usr/bin/env node

// Where each feature's code is, per surface. The matrix is data, the document
// is rendered from it, and a cell that claims a feature is present names two
// files: the entry point and the file that mounts or routes to it. The guard
// checks that relationship literally, so "present" cannot be claimed from a
// file that nothing reaches.
//
// A cell says nothing about whether a user can get the feature. Maturity is a
// property of the feature, read from the feature registry once per row, and a
// cell that carries a maturity word fails: a surface column is not the place
// to declare how finished something is, and release state is not in this tree
// at all.

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MATRIX_PATH = 'docs/product/surface-feature-matrix.json';
export const RENDERED_PATH = 'docs/product/surface-feature-matrix.md';
export const CONCEPT_REGISTRY_PATH = 'packages/contracts/types/src/concept-registry.json';
export const FEATURE_REGISTRY_PATH = 'packages/contracts/types/src/feature-registry.json';
export const MODEL_CATALOG_PATH = 'packages/contracts/types/src/model-catalog.ts';

/** What a cell may say about code, and what each owes beside the state. */
export const CELL_STATES = Object.freeze({
  present: ['entry', 'mount', 'via'],
  partial: ['entry', 'mount', 'via', 'missing'],
  absent: ['why'],
  unverified: ['settledBy'],
});

/** How a mount may reach an entry, each checkable against the two files. */
export const MOUNT_RELATIONS = Object.freeze(['import', 'module', 'route']);

export const STATE_LABELS = Object.freeze({
  present: 'Present',
  partial: 'Partial',
  absent: 'Absent',
  unverified: 'Unverified',
});

const NOT_IN_REGISTRY = 'not in the feature registry';

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readJson(repoRoot, relativePath) {
  const source = read(repoRoot, relativePath);
  return source === null ? null : JSON.parse(source);
}

function isFile(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  return existsSync(absolute) && statSync(absolute).isFile();
}

/** The maturity vocabulary as the catalogue declares it, never a copy of it. */
export function readMaturities(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, MODEL_CATALOG_PATH);
  if (source === null) return [];
  const block = /export const FEATURE_MATURITIES = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) return [];
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

export function readSurfaces(repoRoot = REPO_ROOT) {
  return readJson(repoRoot, CONCEPT_REGISTRY_PATH)?.originSurfaces ?? [];
}

export function readFeatureRegistry(repoRoot = REPO_ROOT) {
  return readJson(repoRoot, FEATURE_REGISTRY_PATH)?.features ?? {};
}

export function declaredMaturity(registry, featureId) {
  if (featureId === null || featureId === undefined) return NOT_IN_REGISTRY;
  return registry[featureId]?.maturity ?? NOT_IN_REGISTRY;
}

/** Every module specifier the file names, import or dynamic import alike. */
function importSpecifiers(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? match[2],
  );
}

/**
 * Whether the mount reaches the entry, by the relation the cell claims. Each
 * one is decided from the two files, never from a naming convention.
 */
export function mountReachesEntry({ repoRoot, entry, mount, via }) {
  const source = read(repoRoot, mount);
  if (source === null) return false;

  if (via === 'module') {
    const base = path.basename(entry).replace(/\.rs$/, '');
    const declared = new RegExp(`^\\s*(?:pub\\s+)?mod\\s+${base}\\s*;`, 'm').test(source);
    return declared && path.dirname(mount) === path.dirname(entry);
  }

  if (via === 'route') {
    // A route mount renders everything beneath it, so containment is the
    // relationship, and the mount has to be a layout rather than any ancestor.
    const isLayout = /(^|\/)_?layout\.tsx$/.test(mount);
    const within = `${entry}/`.startsWith(`${path.dirname(mount)}/`);
    // Two filesystem conventions, each of which mounts by containment: an app
    // router page or route handler, and an expo screen, which is any module in
    // the screen tree that is not itself a layout.
    const isAppRouterRoute =
      entry.startsWith(`apps/web/app/`) && /(^|\/)(page|route)\.tsx?$/.test(entry);
    const isExpoScreen =
      entry.startsWith(`apps/mobile/app/`) &&
      /\.tsx$/.test(entry) &&
      !/(^|\/)_layout\.tsx$/.test(entry);
    return isLayout && within && (isAppRouterRoute || isExpoScreen);
  }

  const stem = entry.replace(/\.[tj]sx?$/, '');
  for (const specifier of importSpecifiers(source)) {
    if (specifier.startsWith('.')) {
      const resolved = path.posix.normalize(path.posix.join(path.dirname(mount), specifier));
      if (resolved === stem || resolved === `${stem}/index` || resolved === entry) return true;
      continue;
    }
    const tail = specifier.replace(/^@\//, '').replace(/^@[^/]+\//, '');
    if (tail.length > 0 && (stem.endsWith(`/${tail}`) || stem.endsWith(`/${tail}/index`))) {
      return true;
    }
  }
  return false;
}

export function renderMatrix(matrix, surfaces, registry) {
  const lines = [
    '# Surface feature matrix',
    '',
    'Status: Current',
    'Owner: Cross-surface parity',
    'Last updated: 2026-09-20',
    '',
    `Generated from \`${MATRIX_PATH}\` by \`scripts/check-surface-feature-matrix.mjs --write\`.`,
    'Edit the data file, not this one.',
    '',
    '## What this matrix does not say',
    '',
    'Presence in the tree is not availability to a user: a `Present` cell means the code is in this',
    'repository and something reaches it, nothing more.',
    'Whether a surface has been released, to whom, and at what version is not derivable from this',
    'repository at all; the release process records that, and this document never claims it.',
    'A `Present` cell has been located, not exercised: no cell here was produced by running the',
    'feature on that surface.',
    '',
    matrix.why,
    '',
    '## Surfaces',
    '',
  ];

  for (const surface of surfaces) {
    const note = matrix.surfaceNotes[surface];
    const workflow = matrix.releaseWorkflows[surface];
    const shown =
      workflow === null
        ? 'no release workflow for this surface exists in the tree'
        : `a release workflow for this surface exists at \`${workflow}\``;
    lines.push(
      `- **${surface}**: ${note} Release: ${shown}. Whether it has ever run is not in this tree.`,
    );
  }

  lines.push(
    '',
    '## States',
    '',
    '`Present` means an entry point exists and a named file imports, declares or routes to it.',
    '`Partial` means the same, with a named part of the feature missing on that surface.',
    '`Absent` means the surface does not have it, and says why.',
    '`Unverified` means the tree does not settle it, and says what would.',
    '',
    "`Declared maturity` is the feature registry's answer for the whole feature, not for one surface.",
    `Most rows read "${NOT_IN_REGISTRY}": the registry holds ${Object.keys(registry).length} features`,
    'and this matrix holds more, so there is no declared maturity to show for the rest.',
    '',
  );

  const header = `| Feature | Declared maturity | ${surfaces.join(' | ')} |`;
  const divider = `| --- | --- | ${surfaces.map(() => '---').join(' | ')} |`;

  for (const group of matrix.groups) {
    const rows = matrix.features.filter((feature) => feature.group === group.id);
    if (rows.length === 0) continue;
    lines.push(`## ${group.title}`, '', header, divider);
    for (const feature of rows) {
      const cells = surfaces.map((surface) => STATE_LABELS[feature.cells[surface]?.state] ?? '?');
      const maturity = declaredMaturity(registry, feature.featureId);
      lines.push(`| ${feature.label} | ${maturity} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  const unregistered = matrix.features.filter((feature) => !feature.featureId);
  lines.push(
    '## Features with no declared maturity',
    '',
    `${unregistered.length} of ${matrix.features.length} rows name no feature in`,
    `\`${FEATURE_REGISTRY_PATH}\`, so nothing in the tree declares how finished they are, who owns`,
    'them, or what would take them out of an unfinished state. That is a gap in the registry, not in',
    'this document.',
    '',
    ...unregistered.map((feature) => `- ${feature.label}`),
    '',
    '## Evidence',
    '',
  );

  for (const feature of matrix.features) {
    lines.push(`### ${feature.label}`, '');
    for (const surface of surfaces) {
      const cell = feature.cells[surface] ?? {};
      if (cell.state === 'absent') {
        lines.push(`- **${surface}**: absent. ${cell.why}`);
      } else if (cell.state === 'unverified') {
        lines.push(`- **${surface}**: unverified. Settled by: ${cell.settledBy}`);
      } else if (cell.state === 'partial') {
        lines.push(
          `- **${surface}**: partial. \`${cell.entry}\`, reached by \`${cell.mount}\` ` +
            `(${cell.via}). Missing: ${cell.missing}`,
        );
      } else {
        lines.push(
          `- **${surface}**: present. \`${cell.entry}\`, reached by \`${cell.mount}\` (${cell.via}).`,
        );
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function collectViolations(repoRoot = REPO_ROOT) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const matrix = readJson(repoRoot, MATRIX_PATH);
  if (matrix === null) {
    fail(`${MATRIX_PATH} does not exist, so nothing records where each feature's code is.`);
    return violations;
  }

  const surfaces = readSurfaces(repoRoot);
  if (surfaces.length === 0) {
    fail(`${CONCEPT_REGISTRY_PATH} lists no originSurfaces; the matrix has no columns to check.`);
    return violations;
  }

  const maturities = readMaturities(repoRoot);
  if (maturities.length === 0) {
    fail(`${MODEL_CATALOG_PATH} no longer declares FEATURE_MATURITIES; nothing bounds the words.`);
    return violations;
  }

  for (const surface of surfaces) {
    if (typeof matrix.surfaceNotes?.[surface] !== 'string') {
      fail(`${MATRIX_PATH}: surface "${surface}" has no note saying what it is.`);
    }
    if (!Object.prototype.hasOwnProperty.call(matrix.releaseWorkflows ?? {}, surface)) {
      fail(
        `${MATRIX_PATH}: surface "${surface}" says nothing about a release workflow. Name the file ` +
          'in the tree, or null when none exists. Never whether it has run.',
      );
      continue;
    }
    const workflow = matrix.releaseWorkflows[surface];
    if (workflow !== null && !isFile(repoRoot, workflow)) {
      fail(
        `${MATRIX_PATH}: surface "${surface}" names release workflow "${workflow}", which is gone.`,
      );
    }
  }
  for (const surface of Object.keys(matrix.surfaceNotes ?? {})) {
    if (!surfaces.includes(surface)) {
      fail(`${MATRIX_PATH}: notes a surface "${surface}" that ${CONCEPT_REGISTRY_PATH} does not.`);
    }
  }

  const groupIds = new Set((matrix.groups ?? []).map((group) => group.id));
  const seenFeatureIds = new Set();
  const claimedRegistryIds = new Set();

  for (const feature of matrix.features ?? []) {
    const where = `${MATRIX_PATH}: feature "${feature.id}"`;
    if (seenFeatureIds.has(feature.id)) fail(`${where} appears twice.`);
    seenFeatureIds.add(feature.id);

    if (typeof feature.label !== 'string' || feature.label.trim().length === 0) {
      fail(`${where} has no label for a reader.`);
    }
    if (!groupIds.has(feature.group)) {
      fail(`${where} is in group "${feature.group}", which the matrix does not declare.`);
    }
    if (feature.featureId !== null && feature.featureId !== undefined) {
      claimedRegistryIds.add(feature.featureId);
    }
    if (feature.maturity !== undefined) {
      fail(
        `${where} declares a maturity of its own. Maturity comes from ${FEATURE_REGISTRY_PATH}, ` +
          'so a second copy here would answer differently the day the registry changed.',
      );
    }

    const cells = feature.cells ?? {};
    for (const surface of Object.keys(cells)) {
      if (!surfaces.includes(surface)) {
        fail(`${where} has a cell for "${surface}", which is not a surface.`);
      }
    }

    for (const surface of surfaces) {
      const cell = cells[surface];
      const at = `${where} on ${surface}`;
      if (cell === undefined) {
        fail(`${at}: no cell. Every surface answers for every feature, even to say absent.`);
        continue;
      }

      if (maturities.includes(cell.state)) {
        fail(
          `${at}: state "${cell.state}" is a maturity word. A surface column says where the code is, ` +
            'not how finished it is, and it can never say whether a user can reach it.',
        );
        continue;
      }

      const owed = CELL_STATES[cell.state];
      if (owed === undefined) {
        fail(`${at}: state "${cell.state}" is not one of ${Object.keys(CELL_STATES).join(', ')}.`);
        continue;
      }
      for (const field of owed) {
        if (typeof cell[field] !== 'string' || cell[field].trim().length === 0) {
          fail(`${at}: state "${cell.state}" carries no ${field}.`);
        }
      }
      if (cell.state === 'absent' && cell.entry !== undefined) {
        fail(`${at}: absent, and it names an entry point, which claims the opposite.`);
      }
      if (owed.includes('entry') === false) continue;
      if (typeof cell.entry !== 'string' || typeof cell.mount !== 'string') continue;

      if (!isFile(repoRoot, cell.entry)) {
        fail(
          `${at}: entry "${cell.entry}" is not a file in the tree. A directory is not an entry ` +
            'point, and a path that is gone was never evidence.',
        );
        continue;
      }
      if (!isFile(repoRoot, cell.mount)) {
        fail(`${at}: mount "${cell.mount}" is not a file in the tree.`);
        continue;
      }
      if (cell.mount === cell.entry) {
        fail(`${at}: names the same file as entry and mount, which reaches nothing.`);
        continue;
      }
      if (!MOUNT_RELATIONS.includes(cell.via)) {
        fail(`${at}: via "${cell.via}" is not one of ${MOUNT_RELATIONS.join(', ')}.`);
        continue;
      }
      if (!mountReachesEntry({ repoRoot, entry: cell.entry, mount: cell.mount, via: cell.via })) {
        fail(
          `${at}: "${cell.mount}" does not ${cell.via} "${cell.entry}". The cell claims the code is ` +
            'reachable on this surface and the two files do not show it.',
        );
      }
    }
  }

  const registry = readFeatureRegistry(repoRoot);
  for (const [id, definition] of Object.entries(registry)) {
    if (!claimedRegistryIds.has(id)) {
      fail(
        `${MATRIX_PATH}: the feature registry has "${id}" (${definition.label}) and no row names ` +
          'it. A feature nobody placed on a surface is a feature nobody can ship.',
      );
    }
  }
  for (const claimed of claimedRegistryIds) {
    if (registry[claimed] === undefined) {
      fail(`${MATRIX_PATH}: a row names registry feature "${claimed}", which does not exist.`);
    }
  }

  const rendered = read(repoRoot, RENDERED_PATH);
  const expected = renderMatrix(matrix, surfaces, registry);
  if (rendered === null) {
    fail(`${RENDERED_PATH} does not exist. Run the guard with --write.`);
  } else if (rendered !== expected) {
    fail(`${RENDERED_PATH} is stale against ${MATRIX_PATH}. Run the guard with --write.`);
  }

  return violations;
}

function main() {
  if (process.argv.includes('--write')) {
    const matrix = readJson(REPO_ROOT, MATRIX_PATH);
    const rendered = renderMatrix(matrix, readSurfaces(REPO_ROOT), readFeatureRegistry(REPO_ROOT));
    writeFileSync(path.join(REPO_ROOT, RENDERED_PATH), rendered);
    console.log(`Wrote ${RENDERED_PATH} from ${MATRIX_PATH}.`);
    return;
  }

  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('Surface feature matrix violations:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log(
    'Surface feature matrix: every present cell names a file that reaches its entry point.',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
