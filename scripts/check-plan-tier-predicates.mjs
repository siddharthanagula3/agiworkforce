#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const BILLING_CATALOG_OWNER_PATH = 'packages/contracts/types/src/billing-catalog.ts';
export const SUBSCRIPTION_ACCESS_TIER_OWNER_PATH = 'packages/contracts/types/src/model-catalog.ts';

// This guard protects one concept: BillingPlanTier, defined and predicated in
// billing-catalog.ts. Every entry here is exempt because it is either that
// file, or reads a sibling tier vocabulary (SubscriptionAccessTier, model
// tierPolicy.minTier) that reuses the same string spellings for a different
// concept. Add a file here only when it is the canonical owner or a direct
// consumer of one of those other vocabularies, never to silence a genuine
// BillingPlanTier bypass.
export const OWNER_PATHS = Object.freeze([
  {
    file: BILLING_CATALOG_OWNER_PATH,
    why: 'the BillingPlanTier catalog itself, where the exported predicates live',
  },
  {
    file: SUBSCRIPTION_ACCESS_TIER_OWNER_PATH,
    why: 'owns the separate SubscriptionAccessTier and model tierPolicy.minTier domains, which reuse the same tier spellings for a different concept',
  },
  {
    file: 'apps/web/lib/model-tiers.ts',
    why: 'reads normalizeSubscriptionAccessTier from the model-catalog domain, not BillingPlanTier',
  },
  {
    file: 'apps/web/shared/config/llm.ts',
    why: 'normalizeSubscriptionTier wraps normalizeSubscriptionAccessTier from the model-catalog domain',
  },
  {
    file: 'apps/web/app/api/llm/v1/models/route.ts',
    why: 'the OpenAI-compatible model list is filtered by normalizeSubscriptionAccessTier, not BillingPlanTier',
  },
  {
    file: 'apps/web/lib/free-trial-config.ts',
    why: 'reads a model tierPolicy.minTier, the model-catalog capability gate, not BillingPlanTier',
  },
  {
    file: 'packages/contracts/types/src/design-system/user-identity.ts',
    why: 'owns UIPlanTier, a presentation reshaping of BillingPlanTier that renames local-only to local; not the same value space',
  },
]);

const OWNER_PATH_SET = new Set(OWNER_PATHS.map((entry) => entry.file));

export const SCAN_ROOTS = Object.freeze(['apps/web', 'packages/contracts/types']);

export const BILLING_PLAN_TIERS = Object.freeze([
  'local-only',
  'byok',
  'free',
  'basic',
  'pro',
  'max',
  'max_15x',
  'team',
  'enterprise',
]);

const TIER_LITERAL_GROUP = BILLING_PLAN_TIERS.join('|');
const IDENTIFIER = '[A-Za-z0-9_$.?!()\\[\\]]+';
const TIER_NAME_HINT = /(tier|Tier|plan|Plan)/;

const COMPARISON_PATTERN = new RegExp(
  `(?:(${IDENTIFIER})\\s*(===|!==)\\s*'(${TIER_LITERAL_GROUP})'` +
    `|'(${TIER_LITERAL_GROUP})'\\s*(===|!==)\\s*(${IDENTIFIER}))`,
  'g',
);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'generated',
]);

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|test|fixtures|e2e)\//.test(relativePath)
  );
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function findRawTierComparisons(text) {
  const lines = text.split('\n');
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isCommentLine(line)) continue;
    COMPARISON_PATTERN.lastIndex = 0;
    let match;
    while ((match = COMPARISON_PATTERN.exec(line)) !== null) {
      const identifier = match[1] ?? match[6];
      if (!TIER_NAME_HINT.test(identifier)) continue;
      hits.push({ line: index + 1, text: line.trim() });
    }
  }
  return hits;
}

export function scanTierPredicateFiles({
  repoRoot = REPO_ROOT,
  filePaths,
  scanRoots = SCAN_ROOTS,
}) {
  const violations = [];
  for (const filePath of [...new Set(filePaths)].sort()) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!scanRoots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`)))
      continue;
    if (OWNER_PATH_SET.has(relativePath)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    if (relativePath.split('/').some((segment) => SKIP_PATH_SEGMENTS.has(segment))) continue;

    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const hit of findRawTierComparisons(text)) {
      violations.push({ file: relativePath, ...hit });
    }
  }
  return violations;
}

export function discoverRepositoryFiles(repoRoot = REPO_ROOT) {
  let output;
  try {
    output = execFileSync(
      'git',
      ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(`Cannot enumerate repository files with git ls-files: ${error.message}`);
  }
  return [...new Set(output.split('\0').filter(Boolean))]
    .sort()
    .map((relativePath) => path.join(repoRoot, relativePath));
}

function main() {
  const violations = scanTierPredicateFiles({
    filePaths: discoverRepositoryFiles(REPO_ROOT),
  });

  if (violations.length > 0) {
    console.error('Raw BillingPlanTier string comparisons found outside billing-catalog.ts:\n');
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}  ${violation.text.slice(0, 140)}`);
    }
    console.error(
      '\nReplace the raw comparison with the matching exported predicate from ' +
        `${BILLING_CATALOG_OWNER_PATH} (isFreeBillingPlanTier, isBasicPlanTier, isProPlanTier, ` +
        'isMaxPlanTier, isMax15xPlanTier, isPerSeatBillingPlan, isContractPricedPlan, ' +
        'isLocalOnlyPlanTier, isByokPlanTier, isFreeOfChargePlanTier), adding a new predicate to ' +
        'that file when none of the existing ones fit. If the comparison is against an ' +
        'unrelated tier concept (SubscriptionAccessTier, model tierPolicy.minTier), that concept ' +
        `is owned by ${SUBSCRIPTION_ACCESS_TIER_OWNER_PATH}; add the file to OWNER_PATHS only if ` +
        'it is the canonical owner of that concept, not to silence an unrelated call site.',
    );
    process.exit(1);
  }

  console.log(`check-plan-tier-predicates: OK (${OWNER_PATHS.length} owner file(s) exempted)`);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
