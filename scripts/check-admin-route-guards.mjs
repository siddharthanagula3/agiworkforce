#!/usr/bin/env node
/**
 * Every handler under /api/admin decides who may call it, limits how often, and
 * writes down what it changed.
 *
 * The routes are enumerated from the tree, and each exported method is resolved
 * to the body a request actually runs, with its local helpers folded in, so a
 * guard one call deep still counts and a route added tomorrow is checked
 * tomorrow. A read needs an authorization call and a rate limit; a write needs
 * a CSRF token and an audit entry as well. Exceptions are declared one per
 * handler and rule with the reason, and a declared exception that no longer
 * applies fails too, so the list cannot outlive what it excused.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { adminRoutes, auditRouteGuards, compareFindings } from './lib/admin-route-guards.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const BASELINE_FILE = 'scripts/config/admin-route-guards-baseline.json';

const routes = adminRoutes(scanRoot);
if (routes.length === 0) {
  console.error('check-admin-route-guards: no admin routes were found, which cannot be right.');
  process.exit(1);
}

const baselinePath = path.join(scanRoot, BASELINE_FILE);
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : { accepted: {} };

const findings = auditRouteGuards(scanRoot, routes);
const { missingReason, unexpected, stale } = compareFindings(findings, baseline);

if (missingReason.length > 0) {
  console.error('Every accepted exception needs a reason:');
  for (const key of missingReason) console.error(`  ${key}`);
  process.exit(1);
}

if (unexpected.length > 0) {
  console.error(`${unexpected.length} admin handler(s) are missing a control:`);
  for (const key of unexpected) console.error(`  ${key}`);
  process.exit(1);
}

if (stale.length > 0) {
  console.error(`${stale.length} accepted exception(s) no longer apply. Remove them:`);
  for (const key of stale) console.error(`  ${key}`);
  process.exit(1);
}

console.log(
  `check-admin-route-guards: ${routes.length} admin routes checked, ` +
    `${Object.keys(baseline.accepted ?? {}).length} declared exception(s).`,
);
