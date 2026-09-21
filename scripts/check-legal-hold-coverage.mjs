#!/usr/bin/env node

// A hold is a claim about paths nobody has written yet, so it is checked by
// enumeration: stores from the contract, reach from the foreign keys.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readForeignKeys } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/resource-lifecycle.ts';
export const GATE_PATH = 'apps/web/lib/services/legal-hold-gate.ts';
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const BASELINE_PATH = 'scripts/check-legal-hold-coverage.baseline.json';
export const SOURCE_ROOTS = Object.freeze(['apps/web/app/', 'apps/web/lib/', 'packages/']);

// The predicate has to be INSIDE the statement that destroys. Importing the
// gate and deriving a list of held people first is the read-then-delete a hold
// placed mid-run beats, so it is not accepted here.
export const IN_STATEMENT = /\$\{[^}]*(?:[Ee]xclusion|notHeld|notHeldById)[^}]*\}/;

// The two paths that legitimately refuse before they start. Both ask an
// uncapped COUNT, so no workspace can outgrow the answer, and both abandon the
// whole erasure rather than narrowing it.
export const REFUSAL_SYMBOLS = Object.freeze([
  'isSubjectUnderLegalHold',
  'isOrganizationUnderActiveLegalHold',
]);

// A module that asks the contract whether its table is holdable and refuses to
// render a statement without the predicate has answered as firmly.
export const RENDER_REFUSAL_SYMBOL = 'holdableResourceForTable';

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

/** The holdable stores, read from the contract rather than restated here. */
export function readHoldableResources(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, CONTRACT_PATH);
  if (source === null) return [];
  const block = /HOLDABLE_RESOURCES:\s*readonly HoldableResource\[\]\s*=\s*\[([\s\S]*?)\n\];/.exec(
    source,
  );
  if (block === null) return [];
  const resources = [];
  for (const entry of block[1].split(/\}\s*,/)) {
    const type = /resourceType:\s*'([a-z_]+)'/.exec(entry);
    const table = /table:\s*'([a-z_]+)'/.exec(entry);
    if (type && table) resources.push({ resourceType: type[1], table: table[1] });
  }
  return resources;
}

// A store the migration lets a hold name and the contract does not declare is a
// hold over content no deletion path will ever check.
export function readHoldVocabulary(repoRoot = REPO_ROOT) {
  const vocabulary = new Set();
  let names = [];
  try {
    names = readdirSync(path.join(repoRoot, MIGRATIONS_DIR));
  } catch {
    return vocabulary;
  }
  for (const name of names.sort()) {
    if (!name.endsWith('.sql')) continue;
    const relativePath = `${MIGRATIONS_DIR}/${name}`;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const constraint = /resource_types\s*<@\s*array\[([^\]]*)\]/i.exec(source);
    if (constraint === null) continue;
    for (const match of constraint[1].matchAll(/'([a-z_]+)'/g)) vocabulary.add(match[1]);
  }
  return vocabulary;
}

