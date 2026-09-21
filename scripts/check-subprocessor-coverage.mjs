#!/usr/bin/env node
// A provider that can serve managed traffic is a recipient of customer prompts,
// and /subprocessors is where a customer authorises one. This enumerates the
// routes the registry admits for managed traffic and fails when a provider
// behind one of them is not named on that page.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PAGE = 'apps/web/app/subprocessors/page.tsx';
export const REGISTRY = 'packages/ai/model-registry/generated/registry.json';
export const CATALOG = 'packages/contracts/types/src/model-catalog.ts';

// The page must keep rendering the array the ids are declared on, or the guard
// would pass on a list no reader ever sees.
const RENDER_WIRING = ['SUBS.map(', 'rows={subRows()}'];

function read(root, relative, failures) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative} does not exist`);
    return null;
  }
  return fs.readFileSync(target, 'utf8');
}

function quotedStrings(fragment) {
  return [...fragment.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/**
 * The admission rule, read from the module that enforces it rather than copied,
 * so a change there fails here instead of silently widening what this guard
 * considers a recipient.
 */
export function managedTrafficRule(source) {
  const statuses =
    /MANAGED_TRAFFIC_COMMERCIAL_STATUSES[\s\S]{0,240}?new Set<string>\(\[([^\]]*)\]/.exec(
      source,
    )?.[1];
  const trustMode = /const MANAGED_CLOUD_TRUST_MODE\s*=\s*'([^']+)'/.exec(source)?.[1];
  if (statuses === undefined || trustMode === undefined) return null;
  const parsed = quotedStrings(statuses);
  if (parsed.length === 0) return null;
  return { statuses: new Set(parsed), trustMode };
}

export function admissibleProviders(registry, rule) {
  const byProvider = new Map();
  for (const [routeId, route] of Object.entries(registry.routes ?? {})) {
    if (route.selectable !== true) continue;
    if (!(route.trustModes ?? []).includes(rule.trustMode)) continue;
    if (!rule.statuses.has(route.commercialStatus)) continue;
    const seen = byProvider.get(route.provider) ?? { count: 0, example: routeId };
    seen.count += 1;
    byProvider.set(route.provider, seen);
  }
  return byProvider;
}

export function registryProviders(registry) {
  return new Set(Object.values(registry.routes ?? {}).map((route) => route.provider));
}

/** Every provider id the page claims to name, across all of its recipients. */
export function declaredProviderIds(source) {
  const declared = new Set();
  let blocks = 0;
  for (const match of source.matchAll(/registryProviderIds:\s*\[([^\]]*)\]/g)) {
    blocks += 1;
    for (const id of quotedStrings(match[1])) declared.add(id);
  }
  return { declared, blocks };
}

export function recipientNames(source) {
  return [...source.matchAll(/\n\s*name:\s*'([^']+)'/g)].map((match) => match[1]);
}

export function runSubprocessorCoverageCheck(root) {
  const failures = [];

  const page = read(root, PAGE, failures);
  const catalog = read(root, CATALOG, failures);
  const registrySource = read(root, REGISTRY, failures);
  if (page === null || catalog === null || registrySource === null) return failures;

  let registry;
  try {
    registry = JSON.parse(registrySource);
  } catch (error) {
    failures.push(`${REGISTRY} is not valid JSON: ${error.message}`);
    return failures;
  }

  const rule = managedTrafficRule(catalog);
  if (rule === null) {
    failures.push(
      `${CATALOG} no longer declares MANAGED_TRAFFIC_COMMERCIAL_STATUSES and MANAGED_CLOUD_TRUST_MODE in a shape this guard can read, so the admission rule cannot be checked against the page`,
    );
    return failures;
  }

  const { declared, blocks } = declaredProviderIds(page);
  if (blocks === 0) {
    failures.push(
      `${PAGE} declares no registryProviderIds, so nothing ties a published recipient to the routes it serves`,
    );
    return failures;
  }
  for (const wiring of RENDER_WIRING) {
    if (!page.includes(wiring)) {
      failures.push(
        `${PAGE} no longer renders its recipients through "${wiring}", so the declared list and the published list can differ`,
      );
    }
  }

  const known = registryProviders(registry);
  for (const id of [...declared].sort()) {
    if (!known.has(id)) {
      failures.push(
        `${PAGE} claims registry provider "${id}", which no route in ${REGISTRY} names; a misspelled id covers nothing`,
      );
    }
  }

  const admissible = admissibleProviders(registry, rule);
  for (const [provider, { count, example }] of [...admissible].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (declared.has(provider)) continue;
    failures.push(
      `${provider} has ${count} route(s) admissible for managed traffic (for example "${example}") and is named by no recipient on ${PAGE}; publish it before it can serve a customer prompt`,
    );
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runSubprocessorCoverageCheck(root);
  if (failures.length > 0) {
    console.error('The published subprocessor list does not cover what the registry admits:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  const page = fs.readFileSync(path.join(root, PAGE), 'utf8');
  console.log(
    `check-subprocessor-coverage: ${recipientNames(page).length} published recipients cover every provider the registry admits for managed traffic.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
