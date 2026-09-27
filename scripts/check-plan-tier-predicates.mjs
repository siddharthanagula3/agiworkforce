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

export const ENTITLEMENT_RESOLVER_PATH = 'apps/web/lib/services/entitlement-resolution.ts';

export const RAW_SUBSCRIPTION_READ_ROOTS = Object.freeze(['apps/web']);

export const RAW_SUBSCRIPTION_READERS = Object.freeze([
  {
    path: 'apps/web/lib/services/subscription-service.ts',
    why: 'reads and repairs the subscriptions row itself',
  },
  {
    path: ENTITLEMENT_RESOLVER_PATH,
    why: 'the resolver: the caller’s own row, then the seat an organization owner’s row grants',
  },
  {
    path: 'apps/web/lib/services/effective-subscription-service.ts',
    why: 'the seat ledger sweep skips members who hold a row of their own',
  },
  {
    path: 'apps/web/lib/services/org-entitlements.ts',
    why: 'an organization is entitled by its owner’s row, read on the privileged connection',
  },
  {
    path: 'apps/web/app/api/billing/',
    why: 'top-up, payment methods and overage act on the subscription the payer owns',
  },
  { path: 'apps/web/app/api/checkout/', why: 'checkout starts the subscription the payer owns' },
  {
    path: 'apps/web/features/billing/server/billing-account.ts',
    why: 'billing management reads the Stripe and store ids on the subscription the payer owns',
  },
  {
    path: 'apps/web/lib/services/auto-reload-service.ts',
    why: 'auto-reload charges the Stripe customer on the subscription the payer owns',
  },
  {
    path: 'apps/web/app/api/portal/',
    why: 'the Stripe portal manages the subscription the payer owns',
  },
  { path: 'apps/web/app/api/upgrade/', why: 'upgrade changes the subscription the payer owns' },
  {
    path: 'apps/web/app/api/stripe-webhook/',
    why: 'the webhook writes the rows Stripe reports on',
  },
  {
    path: 'apps/web/app/api/claim-offer/route.ts',
    why: 'an offer is claimed against the subscription the payer owns',
  },
  {
    path: 'apps/web/app/api/mobile/iap/catalog/route.ts',
    why: 'the store catalog is priced against the store subscription the user owns',
  },
  {
    path: 'apps/web/app/api/cron/reset-credits/route.ts',
    why: 'the period reset sweeps every row, not one caller’s entitlement',
  },
  {
    path: 'apps/web/app/api/user/export/route.ts',
    why: 'the data export returns the rows the user owns',
  },
  {
    path: 'apps/web/app/api/user/delete-account/route.ts',
    why: 'account deletion cancels the subscription the user owns',
  },
  {
    path: 'apps/web/lib/server/spendable-credits.ts',
    why: 'purchased credits and the overage opt-in live on the payer’s own row',
  },
  {
    path: 'apps/web/lib/services/managed-usage-request-service.ts',
    why: 'overage headroom reads the payer’s own overage opt-in',
  },
  {
    path: 'apps/web/lib/server/subscription-owner-handoff.ts',
    why: 'an ownership handoff moves the row itself',
  },
  {
    path: 'apps/web/lib/services/billing-invoice-service.ts',
    why: 'invoices belong to the subscription the payer owns',
  },
  {
    path: 'apps/web/lib/services/billing-reconciliation.ts',
    why: 'reconciliation compares rows with Stripe',
  },
  {
    path: 'apps/web/lib/services/stripe-settlement-reconciliation-service.ts',
    why: 'settlement reconciliation compares rows with Stripe',
  },
  {
    path: 'apps/web/lib/services/enterprise-billing-service.ts',
    why: 'enterprise billing maps a Stripe subscription to the user who owns it',
  },
  {
    path: 'apps/web/lib/services/mobile-iap-ledger-service.ts',
    why: 'the store ledger writes the row a purchase creates',
  },
  {
    path: 'apps/web/features/admin/services/',
    why: 'operator analytics aggregate every row',
  },
]);