// Holdable tables plus everything a cascading key reaches them from: a delete
// on a parent is a delete on the child, and the schema says which.
export function destructiveReach({ holdableTables, foreignKeys }) {
  const parents = new Map();
  for (const key of foreignKeys) {
    if (key.action !== 'cascade') continue;
    const entries = parents.get(key.child) ?? new Set();
    entries.add(key.parent);
    parents.set(key.child, entries);
  }

  const reach = new Map();
  for (const table of holdableTables) {
    const queue = [table];
    const seen = new Set([table]);
    while (queue.length > 0) {
      const current = queue.pop();
      const held = reach.get(current) ?? new Set();
      held.add(table);
      reach.set(current, held);
      for (const parent of parents.get(current) ?? []) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return reach;
}

const DELETE_RE = /delete\s+from\s+(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/gi;

// A DELETE aimed by a registry at run time, which the literal sweep above
// cannot see at all.
const INDIRECT_DELETE_RE = /delete\s+from\s+(?:only\s+)?(?:public\s*\.\s*)?(\$\{|["'`]\s*\+)/gi;

export const INDIRECT_TABLE = '<computed>';

// The SQL literal a destructive statement lives in, so a predicate elsewhere in
// the file cannot vouch for a statement that does not carry it.
export function statementAround(code, index) {
  for (const quote of ['`', "'", '"']) {
    const start = code.lastIndexOf(quote, index);
    if (start === -1) continue;
    const end = code.indexOf(quote, index);
    if (end === -1) continue;
    const span = code.slice(start, end + 1);
    if (/delete\s+from/i.test(span)) return span;
  }
  // A statement this cannot isolate is not a statement it can vouch for.
  return '';
}

/** Every destructive statement in production code, with the file that holds it. */
export function findDestructiveSites({ repoRoot = REPO_ROOT, files, reach }) {
  const sites = [];
  for (const relativePath of files) {
    if (!SOURCE_ROOTS.some((root) => relativePath.startsWith(root))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath === GATE_PATH) continue;
    const raw = readSource(repoRoot, relativePath);
    if (raw === null) continue;
    const code = stripComments(raw);

    const refuses =
      REFUSAL_SYMBOLS.some((symbol) => code.includes(symbol)) ||
      code.includes(RENDER_REFUSAL_SYMBOL);

    const destroyed = new Map();
    for (const match of code.matchAll(DELETE_RE)) {
      const table = match[1].toLowerCase();
      const held = reach.get(table);
      if (held === undefined) continue;
      destroyed.set(table, {
        held: [...held].sort(),
        gated: refuses || IN_STATEMENT.test(statementAround(code, match.index ?? 0)),
      });
    }
    if (INDIRECT_DELETE_RE.test(code)) {
      INDIRECT_DELETE_RE.lastIndex = 0;
      // The registry aiming the statement is in the same module, as a list of
      // quoted table names, so the reach is what those names reach.
      const named = new Set();
      for (const match of code.matchAll(/['"`]([a-z_][a-z0-9_]*)['"`]/g)) {
        for (const held of reach.get(match[1]) ?? []) named.add(held);
      }
      if (named.size > 0) {
        destroyed.set(INDIRECT_TABLE, { held: [...named].sort(), gated: refuses });
      }
    }
    if (destroyed.size === 0) continue;

    for (const table of [...destroyed.keys()].sort()) {
      const entry = destroyed.get(table);
      sites.push({ file: relativePath, table, held: entry.held, gated: entry.gated });
    }
  }
  return sites;
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  const raw = readSource(repoRoot, BASELINE_PATH);
  return raw === null ? { unguarded: [] } : JSON.parse(raw);
}

function checkVocabulary({ resources, vocabulary, errors }) {
  const declared = new Set(resources.map((entry) => entry.resourceType));
  if (vocabulary.size === 0) {
    errors.push(
      `${MIGRATIONS_DIR}: no migration constrains legal_holds.resource_types, so the guard is ` +
        'reading no vocabulary and a hold can name any store at all.',
    );
    return;
  }
  for (const type of vocabulary) {
    if (declared.has(type)) continue;
    errors.push(
      `${CONTRACT_PATH}: a hold may name "${type}" and HOLDABLE_RESOURCES does not declare it, so ` +
        'no deletion path knows which table that hold preserves.',
    );
  }
  for (const type of declared) {
    if (vocabulary.has(type)) continue;
    errors.push(
      `${CONTRACT_PATH}: declares holdable resource "${type}", which the legal_holds CHECK ` +
        'constraint refuses, so no hold can ever name it.',
    );
  }
}

function checkTablesExist({ resources, foreignKeys, errors }) {
  const known = new Set();
  for (const key of foreignKeys) {
    known.add(key.child);
    known.add(key.parent);
  }
  if (known.size === 0) return;
  for (const resource of resources) {
    if (known.has(resource.table)) continue;
    errors.push(
      `${CONTRACT_PATH}: "${resource.resourceType}" names table ${resource.table}, which no ` +
        'migration references. A hold over a table that does not exist preserves nothing.',
    );
  }
}

function checkSites({ sites, baseline, errors, known }) {
  const recorded = new Map(
    (baseline.unguarded ?? []).map((entry) => [`${entry.file}#${entry.table}`, entry]),
  );
  const seen = new Set();
  const unguarded = [];

  for (const site of sites) {
    if (site.gated) continue;
    const key = `${site.file}#${site.table}`;
    const entry = recorded.get(key);
    if (entry !== undefined) {
      seen.add(key);
      known.push(entry);
      continue;
    }
    unguarded.push(site);
  }

  for (const [key, entry] of recorded) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: recorded gap ${key} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: recorded gap ${key} does not say what would close it.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${BASELINE_PATH}: recorded gap ${key} no longer destroys a held store without checking. ` +
          'Delete it; this list only shrinks.',
      );
    }
  }

  return unguarded;
}

export const PREDICATE_SYMBOL = 'legalHoldPredicate';

/**
 * The body of the predicate alone. Read against the whole module, a scope
 * survives in a type alias long after the SQL has stopped matching on it.
 */
export function readPredicateSource(repoRoot = REPO_ROOT) {
  const source = readSource(repoRoot, GATE_PATH);
  if (source === null) return null;
  const start = source.indexOf(`export function ${PREDICATE_SYMBOL}(`);
  if (start === -1) return null;
  const end = source.indexOf('\nexport ', start + 1);
  return stripComments(source.slice(start, end === -1 ? source.length : end));
}

function checkGate({ repoRoot, resources, errors }) {
  const code = readPredicateSource(repoRoot);
  if (code === null) {
    errors.push(
      `${GATE_PATH}: no ${PREDICATE_SYMBOL} renders the hold predicate, so every caller is ` +
        'writing its own and the guard is reading nothing.',
    );
    return;
  }
  // The predicate is only a gate if it reads every shape a hold can take. A
  // scope it never names is a hold that preserves nobody while reading active.
  for (const scope of ['organization', 'member', 'custodian']) {
    if (code.includes(`'${scope}'`)) continue;
    errors.push(
      `${GATE_PATH}: the hold predicate never names the "${scope}" scope, so a hold placed that ` +
        'way excludes no row from any sweep.',
    );
  }
  if (!code.includes('legal_hold_custodians')) {
    errors.push(
      `${GATE_PATH}: the hold predicate never reads legal_hold_custodians, so a custodian-scoped ` +
        'hold preserves nobody.',
    );
  }
  if (!code.includes('released_at is null')) {
    errors.push(
      `${GATE_PATH}: the hold predicate does not restrict itself to active holds, so a released ` +
        'hold would keep preserving rows for ever.',
    );
  }
  if (resources.length > 0 && !code.includes('holdableResource')) {
    errors.push(
      `${GATE_PATH}: the gate does not read HOLDABLE_RESOURCES, so it can disagree with the ` +
        'contract about which table a hold names.',
    );
  }
}

export function checkLegalHoldCoverage(repoRoot = REPO_ROOT, options = {}) {
  const errors = [];
  const known = [];
  const files = options.files ?? repositoryFiles(repoRoot);
  const resources = readHoldableResources(repoRoot);
  const vocabulary = readHoldVocabulary(repoRoot);
  const foreignKeys = readForeignKeys(repoRoot);

  if (resources.length === 0) {
    errors.push(
      `${CONTRACT_PATH}: HOLDABLE_RESOURCES is empty or unreadable, so this guard enumerates ` +
        'nothing and every deletion path passes by default.',
    );
    return { errors, unguarded: [], known, report: { resources: 0, sites: 0, gated: 0, reach: 0 } };
  }

  checkVocabulary({ resources, vocabulary, errors });
  checkTablesExist({ resources, foreignKeys, errors });
  checkGate({ repoRoot, resources, errors });

  const reach = destructiveReach({
    holdableTables: resources.map((entry) => entry.table),
    foreignKeys,
  });
  const sites = findDestructiveSites({ repoRoot, files, reach });
  const unguarded = checkSites({ sites, baseline: loadBaseline(repoRoot), errors, known });

  return {
    errors,
    unguarded,
    known,
    report: {
      resources: resources.length,
      sites: sites.length,
      gated: sites.filter((site) => site.gated).length,
      reach: reach.size,
    },
  };
}

function main() {
  const { errors, unguarded, known, report } = checkLegalHoldCoverage(REPO_ROOT);

  // Recorded gaps are printed on every run, passing or failing. A defect a
  // guard knows about and never mentions is a defect nobody fixes.
  for (const entry of known) {
    console.warn(
      `check-legal-hold-coverage: ${entry.file} deletes ${entry.table} without checking holds. ` +
        `${entry.why} Fix: ${entry.fix}`,
    );
  }

  if (errors.length > 0 || unguarded.length > 0) {
    console.error('Legal hold coverage check failed:');
    for (const error of errors) console.error(`- ${error}`);
    for (const site of unguarded) {
      console.error(
        `- ${site.file}: deletes ${site.table}, which destroys held ${site.held.join(', ')} rows, ` +
          'and never asks whether a legal hold preserves them. Exclude them with ' +
          'legalHoldExclusion, or refuse the whole path the way account erasure does.',
      );
    }
    process.exit(1);
  }

  console.log(
    `check-legal-hold-coverage: OK (${report.resources} holdable stores, ${report.reach} tables ` +
      `whose deletion reaches one, ${report.gated} of ${report.sites} destructive sites gated, ` +
      `${known.length} recorded gap(s) awaiting a fix)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
