#!/usr/bin/env node

/**
 * A feature is identified by an id nothing derives from its label, owned by
 * exactly one domain, and gated by layers that each answer their own question.
 * Every gate is resolved in its own layer's vocabulary, so a policy key
 * standing in for an entitlement, or a rollout flag standing in for either,
 * fails here rather than in a plan a reader was never sold.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLIENT_ROOTS, REPO_ROOT, repositoryFiles } from './check-capability-boundaries.mjs';

export { CLIENT_ROOTS, REPO_ROOT };

export const REGISTRY_PATH = 'packages/contracts/types/src/feature-registry.json';
export const REGISTRY_MODULE = 'packages/contracts/types/src/feature-registry.ts';
export const DOMAIN_REGISTRY = 'packages/contracts/types/src/domain-registry.json';

export const LAYER_VOCABULARIES = Object.freeze({
  entitlement: {
    file: 'packages/contracts/types/src/billing-catalog.ts',
    symbol: 'BillingPlanCapability',
  },
  policy: {
    file: 'packages/contracts/types/src/enterprise/workspace-controls.ts',
    symbol: 'WORKSPACE_FEATURES',
  },
  permission: {
    file: 'packages/contracts/types/src/enterprise/permissions.ts',
    symbol: 'ADMIN_PERMISSION_AREAS',
  },
  trustBoundary: {
    file: 'packages/contracts/types/src/trust-mode-contract.ts',
    symbol: 'STORAGE_LOCATIONS',
  },
  rolloutFlag: {
    file: 'apps/web/lib/feature-flags/routing-flags.ts',
    symbol: null,
  },
});

export const MATURITY_VOCABULARY = Object.freeze({
  file: 'packages/contracts/types/src/model-catalog.ts',
  symbol: 'FEATURE_MATURITIES',
});

export const VERSION_SYMBOLS = Object.freeze([
  'packages/contracts/types/src/developer-session-versioning.ts',
  'apps/web/lib/api-gateway-policy.ts',
  'packages/contracts/cloud-contracts/src/client-handshake.ts',
]);

const FEATURE_ID = /^[a-z][a-z0-9_]*$/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** A file that decides which feature it is looking at, rather than one that says the word. */
const RESOLVES_FEATURES =
  /\bWorkspaceFeature\b|\bworkspaceFeature\b|\bisWorkspaceFeature\b|\bWORKSPACE_FEATURES\b|\bfeatureLabel\b|\bFEATURE_DEFINITIONS\b|\bfeatureId\b/;

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
  const array = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  const union = new RegExp(`export type ${symbol} =([\\s\\S]*?);`).exec(source);
  const block = array?.[1] ?? union?.[1];
  if (block === undefined) return null;
  const members = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return members.length === 0 ? null : [...new Set(members)];
}

function readLayerVocabularies(repoRoot, errors) {
  const vocabularies = {};
  for (const [layer, source] of Object.entries(LAYER_VOCABULARIES)) {
    if (source.symbol === null) {
      const raw = read(repoRoot, source.file);
      vocabularies[layer] =
        raw === null
          ? null
          : [...raw.matchAll(/['"]([a-z0-9_]+\.[a-z0-9_.]+)['"]/g)].map((m) => m[1]);
      continue;
    }
    const raw = read(repoRoot, source.file);
    const members = raw === null ? null : readVocabulary(raw, source.symbol);
    if (members === null) {
      errors.push(
        `${source.file}: no longer exports ${source.symbol}, so the ${layer} gate of every feature ` +
          'is resolved against nothing.',
      );
    }
    vocabularies[layer] = members;
  }
  return vocabularies;
}

/**
 * A label used in a comparison is a label something resolves by, which is the
 * thing that breaks the day the copy changes.
 */
export function findLabelComparisons({ repoRoot = REPO_ROOT, files, labels }) {
  const violations = [];
  for (const relativePath of files) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (relativePath === REGISTRY_PATH || relativePath === REGISTRY_MODULE) continue;
    if (relativePath.endsWith('workspace-controls.ts')) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = read(repoRoot, relativePath);
    if (source === null || !RESOLVES_FEATURES.test(source)) continue;
    for (const label of labels) {
      const pattern = new RegExp(
        `(?:===|!==|\\bcase\\s+|\\.includes\\(|\\bindexOf\\()\\s*['"\`]${label}['"\`]`,
      );
      if (pattern.test(source)) violations.push({ file: relativePath, label });
    }
  }
  return violations;
}

function checkGates({ id, definition, vocabularies, errors }) {
  const gates = definition.gates ?? {};
  for (const [layer, key] of Object.entries(gates)) {
    if (key === null || key === undefined) continue;
    const vocabulary = vocabularies[layer];
    if (vocabulary === null || vocabulary === undefined) continue;
    if (vocabulary.includes(key)) continue;
    const elsewhere = Object.entries(vocabularies).find(
      ([other, members]) => other !== layer && (members ?? []).includes(key),
    );
    if (elsewhere !== undefined) {
      errors.push(
        `${REGISTRY_PATH}: "${id}" gates ${layer} on "${key}", which is a ${elsewhere[0]} key. ` +
          'One layer standing in for another is how a plan limit is answered with a policy refusal.',
      );
      continue;
    }
    errors.push(
      `${REGISTRY_PATH}: "${id}" gates ${layer} on "${key}", which that layer's vocabulary does not carry.`,
    );
  }

  if (gates.entitlement === null && gates.policy === null && gates.permission === null) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" is gated by no entitlement, policy or permission, so nothing decides ` +
        'whether a reader may use it.',
    );
  }
  if (
    gates.rolloutFlag !== null &&
    gates.entitlement === null &&
    gates.policy === null &&
    gates.permission === null
  ) {
    errors.push(
      `${REGISTRY_PATH}: "${id}" is gated only by a rollout flag. A flag says how far a change has ` +
        'been handed out, never whether this account may have it.',
    );
  }
}

