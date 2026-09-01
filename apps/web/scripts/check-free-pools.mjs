#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';

const CHECK_LABEL = '[FREE-POOLS]';
const ROUTE_ID_SEPARATOR = '/';
const EXIT_OK = 0;
const EXIT_FAILED = 1;

const MATCH_ROUTE = 'route';
const MATCH_PROVIDER = 'provider';
const MATCH_NONE = 'none';

const FREE_ROUTE_ID_PATTERN = /free/i;

const args = process.argv.slice(2);

function flagValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const WEB_ROOT = resolve(flagValue('--root') ?? new URL('..', import.meta.url).pathname);
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const POOLS_PATH = resolve(flagValue('--pools') ?? join(WEB_ROOT, 'config', 'free-pools.json'));
const REGISTRY_PATH = resolve(
  flagValue('--registry') ??
    join(REPO_ROOT, 'packages', 'ai', 'model-registry', 'generated', 'registry.json'),
);

function fail(message) {
  console.error(`${CHECK_LABEL} ${message}`);
  process.exit(EXIT_FAILED);
}

function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} not found at ${relative(REPO_ROOT, path)}.`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} at ${relative(REPO_ROOT, path)} is not valid JSON: ${error.message}`);
  }
}

function providerOf(routeId) {
  const separatorIndex = routeId.indexOf(ROUTE_ID_SEPARATOR);
  return separatorIndex === -1 ? routeId : routeId.slice(0, separatorIndex);
}

function classify(routeId, routeIds, providerIds) {
  if (routeIds.has(routeId)) return MATCH_ROUTE;
  if (providerIds.has(providerOf(routeId))) return MATCH_PROVIDER;
  return MATCH_NONE;
}

function isVerified(entry) {
  return (
    entry.verifiedAtMs !== null &&
    entry.verifiedAtMs !== undefined &&
    entry.reviewedBy !== null &&
    entry.reviewedBy !== undefined
  );
}

const pools = readJson(POOLS_PATH, 'Free pools config');
const registry = readJson(REGISTRY_PATH, 'Model registry');

const entries = Array.isArray(pools.entries) ? pools.entries : undefined;
if (!entries) fail(`${relative(REPO_ROOT, POOLS_PATH)} has no "entries" array.`);

const routes = registry.routes ?? {};
const routeIds = new Set(Object.keys(routes));
const providerIds = new Set(Object.values(routes).map((route) => route.provider));

if (routeIds.size === 0) fail(`${relative(REPO_ROOT, REGISTRY_PATH)} declares no routes.`);

const failures = [];
const pending = [];
const degraded = [];
const seen = new Set();

for (const entry of entries) {
  const { routeId } = entry;
  if (typeof routeId !== 'string' || routeId.length === 0) {
    failures.push('An entry is missing a routeId.');
    continue;
  }
  if (seen.has(routeId)) failures.push(`Duplicate routeId \`${routeId}\`.`);
  seen.add(routeId);

  const match = classify(routeId, routeIds, providerIds);
  if (match === MATCH_ROUTE) continue;

  if (!isVerified(entry)) {
    pending.push({ routeId, match });
    continue;
  }
  if (match === MATCH_PROVIDER) {
    degraded.push(routeId);
    continue;
  }
  failures.push(
    `Verified entry \`${routeId}\` matches no route and no provider in the registry. ` +
      'A verified pool must name a route the resolver can actually return.',
  );
}

for (const { routeId, match } of pending) {
  const detail =
    match === MATCH_PROVIDER
      ? `provider \`${providerOf(routeId)}\` exists but the route does not`
      : `neither route nor provider \`${providerOf(routeId)}\` exists`;
  console.warn(
    `${CHECK_LABEL} pending: \`${routeId}\` — ${detail}. ` +
      'The entry is unverified, so it cannot route traffic and this is not fatal. ' +
      'Adding the registry slot is a prerequisite for setting verifiedAtMs.',
  );
}

for (const routeId of degraded) {
  console.warn(
    `${CHECK_LABEL} provider-only match: \`${routeId}\` resolves at provider granularity. ` +
      'Tighten to an exact route id once the registry slot exists.',
  );
}

const unpooledFreeRoutes = [...routeIds].filter(
  (routeId) => FREE_ROUTE_ID_PATTERN.test(routeId) && !seen.has(routeId),
);

for (const routeId of unpooledFreeRoutes) {
  console.warn(
    `${CHECK_LABEL} terms trap: \`${routeId}\` is a selectable registry route that reads as free ` +
      'but is absent from the free pool. A $0 price is not eligibility — the provider terms decide, ' +
      'and these exclude it from the company free lane. Absence is the deliberate state: ' +
      'add an entry only if a terms review says the lane may carry it.',
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`${CHECK_LABEL} ${failure}`);
  console.error(
    `\n${CHECK_LABEL} ${failures.length} problem(s) in ${relative(REPO_ROOT, POOLS_PATH)}.`,
  );
  process.exit(EXIT_FAILED);
}

const verifiedCount = entries.filter(isVerified).length;
console.log(
  `${CHECK_LABEL} ${entries.length} entr(y|ies) checked against ${routeIds.size} registry routes: ` +
    `${verifiedCount} verified, ${pending.length} pending a registry slot.`,
);
process.exit(EXIT_OK);
