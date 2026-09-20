#!/usr/bin/env node
/**
 * Holding platform credentials is not access to a customer's workspace.
 *
 * Every route an operator identity can reach is enumerated from the route tree
 * rather than listed here, and each one is classified: a route that serves or
 * writes workspace-scoped customer content has to reach the break-glass gate,
 * and a route that only serves the platform's own books has to say so and why.
 * A new operator route is unclassified and fails, which is the point: the
 * decision about whether it touches a tenant's data is made when it is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { exportedMethods, handlerBody } from './lib/admin-route-guards.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const CLASSIFICATION_FILE = 'scripts/config/support-access-coverage.json';
const API_ROOT = 'apps/web/app/api';
const OPERATOR_GUARD = 'requirePlatformAdmin';

export const SUPPORT_GATE_CALLS = [
  'assertSupportAccess',
  'withSupportAccess',
  'readOperatorContentUnderGrants',
  'recordSupportDataAccess',
  'findLiveSupportAccessGrant',
];

function routeFiles(root) {
  const abs = path.join(scanRoot, root);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        step(full);
      } else if (entry.name === 'route.ts') {
        out.push(path.relative(scanRoot, full));
      }
    }
  };
  step(abs);
  return out;
}

export function operatorReachableRoutes(files, read) {
  return files.filter((rel) => {
    const source = read(rel);
    if (!source.includes(OPERATOR_GUARD)) return false;
    return exportedMethods(source).some((method) => {
      const body = handlerBody(source, method);
      return body !== null && body.includes(OPERATOR_GUARD);
    });
  });
}

export function reachesSupportGate(source) {
  return SUPPORT_GATE_CALLS.some((call) => source.includes(call));
}

// customer_content: workspace data a break-glass grant can cover, so the gate
// is required. submitted_to_platform: the subject sent it to us for this very
// purpose, and the reason has to name the action that did.
export const SERVES = ['customer_content', 'submitted_to_platform', 'platform_only'];

export function classifyRoutes(routes, classification, read) {
  const declared = classification.routes ?? {};
  const unclassified = routes.filter((rel) => !declared[rel]);
  const stale = Object.keys(declared).filter((rel) => !routes.includes(rel));

  const malformed = Object.entries(declared)
    .filter(([, entry]) => {
      const serves = entry?.serves;
      const reason = entry?.reason;
      const known = SERVES.includes(serves);
      return !known || typeof reason !== 'string' || reason.trim().length === 0;
    })
    .map(([rel]) => rel);

  const ungated = Object.entries(declared)
    .filter(([rel, entry]) => entry?.serves === 'customer_content' && routes.includes(rel))
    .filter(([rel]) => !reachesSupportGate(read(rel)))
    .map(([rel]) => rel);

  return { unclassified, stale, malformed, ungated };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (rel) => fs.readFileSync(path.join(scanRoot, rel), 'utf8');
  const routes = operatorReachableRoutes(routeFiles(API_ROOT), read);
  if (routes.length === 0) {
    console.error(
      'check-support-access-coverage: no operator route was found, which cannot be right.',
    );
    process.exit(1);
  }

  const classificationPath = path.join(scanRoot, CLASSIFICATION_FILE);
  const classification = fs.existsSync(classificationPath)
    ? JSON.parse(fs.readFileSync(classificationPath, 'utf8'))
    : { routes: {} };

  const { unclassified, stale, malformed, ungated } = classifyRoutes(routes, classification, read);
  let failed = false;

  const report = (list, message) => {
    if (list.length === 0) return;
    failed = true;
    console.error(`${list.length} ${message}`);
    for (const rel of list) console.error(`  ${rel}`);
  };

  report(unclassified, `operator route(s) are not classified in ${CLASSIFICATION_FILE}:`);
  report(
    malformed,
    'classified route(s) need serves (customer_content|platform_only) and a reason:',
  );
  report(ungated, 'operator route(s) serve customer content and reach no break-glass gate:');
  report(stale, 'classified route(s) no longer exist or no longer reach an operator guard:');

  if (failed) process.exit(1);

  const content = Object.values(classification.routes).filter(
    (entry) => entry.serves === 'customer_content',
  ).length;
  console.log(
    `check-support-access-coverage: ${routes.length} operator routes, ` +
      `${content} serve customer content and all of them reach the gate.`,
  );
}
