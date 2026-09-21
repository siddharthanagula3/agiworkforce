#!/usr/bin/env node

/**
 * One evaluator, and nothing a flag is allowed to decide for somebody.
 *
 * The prefixes are read from the modules that define them and every literal
 * under one, anywhere in the product, has to be a key its namespace spells: a
 * key an operator types and a key the code reads cannot be allowed to drift
 * apart. The modules that answer what a plan carries, which model exists and
 * whether an action needs approval may not consult a flag at all, because a
 * gate that can be opened by a flag is not a gate. What the product hands a
 * client as a flag but resolves somewhere else is listed with its real source,
 * and that list may shrink and never grow.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const FLAG_DIR = 'apps/web/lib/feature-flags';
export const CONFIG_SCHEMA = `${FLAG_DIR}/config-schema.ts`;
export const ME_CONTRACT = 'packages/contracts/cloud-contracts/src/me.ts';
export const BASELINE = 'scripts/config/feature-flag-reads.json';

/**
 * Modules that decide what an account is entitled to, which model exists, or
 * whether a person has to approve something. A flag reaching one of these is
 * the finding: it would mean a rollout percentage could hand somebody a plan
 * they did not buy or wave away an approval somebody was owed.
 */
export const GATE_MODULES = [
  'apps/web/lib/entitlement.ts',
  'apps/web/lib/tool-approval-view.ts',
  'packages/contracts/types/src/subscription-entitlement.ts',
  'packages/contracts/types/src/billing-catalog.ts',
  'packages/contracts/types/src/tool-approval-policy.ts',
  'packages/contracts/types/src/enterprise/permissions.ts',
  'packages/contracts/types/src/model-catalog.ts',
];

const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/features',
  'apps/web/lib',
  'apps/web/shared',
  'packages',
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  'generated',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'e2e',
]);

