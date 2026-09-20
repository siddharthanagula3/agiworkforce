#!/usr/bin/env node

// Soft delete and archive are promises about what a reader and a model may
// still see. This guard enumerates the tables that carry the promise and the
// production modules that read them, and fails on any reader that ignores it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readForeignKeys, readTableColumns } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/lifecycle-semantics.json';
export const SEMANTICS_MODULE = 'packages/contracts/types/src/resource-lifecycle.ts';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const SERVER_ROOTS = Object.freeze(['apps/web/app/', 'apps/web/lib/', 'apps/web/db/']);

export const READ_CLASSES = Object.freeze([
  'erasure',
  'purge',
  'retention-sweep',
  'ownership-check',
  'write-path',
  'defect',
]);

export const SHARE_SURFACE_COLUMNS = Object.freeze([
  'share_token',
  'token',
  'visibility',
  'public_slug',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function exists(repoRoot, relativePath) {
  try {
    readFileSync(path.join(repoRoot, relativePath), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

export function repositoryFiles(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

/** The archived row of the shared contract, read rather than restated. */
export function readArchivedSemantics(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, SEMANTICS_MODULE);
  if (source === null) return null;
  const block = /archived:\s*\{([^}]*)\}/.exec(source);
  if (block === null) return null;
  const facets = {};
  for (const match of block[1].matchAll(/([A-Za-z]+):\s*(true|false)/g)) {
    facets[match[1]] = match[2] === 'true';
  }
  return Object.keys(facets).length === 0 ? null : facets;
}

/** Every table carrying a withdrawal marker, whatever the column is spelled. */
export function findMarkedTables({ tables, contract }) {
  const marked = new Map();
  for (const [kind, columns] of Object.entries(contract.markerColumns)) {
    for (const [table, tableColumns] of tables) {
      const column = columns.find((candidate) => tableColumns.has(candidate));
      if (column === undefined) continue;
      const entry = marked.get(table) ?? {};
      entry[kind] = column;
      marked.set(table, entry);
    }
  }
  return marked;
}

/** A table that hands the resource to somebody who is not its owner. */
export function findShareSurfaces({ tables, foreignKeys }) {
  const surfaces = new Map();
  for (const key of foreignKeys) {
    const columns = tables.get(key.child);
    if (columns === undefined) continue;
    if (!SHARE_SURFACE_COLUMNS.some((column) => columns.has(column))) continue;
    if (key.child === key.parent) continue;
    const entries = surfaces.get(key.parent) ?? new Set();
    entries.add(key.child);
    surfaces.set(key.parent, entries);
  }
  return surfaces;
}

function readsTable(source, table) {
  return new RegExp(`\\b(from|join)\\s+(?:only\\s+)?(?:public\\s*\\.\\s*)?${table}\\b`, 'i').test(
    source,
  );
}

/**
 * A production module that reads a marked table and never names the marker or
 * a declared predicate helper is reading withdrawn rows.
 */
export function findUnfilteredReads({ repoRoot = REPO_ROOT, files, contract, marked }) {
  const helpersFor = new Map();
  for (const helper of contract.predicateHelpers ?? []) {
    for (const table of helper.resources) {
      const entries = helpersFor.get(table) ?? [];
      entries.push(helper.symbol);
      helpersFor.set(table, entries);
    }
  }

  const reads = [];
  for (const relativePath of files) {
    if (!SERVER_ROOTS.some((root) => relativePath.startsWith(root))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const raw = readSource(repoRoot, relativePath);
    if (raw === null) continue;
    const code = stripComments(raw);
    const lower = code.toLowerCase();

    for (const [table, markers] of marked) {
      if (!readsTable(lower, table)) continue;
      // Soft delete is withdrawn consent, so it is the marker a reader owes.
      // Archive only binds a table that has no soft delete of its own.
      const required = markers.softDeleted ?? markers.archived;
      if (lower.includes(required)) continue;
      if ((helpersFor.get(table) ?? []).some((symbol) => code.includes(symbol))) continue;
      reads.push({ file: relativePath, table, marker: required });
    }
  }
  return reads;
}

function checkResourceCoverage({ contract, tables, marked, errors }) {
  for (const [table, markers] of marked) {
    const resource = contract.resources[table];
    if (resource === undefined) {
      errors.push(
        `${CONTRACT_PATH}: ${table} carries ${Object.values(markers).join(' and ')} and declares no ` +
          'lifecycle semantics. A row a surface can withdraw needs its promises written down.',
      );
      continue;
    }
    for (const [kind, column] of Object.entries(markers)) {
      if (resource[kind] === undefined) {
        errors.push(
          `${CONTRACT_PATH}: ${table} carries ${column} and declares no ${kind} semantics.`,
        );
        continue;
      }
      if (resource[kind].column !== column) {
        errors.push(
          `${CONTRACT_PATH}: ${table} declares ${kind} column ${resource[kind].column}, but the ` +
            `migrations give it ${column}.`,
        );
      }
    }
  }

  for (const [table, resource] of Object.entries(contract.resources)) {
    const columns = tables.get(table);
    if (columns === undefined) {
      errors.push(`${CONTRACT_PATH}: declares ${table}, which no migration creates.`);
      continue;
    }
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;
      if (!columns.has(entry.column)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} claims ${kind} column ${entry.column}, which no migration adds.`,
        );
      }
    }
  }
}

function checkRecovery({ repoRoot, contract, errors }) {
  const gaps = new Map(
    (contract.recoveryGaps ?? []).map((gap) => [`${gap.table}#${gap.facet}`, gap]),
  );
  const seen = new Set();

  const record = (table, facet, message) => {
    const key = `${table}#${facet}`;
    const gap = gaps.get(key);
    if (gap === undefined) {
      errors.push(message);
      return;
    }
    seen.add(key);
  };

  for (const [table, resource] of Object.entries(contract.resources)) {
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;

      if (entry.restoredBy === null) {
        record(
          table,
          `${kind}.restore`,
          `${CONTRACT_PATH}: ${table} can be ${kind} and names nothing that puts it back. ` +
            'A withdrawal nobody can undo is a deletion with a slower name.',
        );
      } else if (!exists(repoRoot, entry.restoredBy)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} names restore site ${entry.restoredBy}, which does not exist.`,
        );
      } else {
        const source = readSource(repoRoot, entry.restoredBy) ?? '';
        if (!source.includes(entry.column)) {
          errors.push(
            `${CONTRACT_PATH}: ${entry.restoredBy} is named as the restore site for ${table} and ` +
              `never writes ${entry.column}.`,
          );
        }
      }

      if (kind !== 'softDeleted') continue;
      if (entry.purgedBy === null) {
        record(
          table,
          'softDeleted.purge',
          `${CONTRACT_PATH}: ${table} is soft deleted and nothing purges it. "Recoverable until ` +
            'purge" needs a purge; without one the row is kept forever.',
        );
      } else if (!exists(repoRoot, entry.purgedBy)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} names purge site ${entry.purgedBy}, which does not exist.`,
        );
      } else {
        const source = (readSource(repoRoot, entry.purgedBy) ?? '').toLowerCase();
        if (!new RegExp(`delete\\s+from\\s+(?:public\\s*\\.\\s*)?${table}\\b`).test(source)) {
          errors.push(
            `${CONTRACT_PATH}: ${entry.purgedBy} is named as the purge site for ${table} and never ` +
              'deletes from it.',
          );
        }
      }
    }
  }

  for (const [key, gap] of gaps) {
    if (typeof gap.why !== 'string' || gap.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: recovery gap ${key} carries no reason.`);
    }
    if (typeof gap.fix !== 'string' || gap.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: recovery gap ${key} does not say what would close it.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: recovery gap ${key} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }
}

function checkSharing({ repoRoot, contract, shareSurfaces, errors }) {
  for (const [table, resource] of Object.entries(contract.resources)) {
    const surfaces = [...(shareSurfaces.get(table) ?? [])].sort();
    if (surfaces.length === 0) continue;
    for (const kind of ['softDeleted', 'archived']) {
      const entry = resource[kind];
      if (entry === undefined) continue;
      if (entry.sharing === undefined) {
        errors.push(
          `${CONTRACT_PATH}: ${table} is handed out through ${surfaces.join(', ')} and does not say ` +
            `what ${kind} does to that link.`,
        );
        continue;
      }
      if (!contract.sharingOutcomes.includes(entry.sharing.outcome)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} declares ${kind} sharing outcome "${entry.sharing.outcome}", ` +
            `which is not one of ${contract.sharingOutcomes.join(', ')}.`,
        );
      }
      const declared = new Set(entry.sharing.surfaces);
      for (const surface of surfaces) {
        if (!declared.has(surface)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} hands itself out through ${surface}, which its ${kind} ` +
              'sharing entry does not name.',
          );
        }
      }
      for (const surface of declared) {
        if (!surfaces.includes(surface)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} names share surface ${surface}, which no longer references it.`,
          );
        }
      }
      if (entry.sharing.outcome === 'revoked') {
        const site = entry.sharing.revokedBy;
        if (typeof site !== 'string' || !exists(repoRoot, site)) {
          errors.push(
            `${CONTRACT_PATH}: ${table} claims ${kind} revokes its share links and names no site that does it.`,
          );
        } else if (
          !surfaces.some((surface) => (readSource(repoRoot, site) ?? '').includes(surface))
        ) {
          errors.push(
            `${CONTRACT_PATH}: ${site} is named as the ${kind} revocation site for ${table} and ` +
              `mentions none of ${surfaces.join(', ')}.`,
          );
        }
      }
    }
  }
}

function checkReads({ contract, reads, errors }) {
  const exemptions = new Map(
    (contract.readExemptions ?? []).map((entry) => [`${entry.file}#${entry.table}`, entry]),
  );
  const seen = new Set();
  const fresh = [];

  for (const read of reads) {
    const key = `${read.file}#${read.table}`;
    if (exemptions.has(key)) {
      seen.add(key);
      continue;
    }
    fresh.push(read);
  }

  for (const [key, entry] of exemptions) {
    if (!READ_CLASSES.includes(entry.class)) {
      errors.push(
        `${CONTRACT_PATH}: read exemption ${key} claims class "${entry.class}", which is not one of ` +
          `${READ_CLASSES.join(', ')}.`,
      );
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: read exemption ${key} carries no reason.`);
    }
    if (
      entry.class === 'defect' &&
      (typeof entry.fix !== 'string' || entry.fix.trim().length === 0)
    ) {
      errors.push(`${CONTRACT_PATH}: read exemption ${key} is a defect and does not name its fix.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: read exemption ${key} no longer reads withdrawn rows. Delete it; this list only shrinks.`,
      );
    }
  }

  return fresh;
}

function checkArchiveAgreement({ repoRoot, contract, errors }) {
  const shared = readArchivedSemantics(repoRoot);
  if (shared === null) {
    errors.push(
      `${SEMANTICS_MODULE}: RESOURCE_LIFECYCLE_SEMANTICS no longer states what archived means. ` +
        'The archive checks are reading nothing.',
    );
    return;
  }
  for (const facet of contract.archiveFacets) {
    if (shared[facet] === undefined) {
      errors.push(
        `${SEMANTICS_MODULE}: archived says nothing about "${facet}", which ${CONTRACT_PATH} requires.`,
      );
    }
  }
  if (shared.searchable !== false || shared.aiRetrievable !== false) {
    errors.push(
      `${SEMANTICS_MODULE}: archived is declared searchable or retrievable, so nothing stops an ` +
        'archived resource reaching a search result or a model context.',
    );
  }
}

/** Tables a module deletes, whether it spells the name or holds it in a list. */
export function tablesClearedBy({ repoRoot, files, tables }) {
  const cleared = new Set();
  for (const relativePath of files) {
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const code = stripComments(source);
    for (const match of code.matchAll(
      /delete\s+from\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi,
    )) {
      cleared.add(match[1].toLowerCase());
    }
    for (const match of code.matchAll(/['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
      if (tables.has(match[1])) cleared.add(match[1]);
    }
  }
  return cleared;
}

/** Everything a cascade takes with it once one of `roots` is deleted. */
export function cascadeClosure({ roots, foreignKeys }) {
  const children = new Map();
  for (const key of foreignKeys) {
    if (key.action !== 'cascade') continue;
    const entries = children.get(key.parent) ?? new Set();
    entries.add(key.child);
    children.set(key.parent, entries);
  }
  const reached = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    for (const child of children.get(queue.pop()) ?? []) {
      if (reached.has(child)) continue;
      reached.add(child);
      queue.push(child);
    }
  }
  return reached;
}

function storeMembers({ store, tables }) {
  const byName = store.namePattern === undefined ? null : new RegExp(store.namePattern);
  const byColumn = store.columnPattern === undefined ? null : new RegExp(store.columnPattern);
  const members = [];
  for (const [table, columns] of tables) {
    const named = byName !== null && byName.test(table);
    const carried = byColumn !== null && [...columns].some((column) => byColumn.test(column));
    if (named || carried) members.push(table);
  }
  return members.sort();
}

/**
 * A hard delete that stops at the primary row leaves the copy that made the
 * resource findable. Each store names what clears it, and the members are
 * derived from the schema so a new one is in scope the day it is created.
 */
function checkHardDelete({ repoRoot, contract, tables, foreignKeys, errors }) {
  const stores = contract.hardDeleteStores ?? {};
  const exclusions = new Map(
    (contract.hardDeleteExclusions ?? []).map((entry) => [`${entry.table}#${entry.store}`, entry]),
  );
  const seen = new Set();

  for (const [name, store] of Object.entries(stores)) {
    if (typeof store.why !== 'string' || store.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: hard-delete store "${name}" carries no reason for existing.`);
    }
    const members = storeMembers({ store, tables });
    if (members.length === 0) {
      errors.push(
        `${CONTRACT_PATH}: hard-delete store "${name}" matches no table. The pattern is reading ` +
          'nothing, so the store is unguarded.',
      );
      continue;
    }

    const clearedBy = store.clearedBy ?? [];
    for (const site of clearedBy) {
      if (!exists(repoRoot, site)) {
        errors.push(
          `${CONTRACT_PATH}: hard-delete store "${name}" names ${site}, which does not exist.`,
        );
      }
    }

    const cleared = tablesClearedBy({ repoRoot, files: clearedBy, tables });
    const reached = cascadeClosure({ roots: cleared, foreignKeys });

    for (const table of members) {
      const key = `${table}#${name}`;
      if (store.retained === true) {
        if (!cleared.has(table)) continue;
        errors.push(
          `${CONTRACT_PATH}: ${table} is retained by "${name}" and ${clearedBy.join(', ')} deletes it.`,
        );
        continue;
      }
      if (reached.has(table)) continue;
      if (exclusions.has(key)) {
        seen.add(key);
        continue;
      }
      errors.push(
        `${MIGRATIONS_DIR}: ${table} belongs to the "${name}" store and no erasure path reaches it, ` +
          'directly or by cascade. A hard delete leaves it behind.',
      );
    }
  }

  for (const [key, entry] of exclusions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: hard-delete exclusion ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: hard-delete exclusion ${key} is now reached by erasure. Delete it; this list only shrinks.`,
      );
    }
  }
}

export function checkLifecycleSemantics(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const tables = readTableColumns(repoRoot);
  const foreignKeys = readForeignKeys(repoRoot);
  const marked = findMarkedTables({ tables, contract });
  const shareSurfaces = findShareSurfaces({ tables, foreignKeys });
  const files = repositoryFiles(repoRoot);
  const reads = findUnfilteredReads({ repoRoot, files, contract, marked });

  checkResourceCoverage({ contract, tables, marked, errors });
  checkRecovery({ repoRoot, contract, errors });
  checkSharing({ repoRoot, contract, shareSurfaces, errors });
  checkArchiveAgreement({ repoRoot, contract, errors });
  checkHardDelete({ repoRoot, contract, tables, foreignKeys, errors });
  const unrecorded = checkReads({ contract, reads, errors });

  return {
    errors,
    unrecorded,
    report: {
      marked: marked.size,
      resources: Object.keys(contract.resources).length,
      shareSurfaces: [...shareSurfaces.values()].reduce((total, set) => total + set.size, 0),
      exemptions: (contract.readExemptions ?? []).length,
      defects: (contract.readExemptions ?? []).filter((entry) => entry.class === 'defect').length,
      gaps: (contract.recoveryGaps ?? []).length,
      stores: Object.keys(contract.hardDeleteStores ?? {}).length,
    },
  };
}

function main() {
  const { errors, unrecorded, report } = checkLifecycleSemantics(REPO_ROOT);

  if (errors.length > 0 || unrecorded.length > 0) {
    console.error('Lifecycle semantics check failed:');
    for (const error of errors) console.error(`- ${error}`);
    for (const read of unrecorded) {
      console.error(
        `- ${read.file}: reads ${read.table} without naming its withdrawal marker, so a deleted or ` +
          'archived row reaches this caller. Filter it, or record the read and why.',
      );
    }
    process.exit(1);
  }

  console.log(
    `check-lifecycle-semantics: OK (${report.marked} withdrawable tables, ${report.resources} declared, ` +
      `${report.shareSurfaces} share surfaces, ${report.exemptions} recorded reads of which ` +
      `${report.defects} are defects, ${report.gaps} recovery gap(s), ${report.stores} hard-delete stores)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
