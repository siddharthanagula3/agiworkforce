#!/usr/bin/env node
// The recovery table in the continuity runbook covers every production
// dependency the code declares, and claims a drill only where one exists.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DOCUMENT = 'docs/runbooks/business-continuity.md';
export const REGISTRY = 'apps/web/lib/config/dependency-readiness.ts';
export const SECTION = '## Recovery by dependency';

// A row that is not a dependency id: the deployment itself has no entry in the
// registry, because nothing in it is configured by an environment key.
const NON_DEPENDENCY_ROWS = new Set(['Serving']);

export const NO_DRILL = 'no recorded drill';

const REQUIRED_CELLS = 6;

/** Every id in PRODUCTION_DEPENDENCIES, in declaration order. */
export function declaredDependencyIds(source) {
  const start = source.indexOf('PRODUCTION_DEPENDENCIES');
  if (start < 0) return null;
  const end = source.indexOf('\n];', start);
  if (end < 0) return null;
  return [...source.slice(start, end).matchAll(/^ {4}id: '([a-z0-9_]+)',$/gm)].map(
    (match) => match[1],
  );
}

function sectionBody(source, heading) {
  const start = source.indexOf(heading);
  if (start < 0) return null;
  const rest = source.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

export function tableRows(body) {
  const rows = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim());
    rows.push(cells);
  }
  return rows;
}

function rowLabel(cells) {
  return (cells[0] ?? '').replace(/^`|`$/g, '');
}

/** A cell that names a repository path has to name one that exists. */
function citedPaths(cell) {
  return [...cell.matchAll(/`([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|js|sql|yml|yaml|md))`/g)].map(
    (match) => match[1],
  );
}

export function runRecoveryTableCheck(root) {
  const failures = [];
  const documentPath = path.join(root, DOCUMENT);
  const registryPath = path.join(root, REGISTRY);

  if (!fs.existsSync(documentPath)) return [`${DOCUMENT} does not exist`];
  if (!fs.existsSync(registryPath)) return [`${REGISTRY} does not exist`];

  const declared = declaredDependencyIds(fs.readFileSync(registryPath, 'utf8'));
  if (declared === null || declared.length === 0) {
    return [`${REGISTRY}: PRODUCTION_DEPENDENCIES could not be read, so nothing can be checked`];
  }

  const source = fs.readFileSync(documentPath, 'utf8');
  const body = sectionBody(source, SECTION);
  if (body === null) return [`${DOCUMENT} has no "${SECTION}" section`];

  const rows = tableRows(body).filter((cells) => rowLabel(cells) !== 'id');
  const documented = new Set();

  for (const cells of rows) {
    const label = rowLabel(cells);
    if (label === '' || label.startsWith('Asset') || label === 'Database RPO') continue;
    if (cells.length < REQUIRED_CELLS) {
      // The RPO/RTO table in the same section is three columns wide.
      if (cells.length === 3) continue;
      failures.push(
        `${DOCUMENT}: row "${label}" has ${cells.length} cells, expected ${REQUIRED_CELLS}`,
      );
      continue;
    }
    if (NON_DEPENDENCY_ROWS.has(label)) {
      documented.add(label);
    } else if (!declared.includes(label)) {
      failures.push(
        `${DOCUMENT}: row "${label}" is not a dependency ${REGISTRY} declares; remove it or add it there`,
      );
      continue;
    } else if (documented.has(label)) {
      failures.push(`${DOCUMENT}: "${label}" has more than one row`);
      continue;
    } else {
      documented.add(label);
    }

    for (const [index, cell] of cells.entries()) {
      if (cell === '')
        failures.push(`${DOCUMENT}: row "${label}" leaves column ${index + 1} blank`);
    }

    const rehearsed = cells[5] ?? '';
    if (rehearsed !== NO_DRILL) {
      const paths = citedPaths(rehearsed);
      if (paths.length === 0) {
        failures.push(
          `${DOCUMENT}: row "${label}" claims a rehearsal but cites no file; say "${NO_DRILL}" instead`,
        );
      }
      for (const cited of paths) {
        if (!fs.existsSync(path.join(root, cited))) {
          failures.push(
            `${DOCUMENT}: row "${label}" cites "${cited}" as its rehearsal and that file does not exist`,
          );
        }
      }
    }

    for (const cited of citedPaths(cells[2] ?? '')) {
      if (!fs.existsSync(path.join(root, cited))) {
        failures.push(`${DOCUMENT}: row "${label}" cites "${cited}", which does not exist`);
      }
    }
  }

  for (const id of declared) {
    if (!documented.has(id)) {
      failures.push(
        `${DOCUMENT}: ${REGISTRY} declares "${id}" and the recovery table has no row for it`,
      );
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runRecoveryTableCheck(root);
  if (failures.length > 0) {
    console.error(
      'The disaster-recovery table does not match the dependencies the code declares:\n',
    );
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log('check-dr-recovery-table: every production dependency has a recovery row.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
