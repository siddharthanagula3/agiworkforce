#!/usr/bin/env node

/**
 * One error model. Every code the canonical registries declare belongs to
 * exactly one class, every class says whether repeating the request can work,
 * how much of an upstream's words may reach the reader and what the reader can
 * do next, and no client works any of that out for itself.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLIENT_ROOTS, REPO_ROOT, repositoryFiles } from './check-capability-boundaries.mjs';

export { CLIENT_ROOTS, REPO_ROOT };

export const ERRORS_MODULE = 'packages/contracts/types/src/errors.ts';
export const TAXONOMY_JSON = 'packages/contracts/types/src/error-taxonomy.json';
export const TAXONOMY_MODULE = 'packages/contracts/types/src/error-taxonomy.ts';
export const REMEDY_MODULE = 'packages/contracts/types/src/lifecycle-status.ts';

export const CODE_REGISTRIES = Object.freeze(['ErrorCode', 'DenialErrorCode', 'DomainErrorCode']);

export const BASELINE_PATH = 'scripts/check-error-model.baseline.json';

/** Where the taxonomy itself lives: classifying a code is not raising it. */
const CONTRACT_ROOT = 'packages/contracts/types/src/';

/** Enough canonical names in one file to be a private table of them. */
export const MIN_LOCAL_CODES = 3;