export function checkFeatureRegistry(repoRoot = REPO_ROOT) {
  const errors = [];
  const raw = read(repoRoot, REGISTRY_PATH);
  if (raw === null) return { errors: [`${REGISTRY_PATH} does not exist.`], report: null };
  const registry = JSON.parse(raw);
  const features = registry.features ?? {};

  const vocabularies = readLayerVocabularies(repoRoot, errors);
  const maturitySource = read(repoRoot, MATURITY_VOCABULARY.file);
  const maturities =
    maturitySource === null ? null : readVocabulary(maturitySource, MATURITY_VOCABULARY.symbol);
  const domainsRaw = read(repoRoot, DOMAIN_REGISTRY);
  const domains =
    domainsRaw === null ? null : JSON.parse(domainsRaw).domains.map((domain) => domain.name);
  const versionSymbols = new Set(
    VERSION_SYMBOLS.flatMap((file) => {
      const source = read(repoRoot, file);
      return source === null
        ? []
        : [...source.matchAll(/export const ([A-Z][A-Z0-9_]*)\b/g)].map((match) => match[1]);
    }),
  );

  const policyFeatures = vocabularies.policy;
  if (policyFeatures !== null) {
    for (const feature of policyFeatures) {
      if (features[feature] === undefined) {
        errors.push(
          `${REGISTRY_PATH}: the workspace controls govern "${feature}" and the registry does not ` +
            'define it, so a feature an administrator can turn off has no owner, maturity or gates.',
        );
      }
    }
  }

  for (const [id, definition] of Object.entries(features)) {
    if (!FEATURE_ID.test(id)) {
      errors.push(`${REGISTRY_PATH}: "${id}" is not a stable identifier.`);
    }
    if (typeof definition.label !== 'string' || definition.label.trim().length === 0) {
      errors.push(`${REGISTRY_PATH}: "${id}" carries no display name.`);
    }
    if (domains !== null && !domains.includes(definition.domain)) {
      errors.push(
        `${REGISTRY_PATH}: "${id}" is owned by "${definition.domain}", which is not a product domain.`,
      );
    }
    if (maturities !== null && !maturities.includes(definition.maturity)) {
      errors.push(`${REGISTRY_PATH}: "${id}" claims maturity "${definition.maturity}".`);
    }

    for (const dependency of definition.dependsOn ?? []) {
      if (features[dependency] === undefined) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" depends on "${dependency}", which is not a feature.`,
        );
      }
      if (dependency === id) {
        errors.push(`${REGISTRY_PATH}: "${id}" depends on itself.`);
      }
      if ((definition.incompatibleWith ?? []).includes(dependency)) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" both needs and refuses "${dependency}", so it can never be on.`,
        );
      }
    }

    for (const other of definition.incompatibleWith ?? []) {
      if (features[other] === undefined) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" is incompatible with "${other}", which is not a feature.`,
        );
        continue;
      }
      if (!(features[other].incompatibleWith ?? []).includes(id)) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" refuses "${other}" and "${other}" does not refuse "${id}". ` +
            'Which of the two is on would then depend on which was asked first.',
        );
      }
    }

    const needsFloor = definition.requiresHost !== null && definition.requiresHost !== undefined;
    for (const [field, value] of [
      ['minClientVersion', definition.minClientVersion],
      ['minBackendVersion', definition.minBackendVersion],
    ]) {
      if (needsFloor && (value === null || value === undefined)) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" needs ${definition.requiresHost} and records no ${field}, so a ` +
            'host too old to run it is told nothing.',
        );
        continue;
      }
      if (!needsFloor && value !== null && value !== undefined) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" needs no host and records a ${field}, which nothing can enforce.`,
        );
        continue;
      }
      if (value !== null && value !== undefined && !versionSymbols.has(value)) {
        errors.push(
          `${REGISTRY_PATH}: "${id}" records ${field} "${value}", which is not a version symbol this ` +
            'repository declares. Name the constant, never a copy of its value.',
        );
      }
    }

    checkGates({ id, definition, vocabularies, errors });
  }

  const labels = Object.values(features)
    .map((definition) => definition.label)
    .filter((label) => typeof label === 'string' && label.length > 2);
  const files = repositoryFiles(repoRoot);
  for (const violation of findLabelComparisons({ repoRoot, files, labels })) {
    errors.push(
      `${violation.file}: resolves a feature by its display name "${violation.label}". The id is what ` +
        'anything compares; a label is copy and changes without a migration.',
    );
  }

  const moduleSource = read(repoRoot, REGISTRY_MODULE);
  if (moduleSource === null || !/registryJson\.features/.test(moduleSource)) {
    errors.push(
      `${REGISTRY_MODULE}: no longer reads ${REGISTRY_PATH}, so the type and the table can disagree.`,
    );
  }

  return {
    errors,
    report: {
      features: Object.keys(features).length,
      layers: Object.keys(LAYER_VOCABULARIES).length,
      gated: Object.values(features).filter((definition) => definition.gates?.entitlement !== null)
        .length,
    },
  };
}

function main() {
  const { errors, report } = checkFeatureRegistry(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Feature registry check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-feature-registry: OK (${report.features} features over ${report.layers} control layers, ` +
      `${report.gated} carry a plan entitlement)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
