#!/usr/bin/env node

/**
 * A client renders what the server decided. It may name a plan, a model, a
 * tool, a policy, a trust mode, a lifecycle state, a billing term, an error
 * class or a provider; it may not restate the vocabulary and reason over it
 * locally, because a private copy drifts and then two layers disagree about
 * what the user is allowed to do.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLIENT_ROOTS, REPO_ROOT, repositoryFiles } from './check-capability-boundaries.mjs';

export { CLIENT_ROOTS, REPO_ROOT };

export const CONTRACT_PACKAGE = '@agiworkforce/types';
const CONTRACT_ROOT = 'packages/contracts/types/src';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * Each family is one decision a client must not make for itself. The members
 * are read from the contract, never restated here, so a vocabulary that grows
 * widens the check by itself.
 */
export const INFERENCE_FAMILIES = Object.freeze([
  { name: 'plan access', file: 'billing-catalog.ts', symbol: 'BillingPlanTier' },
  { name: 'billing semantics', file: 'billing-catalog.ts', symbol: 'BillingPlanCapability' },
  { name: 'tool support', file: 'tool-status.ts', symbol: 'TOOL_STATUSES' },
  { name: 'policy', file: 'enterprise/permissions.ts', symbol: 'ADMIN_PERMISSION_AREAS' },
  { name: 'trust-mode compatibility', file: 'trust-mode-contract.ts', symbol: 'STORAGE_LOCATIONS' },
  { name: 'lifecycle state names', file: 'lifecycle-status.ts', symbol: 'LIFECYCLE_STATUSES' },
  { name: 'error classifications', file: 'reason-codes.ts', symbol: 'CAPABILITY_DENIAL_REASONS' },
  { name: 'provider identity', file: 'provider.ts', symbol: 'Provider' },
]);

export const BASELINE_PATH = 'scripts/check-client-inference.baseline.json';

/** Restating this many members of one vocabulary is a private copy of it. */
export const MIN_DISTINCT_MEMBERS = 3;

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
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

/** Union members or const-array members, whichever spelling the contract uses. */
export function readVocabulary({ repoRoot = REPO_ROOT, file, symbol }) {
  const source = readSource(repoRoot, `${CONTRACT_ROOT}/${file}`);
  if (source === null) return null;
  const union = new RegExp(`export type ${symbol} =([\\s\\S]*?);`).exec(source);
  const array = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  const block = union?.[1] ?? array?.[1];
  if (block === undefined) return null;
  const members = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return members.length === 0 ? null : [...new Set(members)];
}

function importsContract(source) {
  return (
    source.includes(CONTRACT_PACKAGE) ||
    /from\s+['"][^'"]*(?:contracts\/types|capability-handshake|reason-codes|billing-catalog|lifecycle-status|trust-mode-contract|tool-status|provider)['"]/.test(
      source,
    )
  );
}

export function findLocalVocabularies({
  repoRoot = REPO_ROOT,
  files,
  families = INFERENCE_FAMILIES,
}) {
  const vocabularies = families.map((family) => ({
    ...family,
    members: readVocabulary({ repoRoot, ...family }),
  }));
  const unreadable = vocabularies.filter((entry) => entry.members === null);
  const violations = [];

  for (const relativePath of files) {
    if (!CLIENT_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;
    const literals = new Set(
      [...source.matchAll(/['"`]([A-Za-z][A-Za-z0-9_.-]{2,})['"`]/g)].map((match) => match[1]),
    );
    if (literals.size === 0) continue;

    for (const family of vocabularies) {
      if (family.members === null) continue;
      const restated = family.members.filter((member) => literals.has(member));
      if (restated.length < MIN_DISTINCT_MEMBERS) continue;
      if (importsContract(source)) continue;
      violations.push({
        file: relativePath,
        family: family.name,
        symbol: family.symbol,
        contract: `${CONTRACT_ROOT}/${family.file}`,
        restated: restated.slice(0, 6),
      });
    }
  }

  return { violations, unreadable };
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  const raw = readSource(repoRoot, BASELINE_PATH);
  if (raw === null) return { entries: [] };
  return JSON.parse(raw);
}

export function applyBaseline({ violations, baseline }) {
  const recorded = new Map(
    (baseline.entries ?? []).map((entry) => [`${entry.file}#${entry.symbol}`, entry]),
  );
  const seen = new Set();
  const errors = [];
  const fresh = [];

  for (const violation of violations) {
    const key = `${violation.file}#${violation.symbol}`;
    if (recorded.has(key)) {
      seen.add(key);
      continue;
    }
    fresh.push(violation);
  }

  for (const [key, entry] of recorded) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${BASELINE_PATH}: ${key} no longer restates the vocabulary. Delete it; this list only shrinks.`,
      );
    }
  }

  return { errors, fresh };
}

export function checkClientInference(repoRoot = REPO_ROOT) {
  const files = repositoryFiles(repoRoot).map((absolute) =>
    path.relative(repoRoot, absolute).split(path.sep).join('/'),
  );
  const { violations, unreadable } = findLocalVocabularies({ repoRoot, files });
  const errors = unreadable.map(
    (family) =>
      `${CONTRACT_ROOT}/${family.file}: no longer exports ${family.symbol}. The ${family.name} check is reading nothing; point it at the vocabulary that replaced it.`,
  );
  const baseline = applyBaseline({ violations, baseline: loadBaseline(repoRoot) });
  return {
    errors: [...errors, ...baseline.errors],
    violations: baseline.fresh,
    families: INFERENCE_FAMILIES.length,
    recorded: violations.length - baseline.fresh.length,
  };
}

function main() {
  const { errors, violations, families, recorded } = checkClientInference(REPO_ROOT);

  if (errors.length > 0 || violations.length > 0) {
    console.error('Client inference check failed:');
    for (const error of errors) console.error(`- ${error}`);
    for (const violation of violations) {
      console.error(
        `- ${violation.file}: restates ${violation.restated.length}+ members of ${violation.symbol} ` +
          `(${violation.restated.join(', ')}) without importing ${violation.contract}. ` +
          `A client does not decide ${violation.family} for itself.`,
      );
    }
    process.exit(1);
  }

  console.log(
    `check-client-inference: OK (${families} vocabularies, no new client-side copy, ` +
      `${recorded} recorded and shrinking)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