/** A place that decides whether to send the request again, not one that mentions it. */
const RETRY_DECISION = /\bretry\s*[:(]|\bshouldRetry\b|\bisRetryable\b|\bcanRetry\b|\bretryable\b/;

/** The code as a value, not as a fragment of some other identifier. */
function namesCode(source, code) {
  return new RegExp(`(?:['"\`]${code}['"\`]|\\.${code}\\b)`).test(source);
}

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

/** The members of one `export const X = { ... } as const` registry. */
export function readCodeRegistry(source, name) {
  const block = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(source);
  if (block === null) return null;
  const members = [...block[1].matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((match) => match[1]);
  return members.length === 0 ? null : members;
}

export function readCanonicalCodes(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, ERRORS_MODULE);
  if (source === null) return { codes: null, errors: [`${ERRORS_MODULE} does not exist.`] };
  const errors = [];
  const codes = new Map();
  for (const registry of CODE_REGISTRIES) {
    const members = readCodeRegistry(source, registry);
    if (members === null) {
      errors.push(
        `${ERRORS_MODULE}: no longer exports a ${registry} registry this guard can read. ` +
          'Point it at the registry that replaced it; an unreadable registry stops every code being classified.',
      );
      continue;
    }
    for (const member of members) {
      if (codes.has(member)) {
        errors.push(`${ERRORS_MODULE}: ${member} is declared in two registries.`);
        continue;
      }
      codes.set(member, registry);
    }
  }
  return { codes, errors };
}

/** Union or const-array members of one exported vocabulary. */
export function readVocabulary(source, symbol) {
  const array = new RegExp(`export const ${symbol} = \\[([\\s\\S]*?)\\]`).exec(source);
  const union = new RegExp(`export type ${symbol} =([\\s\\S]*?);`).exec(source);
  const block = array?.[1] ?? union?.[1];
  if (block === undefined) return null;
  const members = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return members.length === 0 ? null : members;
}

export function loadTaxonomy(repoRoot = REPO_ROOT) {
  const raw = read(repoRoot, TAXONOMY_JSON);
  return raw === null ? null : JSON.parse(raw);
}

function checkClassVocabulary({ taxonomy, repoRoot, errors }) {
  const moduleSource = read(repoRoot, TAXONOMY_MODULE);
  const declared = moduleSource === null ? null : readVocabulary(moduleSource, 'ERROR_CLASSES');
  if (declared === null) {
    errors.push(
      `${TAXONOMY_MODULE}: no longer exports ERROR_CLASSES. The type and the table would drift apart unread.`,
    );
    return null;
  }
  const tabled = Object.keys(taxonomy.classes ?? {});
  for (const errorClass of declared) {
    if (!tabled.includes(errorClass)) {
      errors.push(
        `${TAXONOMY_JSON}: class "${errorClass}" is declared in the type and has no rule.`,
      );
    }
  }
  for (const errorClass of tabled) {
    if (!declared.includes(errorClass)) {
      errors.push(
        `${TAXONOMY_MODULE}: ERROR_CLASSES omits "${errorClass}", which ${TAXONOMY_JSON} rules on. ` +
          'A class nothing can name is a class no caller can be given.',
      );
    }
  }
  return declared;
}

function checkClassRules({ taxonomy, repoRoot, errors }) {
  const remedySource = read(repoRoot, REMEDY_MODULE);
  const remedies = remedySource === null ? null : readVocabulary(remedySource, 'SURFACE_REMEDIES');
  if (remedies === null) {
    errors.push(`${REMEDY_MODULE}: no longer exports SURFACE_REMEDIES to check remedies against.`);
  }
  const disclosures = new Set(['hidden', 'summary']);

  for (const [errorClass, rule] of Object.entries(taxonomy.classes ?? {})) {
    if (typeof rule.why !== 'string' || rule.why.trim().length === 0) {
      errors.push(`${TAXONOMY_JSON}: class "${errorClass}" carries no reason for existing.`);
    }
    if (typeof rule.retryable !== 'boolean') {
      errors.push(
        `${TAXONOMY_JSON}: class "${errorClass}" does not say whether repeating the request can work. ` +
          'A client reads this flag, so an absent one becomes a guess made on the wrong side.',
      );
    }
    if (!disclosures.has(rule.providerDetail)) {
      errors.push(
        `${TAXONOMY_JSON}: class "${errorClass}" does not say how much of an upstream's own words reach the reader.`,
      );
    }
    if (remedies !== null && !remedies.includes(rule.suggestedAction)) {
      errors.push(
        `${TAXONOMY_JSON}: class "${errorClass}" suggests "${rule.suggestedAction}", which is not one of ` +
          `the remedies ${REMEDY_MODULE} offers.`,
      );
    }
    if (!Array.isArray(rule.codes) || rule.codes.length === 0) {
      errors.push(
        `${TAXONOMY_JSON}: class "${errorClass}" names no code. A class no code reaches cannot be told to a caller.`,
      );
    }
  }
}

function checkPartition({ taxonomy, codes, errors }) {
  const seen = new Map();
  for (const [errorClass, rule] of Object.entries(taxonomy.classes ?? {})) {
    for (const code of rule.codes ?? []) {
      if (!codes.has(code)) {
        errors.push(
          `${TAXONOMY_JSON}: class "${errorClass}" names ${code}, which no canonical registry declares. ` +
            'A code may be added; renaming or deleting one breaks every caller that stored it.',
        );
        continue;
      }
      const owner = seen.get(code);
      if (owner !== undefined) {
        errors.push(
          `${TAXONOMY_JSON}: ${code} is classified as both "${owner}" and "${errorClass}". ` +
            'A reader cannot be told two different things about one failure.',
        );
        continue;
      }
      seen.set(code, errorClass);
    }
  }
  for (const [code, registry] of codes) {
    if (!seen.has(code)) {
      errors.push(
        `${TAXONOMY_JSON}: ${registry}.${code} belongs to no class, so a caller meeting it is told ` +
          'nothing about what kind of failure it is or what to do next.',
      );
    }
  }
  return seen;
}

function checkUnraisedCodes({ taxonomy, codes, repoRoot, files, errors }) {
  const entries = taxonomy.unraisedCodes ?? [];
  const recorded = new Map(entries.map((entry) => [entry.code, entry]));
  const raisers = new Map();

  for (const relativePath of files) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (relativePath.startsWith(CONTRACT_ROOT)) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = read(repoRoot, relativePath);
    if (source === null) continue;
    for (const code of recorded.keys()) {
      if (namesCode(source, code)) raisers.set(code, relativePath);
    }
  }

  for (const [code, entry] of recorded) {
    if (!codes.has(code)) {
      errors.push(`${TAXONOMY_JSON}: unraised entry names ${code}, which no registry declares.`);
      continue;
    }
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${TAXONOMY_JSON}: unraised entry ${code} carries no reason.`);
    }
    if (typeof entry.raisedBy !== 'string' || entry.raisedBy.trim().length === 0) {
      errors.push(`${TAXONOMY_JSON}: unraised entry ${code} does not name who has to raise it.`);
    }
    const raiser = raisers.get(code);
    if (raiser !== undefined) {
      errors.push(
        `${TAXONOMY_JSON}: ${code} is now raised by ${raiser}. Delete its unraised entry; this list only shrinks.`,
      );
    }
  }

  return recorded.size;
}

/**
 * Whether a request can be sent again is decided where the failure happened.
 * A client that keeps its own table of which codes are worth retrying will
 * retry a refusal, or give up on an outage, as soon as the two disagree.
 */
export function findClientRetryTables({ repoRoot = REPO_ROOT, files, codes }) {
  const violations = [];
  for (const relativePath of files) {
    if (!CLIENT_ROOTS.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    const source = read(repoRoot, relativePath);
    if (source === null || !RETRY_DECISION.test(source)) continue;
    const named = [...codes.keys()].filter((code) => namesCode(source, code));
    if (named.length < MIN_LOCAL_CODES) continue;
    if (source.includes('error-taxonomy') || source.includes('isRetryableErrorCode')) continue;
    violations.push({ file: relativePath, named: named.slice(0, 6) });
  }
  return violations;
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  const raw = read(repoRoot, BASELINE_PATH);
  return raw === null ? { retryDecidedByClient: [] } : JSON.parse(raw);
}

export function applyRetryBaseline({ violations, baseline }) {
  const recorded = new Map(
    (baseline.retryDecidedByClient ?? []).map((entry) => [entry.file, entry]),
  );
  const seen = new Set();
  const errors = [];
  const fresh = [];

  for (const violation of violations) {
    if (recorded.has(violation.file)) {
      seen.add(violation.file);
      continue;
    }
    fresh.push(violation);
  }

  for (const [file, entry] of recorded) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${file} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${file} does not name the change that removes it.`);
    }
    if (!seen.has(file)) {
      errors.push(
        `${BASELINE_PATH}: ${file} no longer decides retryability. Delete it; this list only shrinks.`,
      );
    }
  }

  return { errors, fresh, recorded: recorded.size };
}