const RAW_SUBSCRIPTION_READ_PATTERNS = Object.freeze([
  /\bSubscriptionService\.getSubscription\s*\(/g,
  /\b(?:from|join)\s+(?:public\.)?subscriptions\b/gi,
]);

export const UNCONVERTED_ENTITLEMENT_READS = Object.freeze([]);

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

export function findRawSubscriptionReads(text) {
  const lines = text.split('\n');
  const hits = [];
  for (const pattern of RAW_SUBSCRIPTION_READ_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      if (isCommentLine(lines[line - 1])) continue;
      hits.push({ line, text: lines[line - 1].trim() });
    }
  }
  return hits.sort((left, right) => left.line - right.line);
}

function productionSources({ repoRoot, filePaths, scanRoots }) {
  const sources = [];
  for (const filePath of [...new Set(filePaths)].sort()) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
    if (!scanRoots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`)))
      continue;
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
    sources.push({ relativePath, text });
  }
  return sources;
}

export function scanTierPredicateFiles({
  repoRoot = REPO_ROOT,
  filePaths,
  scanRoots = SCAN_ROOTS,
}) {
  return productionSources({ repoRoot, filePaths, scanRoots })
    .filter(({ relativePath }) => !OWNER_PATH_SET.has(relativePath))
    .flatMap(({ relativePath, text }) =>
      findRawTierComparisons(text).map((hit) => ({ file: relativePath, ...hit })),
    );
}

function declaredReaderFor(relativePath, readers) {
  return readers.find((entry) =>
    entry.path.endsWith('/') ? relativePath.startsWith(entry.path) : relativePath === entry.path,
  );
}

export function scanRawSubscriptionReads({
  repoRoot = REPO_ROOT,
  filePaths,
  scanRoots = RAW_SUBSCRIPTION_READ_ROOTS,
  readers = [...RAW_SUBSCRIPTION_READERS, ...UNCONVERTED_ENTITLEMENT_READS],
}) {
  const violations = [];
  const exercised = new Set();
  for (const { relativePath, text } of productionSources({ repoRoot, filePaths, scanRoots })) {
    const hits = findRawSubscriptionReads(text);
    if (hits.length === 0) continue;
    const reader = declaredReaderFor(relativePath, readers);
    if (reader) {
      exercised.add(reader.path);
      continue;
    }
    for (const hit of hits) violations.push({ file: relativePath, ...hit });
  }
  const staleReaders = readers.filter((entry) => !exercised.has(entry.path));
  return { violations, staleReaders };
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
  const filePaths = discoverRepositoryFiles(REPO_ROOT);
  const violations = scanTierPredicateFiles({ filePaths });
  const rawReads = scanRawSubscriptionReads({ filePaths });

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
        'it is the canonical owner of that concept, not to silence an unrelated call site.\n',
    );
  }

  if (rawReads.violations.length > 0) {
    console.error('Entitlement read from the raw subscriptions row:\n');
    for (const violation of rawReads.violations) {
      console.error(`  ${violation.file}:${violation.line}  ${violation.text.slice(0, 140)}`);
    }
    console.error(
      '\nA Team or Enterprise seat member owns no subscriptions row, so reading it directly ' +
        'answers Free for them. Resolve entitlement through ' +
        `${ENTITLEMENT_RESOLVER_PATH} (resolveEntitlementBundle, resolveEffectiveSubscription, ` +
        'resolveEntitledPlanTier), passing { includeSeats: false } only when the question is ' +
        'what the person holds in their own right. Add the file to RAW_SUBSCRIPTION_READERS ' +
        'only when the action is about the row itself, such as checkout, the portal or the ' +
        'webhook, and say why.\n',
    );
  }

  if (rawReads.staleReaders.length > 0) {
    console.error('Declared raw subscriptions readers that no longer read the row:\n');
    for (const reader of rawReads.staleReaders) console.error(`  ${reader.path}`);
    console.error(
      '\nRemove each entry from RAW_SUBSCRIPTION_READERS or UNCONVERTED_ENTITLEMENT_READS.\n',
    );
  }

  if (violations.length > 0 || rawReads.violations.length > 0 || rawReads.staleReaders.length > 0) {
    process.exit(1);
  }

  console.log(
    `check-plan-tier-predicates: OK (${OWNER_PATHS.length} owner file(s) exempted, ` +
      `${RAW_SUBSCRIPTION_READERS.length} raw subscriptions reader(s) declared, ` +
      `${UNCONVERTED_ENTITLEMENT_READS.length} entitlement read(s) still to move to the resolver)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
