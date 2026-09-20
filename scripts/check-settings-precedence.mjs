#!/usr/bin/env node

/**
 * Settings resolve in one place. The scope order is total, so two resolutions
 * of the same candidates cannot disagree; every table that stores a setting
 * says which scope it holds; and no client keeps its own idea of which scope
 * wins, because the moment it drifts the reader is shown a value an
 * administrator did not set.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLIENT_ROOTS, REPO_ROOT, repositoryFiles } from './check-capability-boundaries.mjs';

export { CLIENT_ROOTS, REPO_ROOT };

export const SCOPES_MODULE = 'packages/contracts/types/src/settings-scopes.ts';
export const REGISTRY_PATH = 'packages/contracts/types/src/settings-scope-registry.json';
export const MIGRATIONS_DIR = 'apps/web/db/neon';

/** A table whose name says it stores something a reader or an admin set. */
export const SETTINGS_TABLE = /(settings|preferences|policy|policies|controls|overrides|defaults)/;

/** Enough scope names in one file to be a private copy of the order. */
export const MIN_SCOPE_NAMES = 4;

const PRECEDENCE_WORD = /\bprecedence\b|\beffectiveValue\b|\bresolveSetting\b|\boverrideOrder\b/i;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

export function readVocabulary(source, symbol) {
  const match = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (match === null) return null;
  const members = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  return members.length === 0 ? null : members;
}

/** Every table the migration history creates, so a new one is in scope unlisted. */
export function readTableNames(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  const tables = new Set();
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (error?.code === 'ENOENT') return tables;
    throw error;
  }
  for (const name of entries.filter((entry) => /^\d{4}_.+\.sql$/.test(entry)).sort()) {
    const sql = readFileSync(path.join(dir, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .toLowerCase();
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/g,
    )) {
      tables.add(match[1]);
    }
  }
  return tables;
}

export function checkScopeOrder({ scopes, mandatory, errors }) {
  if (scopes === null) {
    errors.push(
      `${SCOPES_MODULE}: no longer exports SETTINGS_SCOPES. Resolution order would be unreadable.`,
    );
    return;
  }
  if (new Set(scopes).size !== scopes.length) {
    errors.push(
      `${SCOPES_MODULE}: SETTINGS_SCOPES repeats a scope, so two candidates can tie and resolution ` +
        'stops being deterministic.',
    );
  }
  if (mandatory === null) {
    errors.push(`${SCOPES_MODULE}: no longer exports MANDATORY_CAPABLE_SCOPES.`);
    return;
  }
  for (const scope of mandatory) {
    if (!scopes.includes(scope)) {
      errors.push(
        `${SCOPES_MODULE}: MANDATORY_CAPABLE_SCOPES names "${scope}", which is not a settings scope.`,
      );
    }
  }
  if (mandatory.length === 0) {
    errors.push(
      `${SCOPES_MODULE}: no scope may set a mandatory rule, so an administrator cannot enforce anything.`,
    );
  }
  if (mandatory.includes('turn') || mandatory.includes('conversation')) {
    errors.push(
      `${SCOPES_MODULE}: a mandate set at the narrowest scope is the reader overruling themselves.`,
    );
  }
}

export function checkScopedTables({ registry, tables, scopes, errors }) {
  const declared = registry.tables ?? {};
  const unscoped = new Map((registry.unscopedTables ?? []).map((entry) => [entry.table, entry]));
  const seenUnscoped = new Set();

  for (const table of [...tables].sort()) {
    if (!SETTINGS_TABLE.test(table)) continue;
    const entry = declared[table];
    if (entry === undefined) {
      if (unscoped.has(table)) {
        seenUnscoped.add(table);
        continue;
      }
      errors.push(
        `${MIGRATIONS_DIR}: ${table} stores a setting and names no scope. A value nobody can place ` +
          `in the order cannot be resolved against the rest. Declare it in ${REGISTRY_PATH}.`,
      );
      continue;
    }
    if (scopes !== null && !scopes.includes(entry.scope)) {
      errors.push(
        `${REGISTRY_PATH}: ${table} claims scope "${entry.scope}", which does not exist.`,
      );
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${REGISTRY_PATH}: ${table} does not say what it holds.`);
    }
  }

  for (const [table, entry] of unscoped) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${REGISTRY_PATH}: unscoped entry ${table} carries no reason.`);
    }
    if (!seenUnscoped.has(table)) {
      errors.push(
        `${REGISTRY_PATH}: unscoped entry ${table} no longer describes a real gap. Delete it; this list only shrinks.`,
      );
    }
  }

  for (const table of Object.keys(declared)) {
    if (!tables.has(table)) {
      errors.push(`${REGISTRY_PATH}: declares ${table}, which no migration creates.`);
    }
  }
}

export function findClientPrecedence({ repoRoot = REPO_ROOT, files, scopes }) {
  const violations = [];
  if (scopes === null) return violations;
  for (const relativePath of files) {
    if (!CLIENT_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = read(repoRoot, relativePath);
    if (source === null || !PRECEDENCE_WORD.test(source)) continue;
    if (source.includes('settings-scopes') || source.includes('@agiworkforce/types')) continue;
    const named = scopes.filter((scope) => new RegExp(`['"\`]${scope}['"\`]`).test(source));
    if (named.length < MIN_SCOPE_NAMES) continue;
    violations.push({ file: relativePath, named: named.slice(0, 6) });
  }
  return violations;
}

export function checkSettingsPrecedence(repoRoot = REPO_ROOT) {
  const errors = [];
  const source = read(repoRoot, SCOPES_MODULE);
  if (source === null) {
    return { errors: [`${SCOPES_MODULE} does not exist.`], report: null };
  }
  const raw = read(repoRoot, REGISTRY_PATH);
  if (raw === null) {
    return { errors: [`${REGISTRY_PATH} does not exist.`], report: null };
  }
  const registry = JSON.parse(raw);
  const scopes = readVocabulary(source, 'SETTINGS_SCOPES');
  const mandatory = readVocabulary(source, 'MANDATORY_CAPABLE_SCOPES');
  const outcomes = readVocabulary(source, 'SETTING_RESOLUTION_OUTCOMES');

  checkScopeOrder({ scopes, mandatory, errors });

  for (const outcome of ['unreadable_value', 'rule_newer_than_reader']) {
    if (outcomes !== null && !outcomes.includes(outcome)) {
      errors.push(
        `${SCOPES_MODULE}: resolution has no "${outcome}" outcome, so a rule it cannot read is ` +
          'indistinguishable from one that was never set.',
      );
    }
  }

  const tables = readTableNames(repoRoot);
  checkScopedTables({ registry, tables, scopes, errors });

  const files = repositoryFiles(repoRoot);
  for (const violation of findClientPrecedence({ repoRoot, files, scopes })) {
    errors.push(
      `${violation.file}: orders ${violation.named.join(', ')} for itself. Precedence is resolved ` +
        `once in ${SCOPES_MODULE} and a client renders the effective value it is given.`,
    );
  }

  return {
    errors,
    report: {
      scopes: scopes?.length ?? 0,
      mandatory: mandatory?.length ?? 0,
      tables: Object.keys(registry.tables ?? {}).length,
      scanned: [...tables].filter((table) => SETTINGS_TABLE.test(table)).length,
    },
  };
}

function main() {
  const { errors, report } = checkSettingsPrecedence(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Settings precedence check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-settings-precedence: OK (${report.scopes} scopes, ${report.mandatory} may mandate, ` +
      `${report.tables} of ${report.scanned} settings tables placed)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