export function checkErrorModel(repoRoot = REPO_ROOT) {
  const errors = [];
  const taxonomy = loadTaxonomy(repoRoot);
  if (taxonomy === null) {
    return { errors: [`${TAXONOMY_JSON} does not exist.`], report: null };
  }
  const { codes, errors: registryErrors } = readCanonicalCodes(repoRoot);
  errors.push(...registryErrors);
  if (codes === null || codes.size === 0) {
    return { errors, report: null };
  }

  const files = repositoryFiles(repoRoot);
  const classes = checkClassVocabulary({ taxonomy, repoRoot, errors });
  checkClassRules({ taxonomy, repoRoot, errors });
  const classified = checkPartition({ taxonomy, codes, errors });
  const unraised = checkUnraisedCodes({ taxonomy, codes, repoRoot, files, errors });

  const retry = applyRetryBaseline({
    violations: findClientRetryTables({ repoRoot, files, codes }),
    baseline: loadBaseline(repoRoot),
  });
  errors.push(...retry.errors);
  for (const violation of retry.fresh) {
    errors.push(
      `${violation.file}: decides retryability for ${violation.named.join(', ')} without reading ` +
        `${TAXONOMY_MODULE}. The server derives that flag and the client renders it.`,
    );
  }

  return {
    errors,
    report: {
      codes: codes.size,
      classes: classes?.length ?? 0,
      classified: classified.size,
      unraised,
      retryRecorded: retry.recorded,
    },
  };
}

function main() {
  const { errors, report } = checkErrorModel(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Error model check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-error-model: OK (${report.codes} codes in ${report.classes} classes, ` +
      `${report.classified} classified, ${report.unraised} not yet raised, ` +
      `${report.retryRecorded} client retry decision(s) recorded and shrinking)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
