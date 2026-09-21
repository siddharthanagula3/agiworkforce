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

export const OWNERSHIP_REGISTRY_PATH = 'packages/contracts/types/src/shared-ownership.json';

export const OWNERSHIP_KINDS = Object.freeze(['vocabulary', 'shape', 'constant']);

export function loadOwnershipRegistry(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, OWNERSHIP_REGISTRY_PATH), 'utf8'));
}

/**
 * Each concept is one decision a surface must not make for itself. The members
 * are read from the module the registry names, never restated here, so a
 * vocabulary that grows widens the check by itself.
 */
export function inferenceFamilies(repoRoot = REPO_ROOT) {
  const registry = loadOwnershipRegistry(repoRoot);
  return Object.entries(registry.concepts)
    .filter(([, concept]) => concept.kind === 'vocabulary' && concept.scan !== false)
    .map(([name, concept]) => ({ name, file: concept.module, symbol: concept.symbol }));
}

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

/** Union members, const-array members or object values, whichever spelling the contract uses. */
export function readVocabulary({ repoRoot = REPO_ROOT, file, symbol }) {
  const source = readSource(repoRoot, file.includes('/') ? file : `${CONTRACT_ROOT}/${file}`);
  if (source === null) return null;
  const union = new RegExp(`export type ${symbol} =([\\s\\S]*?);`).exec(source);
  const array = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  const record = new RegExp(`export const ${symbol}(?::[^=]*)? = \\{([\\s\\S]*?)\\n\\}`).exec(
    source,
  );
  const block = union?.[1] ?? array?.[1] ?? record?.[1];
  if (block === undefined) return null;
  const members = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return members.length === 0 ? null : [...new Set(members)];
}

/** A concept the registry names has to be exported by the module it names. */
export function exportsSymbol({ repoRoot = REPO_ROOT, module, symbol }) {
  const source = readSource(repoRoot, module);
  if (source === null) return false;
  return (
    new RegExp(
      `export\\s+(?:declare\\s+)?(?:const|type|interface|class|function|enum)\\s+${symbol}\\b`,
    ).test(source) ||
    new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${symbol}\\b[^}]*\\}`).test(source)
  );
}

function checkOwnership({ repoRoot, registry, errors }) {
  for (const [name, concept] of Object.entries(registry.concepts)) {
    if (!OWNERSHIP_KINDS.includes(concept.kind)) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: "${name}" is a ${concept.kind}, which is not one of ${OWNERSHIP_KINDS.join(', ')}.`,
      );
    }
    if (typeof concept.why !== 'string' || concept.why.trim().length === 0) {
      errors.push(`${OWNERSHIP_REGISTRY_PATH}: "${name}" carries no reason for being owned once.`);
    }
    if (
      concept.scan === false &&
      (typeof concept.scanWhy !== 'string' || concept.scanWhy.trim().length === 0)
    ) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: "${name}" is exempt from the restatement scan and does not say why.`,
      );
    }
    if (!concept.module.startsWith('packages/contracts/')) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: "${name}" is owned by ${concept.module}, which is not a contract package. ` +
          'Shared business logic lives in the shared package, and a surface consumes it.',
      );
      continue;
    }
    if (!exportsSymbol({ repoRoot, module: concept.module, symbol: concept.symbol })) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: "${name}" names ${concept.module}::${concept.symbol}, which that ` +
          'module does not export.',
      );
    }
  }

  for (const [kind, entry] of Object.entries(registry.contractPackage ?? {})) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${OWNERSHIP_REGISTRY_PATH}: contract kind "${kind}" carries no reason.`);
    }
    if (!entry.module.startsWith('packages/contracts/')) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: contract kind "${kind}" lives in ${entry.module}, which is not ` +
          'the contract package. A surface that has to reach outside it for a wire shape owns that shape.',
      );
      continue;
    }
    if (!exportsSymbol({ repoRoot, module: entry.module, symbol: entry.symbol })) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: contract kind "${kind}" names ${entry.module}::${entry.symbol}, ` +
          'which that module does not export.',
      );
    }
  }

  const owned = new Set(Object.keys(registry.concepts));
  for (const gap of registry.ownershipGaps ?? []) {
    if (typeof gap.why !== 'string' || gap.why.trim().length === 0) {
      errors.push(`${OWNERSHIP_REGISTRY_PATH}: ownership gap "${gap.concept}" carries no reason.`);
    }
    if (typeof gap.fix !== 'string' || gap.fix.trim().length === 0) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: ownership gap "${gap.concept}" does not say what would close it.`,
      );
    }
    if (owned.has(gap.concept)) {
      errors.push(
        `${OWNERSHIP_REGISTRY_PATH}: "${gap.concept}" is now owned and still recorded as a gap. Delete it; this list only shrinks.`,
      );
    }
  }
}

function importsContract(source) {
  return (
    source.includes(CONTRACT_PACKAGE) ||
    /from\s+['"][^'"]*(?:contracts\/types|capability-handshake|reason-codes|billing-catalog|lifecycle-status|trust-mode-contract|tool-status|provider)['"]/.test(
      source,
    )
  );
}

export function findLocalVocabularies({ repoRoot = REPO_ROOT, files, families }) {
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
        contract: family.file,
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
  const registry = loadOwnershipRegistry(repoRoot);
  const families = inferenceFamilies(repoRoot);
  const { violations, unreadable } = findLocalVocabularies({ repoRoot, files, families });
  const errors = unreadable.map(
    (family) =>
      `${family.file}: no longer exports ${family.symbol}. The ${family.name} check is reading nothing; point it at the vocabulary that replaced it.`,
  );
  checkOwnership({ repoRoot, registry, errors });
  const baseline = applyBaseline({ violations, baseline: loadBaseline(repoRoot) });
  return {
    errors: [...errors, ...baseline.errors],
    violations: baseline.fresh,
    concepts: Object.keys(registry.concepts).length,
    contractKinds: Object.keys(registry.contractPackage ?? {}).length,
    families: families.length,
    gaps: (registry.ownershipGaps ?? []).length,
    recorded: violations.length - baseline.fresh.length,
  };
}

function main() {
  const { errors, violations, concepts, contractKinds, families, gaps, recorded } =
    checkClientInference(REPO_ROOT);

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
    `check-client-inference: OK (${concepts} shared concepts, ${contractKinds} contract kinds, ` +
      `${families} vocabularies, ${gaps} ` +
      `ownership gap(s), no new client-side copy, ${recorded} recorded and shrinking)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