const SOURCE = /\.tsx?$/;
const NON_PRODUCTION = /\.(test|spec|bench|stories)\.[cm]?tsx?$|\.d\.ts$/;
const PREFIX_DECLARATION = /export const ([A-Z][A-Z0-9_]*(?:FLAG_PREFIX|FLAG_KEY)) = '([^']+)'/g;
const FLAG_MODULE_IMPORT = /from '[^']*(?:feature-flags|evaluate-flags|flag-store)[^']*'/;

function read(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}

export function productionFiles(repoRoot, roots = SCAN_ROOTS) {
  const found = [];
  const walk = (relative) => {
    const absolute = path.join(repoRoot, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(next);
        continue;
      }
      if (SOURCE.test(entry.name) && !NON_PRODUCTION.test(entry.name)) found.push(next);
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

/** Every reserved flag prefix, read from the modules that define them. */
export function flagPrefixes(repoRoot) {
  const absolute = path.join(repoRoot, FLAG_DIR);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];
  const prefixes = new Map();
  for (const entry of readdirSync(absolute)) {
    if (!SOURCE.test(entry) || NON_PRODUCTION.test(entry)) continue;
    const source = readFileSync(path.join(absolute, entry), 'utf8');
    PREFIX_DECLARATION.lastIndex = 0;
    let match;
    while ((match = PREFIX_DECLARATION.exec(source)) !== null) {
      prefixes.set(match[2], `${FLAG_DIR}/${entry}`);
    }
  }
  return [...prefixes.entries()]
    .map(([prefix, definedIn]) => ({ prefix, definedIn }))
    .sort((left, right) => left.prefix.localeCompare(right.prefix));
}

function namespaceReaders(source) {
  return [...source.matchAll(/reader: '([^']+)'/g)].map((match) => match[1]);
}

function checkNamespaces(repoRoot, errors) {
  const schema = read(repoRoot, CONFIG_SCHEMA);
  if (schema === null) {
    errors.push(
      `${CONFIG_SCHEMA}: the namespace registry is gone, so no key has a declared reader.`,
    );
    return [];
  }
  const ids = /FLAG_NAMESPACE_IDS = \[([\s\S]*?)\]/.exec(schema);
  const members = ids === null ? [] : [...ids[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const readers = namespaceReaders(schema);
  if (members.length !== readers.length) {
    errors.push(
      `${CONFIG_SCHEMA}: ${members.length} namespaces declare ${readers.length} readers. Every ` +
        'namespace names the module that spells its keys or the keys are read by nobody.',
    );
  }
  for (const reader of readers) {
    const module = `apps/web/${reader.split(' ')[0]}.ts`;
    if (existsSync(path.join(repoRoot, module))) continue;
    errors.push(
      `${CONFIG_SCHEMA}: a namespace names ${reader} as its reader and ${module} does not exist, ` +
        'so the keys it claims to spell are spelled nowhere.',
    );
  }
  return members;
}

export function handSpelledKeys(repoRoot, prefixes, files) {
  const findings = new Map();
  for (const file of files) {
    if (file.startsWith(`${FLAG_DIR}/`)) continue;
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const { prefix } of prefixes) {
      const pattern = new RegExp(
        `'(${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9_.:-]*)'`,
        'g',
      );
      let match;
      while ((match = pattern.exec(source)) !== null) {
        findings.set(`${file}::${match[1]}`, { file, key: match[1] });
      }
    }
  }
  return [...findings.values()];
}

function checkGateModules(repoRoot, prefixes, errors) {
  for (const module of GATE_MODULES) {
    const source = read(repoRoot, module);
    if (source === null) {
      errors.push(
        `${module} is named a gate that no flag may reach and no longer exists. Move the entry to ` +
          'wherever that decision now lives rather than dropping the rule.',
      );
      continue;
    }
    if (FLAG_MODULE_IMPORT.test(source)) {
      errors.push(
        `${module} imports the flag module. What a plan carries, which model exists and whether an ` +
          'action needs approval are not rollout decisions, and a gate a flag can open is not a gate.',
      );
    }
    for (const { prefix } of prefixes) {
      if (!source.includes(`'${prefix}`)) continue;
      errors.push(`${module} spells a ${prefix} flag key, so a flag decides an entitlement here.`);
    }
  }
}

function checkWireFlags(repoRoot, baseline, errors) {
  const contract = read(repoRoot, ME_CONTRACT);
  if (contract === null) {
    errors.push(`${ME_CONTRACT}: the flag wire shape is gone; nothing says what a client is told.`);
    return;
  }
  const block = /MeFeatureFlagsSchema = z\s*\.object\(\{([\s\S]*?)\}\)/.exec(contract);
  if (block === null) {
    errors.push(`${ME_CONTRACT}: MeFeatureFlagsSchema could not be read.`);
    return;
  }
  const declared = [...block[1].matchAll(/^\s{4}([a-z_][a-z0-9_]*):/gm)].map((match) => match[1]);
  const listed = new Set(Object.keys(baseline.resolvedElsewhere ?? {}));
  for (const key of declared) {
    if (listed.has(key)) continue;
    errors.push(
      `${ME_CONTRACT}: a client is handed "${key}" as a feature flag and ${BASELINE} does not say ` +
        'where it is really resolved. A value the evaluator never saw cannot be turned off during ' +
        'an incident, and nothing records why it is exempt.',
    );
  }
  for (const [key, entry] of Object.entries(baseline.resolvedElsewhere ?? {})) {
    if (!declared.includes(key)) {
      errors.push(
        `${BASELINE}: "${key}" is recorded as resolved outside the evaluator and ${ME_CONTRACT} no ` +
          'longer hands it to anyone. Delete the entry.',
      );
      continue;
    }
    if (typeof entry?.reason !== 'string' || typeof entry?.resolvedBy !== 'string') {
      errors.push(
        `${BASELINE}: "${key}" carries no reason and no resolver, so it is an open allowance.`,
      );
      continue;
    }
    const module = entry.resolvedBy.split(' ')[0];
    if (existsSync(path.join(repoRoot, module))) continue;
    errors.push(
      `${BASELINE}: "${key}" says it is resolved by ${module}, which does not exist, so the record ` +
        'of where this value really comes from has rotted.',
    );
  }
}

function checkHandSpelled(repoRoot, prefixes, files, baseline, errors) {
  const allowed = new Map(
    (baseline.handSpelled ?? []).map((entry) => [`${entry.file}::${entry.key}`, entry]),
  );
  const seen = new Set();
  for (const finding of handSpelledKeys(repoRoot, prefixes, files)) {
    const id = `${finding.file}::${finding.key}`;
    seen.add(id);
    const entry = allowed.get(id);
    if (entry === undefined) {
      errors.push(
        `${finding.file} spells the flag key "${finding.key}" by hand. Derive it from the module ` +
          'that owns the prefix, so an operator who renames a key renames it everywhere.',
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
      errors.push(
        `${BASELINE}: the allowance for "${finding.key}" in ${finding.file} has no reason.`,
      );
    }
  }
  for (const id of allowed.keys()) {
    if (seen.has(id)) continue;
    errors.push(`${BASELINE}: the allowance ${id} matches nothing any more. Delete the entry.`);
  }
}

export function checkFeatureFlags(repoRoot) {
  const errors = [];
  const raw = read(repoRoot, BASELINE);
  if (raw === null) {
    errors.push(`${BASELINE}: the record of what does not go through the evaluator is missing.`);
    return { errors, prefixes: 0, files: 0 };
  }
  const baseline = JSON.parse(raw);
  const prefixes = flagPrefixes(repoRoot);
  if (prefixes.length === 0) {
    errors.push(`${FLAG_DIR}: no flag prefix is declared, so no key can be checked against one.`);
  }
  checkNamespaces(repoRoot, errors);
  const files = productionFiles(repoRoot);
  checkHandSpelled(repoRoot, prefixes, files, baseline, errors);
  checkGateModules(repoRoot, prefixes, errors);
  checkWireFlags(repoRoot, baseline, errors);
  return { errors, prefixes: prefixes.length, files: files.length };
}

function main() {
  const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
  const { errors, prefixes, files } = checkFeatureFlags(repoRoot);
  if (errors.length > 0) {
    console.error('Feature flag check failed:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `Feature flag check passed (${prefixes} reserved prefixes, ${files} production files scanned, ` +
      `${GATE_MODULES.length} gates no flag reaches).`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
