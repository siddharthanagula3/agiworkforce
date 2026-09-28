#!/usr/bin/env node

// What an account is entitled to is answered in one place,
// apps/web/lib/services/entitlement-resolution.ts, because only it knows that a
// team member's plan comes from a seat and not from a subscriptions row of
// their own. A module that reads plan_tier straight from subscriptions and
// then asks what that plan allows has resolved an entitlement privately, and
// it tells every seat holder they are on Free. Billing operations on the row
// the user personally owns (a top-up charge, a webhook write) are recorded
// below with their reason; everything else resolves through the entry point.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const ENTRY_POINT = 'apps/web/lib/services/entitlement-resolution.ts';
export const ENTRY_POINT_SYMBOLS = Object.freeze([
  'resolveEntitlementBundle',
  'resolveEntitledPlanTier',
  'resolveEffectiveSubscription',
]);

export const SCANNED_ROOTS = Object.freeze(['apps/web/lib', 'apps/web/app']);

export const ENTITLEMENT_PREDICATES = Object.freeze([
  'canUseBillingPlanCapability',
  'getTierPolicy',
  'getBillingPlanProductLimits',
  'isPlanUsageUncapped',
  'getPlanUsageBudgetCents',
  'getPlanSessionUsageBudgetCents',
  'getPlanWeeklyUsageBudgetCents',
  'toEnforceableBillingPlanLimit',
  'isFreeBillingPlanTier',
]);

export const OWN_ROW_OPERATIONS = Object.freeze({
  'apps/web/lib/services/subscription-service.ts':
    'The own-row reader the entry point itself calls; it reports the row, it does not decide what a seat holder may do.',
  'apps/web/app/api/stripe-webhook/lib/db.ts':
    'Writes the subscription row a Stripe event describes, and sizes that row from the plan the event names.',
  'apps/web/app/api/billing/top-up/route.ts':
    'A top-up is charged to the Stripe or store customer on the row the user personally owns, which a seat is not.',
  'apps/web/lib/services/auto-reload-service.ts':
    'Auto-reload charges the customer on the row the user personally owns, which a seat is not.',
  'apps/web/lib/services/mobile-iap-ledger-service.ts':
    'Records a store purchase against the purchasing account’s own row, which a seat is not.',
});

export const OWN_ROW_READERS = Object.freeze({
  'apps/web/app/api/user/delete-account/route.ts':
    'Deleting an account cancels the subscription the user personally pays for; a seat is not theirs to cancel.',
});

const SKIP_DIRECTORY = /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|__tests__$|__mocks__$)/;
const SOURCE_FILE = /\.(?:tsx?|mts)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?tsx?$/;
const READS_PLAN_FROM_SUBSCRIPTIONS =
  /\bplan_tier\b[\s\S]{0,400}?\bfrom\s+(?:public\.)?subscriptions\b/i;
const OWN_ROW_CALL = /\bSubscriptionService\.getSubscription\s*\(/;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sourceFiles(repoRoot, relativeRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(relativeRoot);
  return files;
}

export function decidesFromRawPlan(source) {
  if (!READS_PLAN_FROM_SUBSCRIPTIONS.test(source)) return false;
  return ENTITLEMENT_PREDICATES.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(source));
}

export function checkEntitlementEntryPoint(
  repoRoot = REPO_ROOT,
  { operations = OWN_ROW_OPERATIONS, readers = OWN_ROW_READERS } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const entry = read(repoRoot, ENTRY_POINT);
  if (entry === null) {
    fail(`${ENTRY_POINT} is missing, so there is no entitlement entry point to route through`);
    return failures;
  }
  for (const symbol of ENTRY_POINT_SYMBOLS) {
    if (!new RegExp(`export async function ${symbol}\\b`).test(entry)) {
      fail(`${ENTRY_POINT} no longer exports ${symbol}`);
    }
  }

  const decidingSeen = new Set();
  const readingSeen = new Set();
  for (const root of SCANNED_ROOTS) {
    for (const file of sourceFiles(repoRoot, root)) {
      if (file === ENTRY_POINT) continue;
      const source = read(repoRoot, file);
      if (source === null) continue;
      if (decidesFromRawPlan(source)) {
        if (operations[file] !== undefined) decidingSeen.add(file);
        else {
          fail(
            `${file} reads plan_tier from subscriptions and decides what that plan allows. Resolve the plan through ${ENTRY_POINT} (resolveEntitledPlanTier) so a seat counts.`,
          );
        }
      }
      if (OWN_ROW_CALL.test(source)) {
        if (readers[file] !== undefined) readingSeen.add(file);
        else {
          fail(
            `${file} calls SubscriptionService.getSubscription, which returns only the row the user pays for. Use resolveEffectiveSubscription unless this acts on that row itself, and record why.`,
          );
        }
      }
    }
  }

  for (const [file, why] of Object.entries(operations)) {
    if (typeof why !== 'string' || why.trim().length < 20)
      fail(`${file} is recorded without a reason`);
    if (!decidingSeen.has(file)) {
      fail(`${file} no longer decides from a raw plan. Delete its record; the list only shrinks.`);
    }
  }
  for (const [file, why] of Object.entries(readers)) {
    if (typeof why !== 'string' || why.trim().length < 20)
      fail(`${file} is recorded without a reason`);
    if (!readingSeen.has(file)) {
      fail(`${file} no longer reads the own row. Delete its record; the list only shrinks.`);
    }
  }

  return failures;
}

function main() {
  const failures = checkEntitlementEntryPoint();
  if (failures.length > 0) {
    console.error('Entitlement entry point check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-entitlement-entry-point: entitlement resolves through ${ENTRY_POINT}; ${Object.keys(OWN_ROW_OPERATIONS).length + Object.keys(OWN_ROW_READERS).length} own-row operation(s) recorded.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
