#!/usr/bin/env node
// An account that is suspended, scheduled for deletion or erased loses every
// long-lived credential at once, whichever one the caller presents.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { credentialVerifiers, ROUTE_GATE } from './check-membership-revocation.mjs';
import { stripComments } from './lib/module-graph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

export const STATUS_VOCABULARY = 'apps/web/lib/auth/account-status.ts';
export const LIFECYCLE = 'apps/web/lib/auth/account-lifecycle.ts';
export const CONFIG_PATH = 'scripts/config/identity-account-revocation.json';

const ACCOUNT_GATE = 'assertAccountActive';
const DECISION = 'accountAccessDecision';

function read(root, relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** Brace depth at every index, so one branch's guard cannot cover another's. */
function depths(source) {
  const out = new Int32Array(source.length);
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '}') depth -= 1;
    out[index] = depth;
    if (char === '{') depth += 1;
  }
  return out;
}

/**
 * A call dominates a return when it runs first on every path that reaches it:
 * earlier in the text, no deeper, and no block closed between the two.
 */
export function dominates(source, callIndex, returnIndex, depth = depths(source)) {
  if (callIndex >= returnIndex) return false;
  const callDepth = depth[callIndex];
  if (callDepth > depth[returnIndex]) return false;
  for (let index = callIndex; index <= returnIndex; index += 1) {
    if (depth[index] < callDepth) return false;
  }
  return true;
}

/** The body of one top level function, brace matched from its signature. */
export function functionBody(source, name) {
  const signature = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`,
  );
  const start = signature.exec(source);
  if (start === null) return null;
  let parameters = 1;
  let cursor = start.index + start[0].length;
  while (cursor < source.length && parameters > 0) {
    if (source[cursor] === '(') parameters += 1;
    else if (source[cursor] === ')') parameters -= 1;
    cursor += 1;
  }
  const open = source.indexOf('{', cursor);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { body: source.slice(open, index + 1), offset: open };
    }
  }
  return null;
}

/** A gate that delegates to local helpers is still the gate, so follow the whole chain. */
export function withCallees(source, body, seen = new Set()) {
  let reached = body;
  for (const match of body.matchAll(/\b([a-z][\w$]*)\s*\(/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    const callee = functionBody(source, match[1]);
    if (callee !== null) reached += withCallees(source, callee.body, seen);
  }
  return reached;
}

const PRINCIPAL_RETURN =
  /\breturn\s+(?!null\b|undefined\b|await\s+getClerkAuthUser\b)[A-Za-z_$({]/g;
const EXPORTED_FUNCTION = /^export\s+(?:async\s+)?function\s+(\w+)/gm;

/** Every return that hands a caller a principal, and whether the gate ran first. */
export function ungatedReturns(source, name) {
  const found = functionBody(source, name);
  if (found === null) return null;
  const { body } = found;
  const depth = depths(body);
  const gates = [...body.matchAll(new RegExp(`\\b${ACCOUNT_GATE}\\s*\\(`, 'g'))].map(
    (match) => match.index,
  );
  const ungated = [];
  PRINCIPAL_RETURN.lastIndex = 0;
  for (const match of body.matchAll(PRINCIPAL_RETURN)) {
    if (gates.some((gate) => dominates(body, gate, match.index, depth))) continue;
    ungated.push(body.slice(match.index, body.indexOf('\n', match.index)).trim());
  }
  return ungated;
}

export function checkAccountRevocation(root = scanRoot) {
  const failures = [];
  const report = { credentials: 0, funnels: 0, statuses: 0, allowed: 0 };

  const gate = read(root, ROUTE_GATE);
  const vocabulary = read(root, STATUS_VOCABULARY);
  const lifecycle = read(root, LIFECYCLE);
  if (gate === null || vocabulary === null || lifecycle === null) {
    failures.push(
      `${ROUTE_GATE}, ${STATUS_VOCABULARY} and ${LIFECYCLE} must all exist; one of them is gone, ` +
        'so this sweep proves nothing.',
    );
    return { failures, report };
  }

  const gateSource = stripComments(gate);
  const verifiers = credentialVerifiers(gateSource);
  report.credentials = verifiers.length;
  if (verifiers.length === 0) {
    failures.push(`${ROUTE_GATE}: no credential verifier found, so this sweep proves nothing.`);
  }

  EXPORTED_FUNCTION.lastIndex = 0;
  const exported = [...gateSource.matchAll(EXPORTED_FUNCTION)].map((match) => match[1]);
  for (const name of exported) {
    const found = functionBody(gateSource, name);
    if (found === null) continue;
    const reachesCredential = verifiers.some((verifier) =>
      new RegExp(`\\b${verifier}\\b`).test(found.body),
    );
    const callsHelper = /\bverifyBearerToken\s*\(|\bverifyApiKey\s*\(/.test(found.body);
    if (!reachesCredential && !callsHelper) continue;
    report.funnels += 1;
    const ungated = ungatedReturns(gateSource, name);
    for (const statement of ungated ?? []) {
      failures.push(
        `${ROUTE_GATE}: ${name} hands back a principal at "${statement}" without ${ACCOUNT_GATE} ` +
          'having run first, so a suspended or erased account keeps this way in.',
      );
    }
  }
  if (report.funnels === 0) {
    failures.push(
      `${ROUTE_GATE}: no exported entry point reaches a credential verifier, which cannot be right.`,
    );
  }

  if (!new RegExp(`function\\s+${ACCOUNT_GATE}\\b`).test(gateSource)) {
    failures.push(`${ROUTE_GATE}: ${ACCOUNT_GATE} is gone, so nothing consults the account state.`);
  } else {
    const found = functionBody(gateSource, ACCOUNT_GATE);
    const reached = found === null ? '' : withCallees(gateSource, found.body);
    if (!new RegExp(`\\b${DECISION}\\b`).test(reached)) {
      failures.push(
        `${ROUTE_GATE}: ${ACCOUNT_GATE} no longer decides through ${DECISION}, so the gate and ` +
          'the sign-in path can disagree about what a status means.',
      );
    }
  }

  const statuses = /ACCOUNT_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(vocabulary);
  if (statuses === null) {
    failures.push(`${STATUS_VOCABULARY}: ACCOUNT_STATUSES is not readable, so nothing enumerates.`);
    return { failures, report };
  }
  const names = [...statuses[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  report.statuses = names.length;

  const config = read(root, CONFIG_PATH);
  const allowed = new Map();
  if (config !== null) {
    for (const entry of JSON.parse(config).statusesDeliberatelyAllowed ?? []) {
      if (!entry.reason) {
        failures.push(`${CONFIG_PATH}: ${entry.status} is allowed here with no reason given.`);
        continue;
      }
      allowed.set(entry.status, entry.reason);
    }
  }
  report.allowed = allowed.size;

  const decision = functionBody(vocabulary, DECISION);
  if (decision === null) {
    failures.push(`${STATUS_VOCABULARY}: ${DECISION} is gone, so no status is answered.`);
    return { failures, report };
  }
  for (const status of names) {
    if (new RegExp(`case\\s*'${status}'`).test(decision.body)) {
      if (allowed.has(status)) {
        failures.push(
          `${CONFIG_PATH} says ${status} is deliberately allowed and ${DECISION} now answers it ` +
            'explicitly. Remove the entry so the list can only shrink.',
        );
      }
      continue;
    }
    if (allowed.has(status)) continue;
    failures.push(
      `${STATUS_VOCABULARY}: ${DECISION} has no case for "${status}", so it falls through to the ` +
        'default and the account keeps every credential. Answer it, or record why it is allowed ' +
        `in ${CONFIG_PATH}.`,
    );
  }
  for (const status of allowed.keys()) {
    if (names.includes(status)) continue;
    failures.push(`${CONFIG_PATH}: ${status} is no longer an account status. Drop the entry.`);
  }

  return { failures, report };
}

function main() {
  const { failures, report } = checkAccountRevocation();
  if (failures.length > 0) {
    console.error('check:identity-account-revocation failed.\n');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `check:identity-account-revocation: OK (${report.credentials} credential class(es) through ` +
      `${report.funnels} gate entry point(s), ${report.statuses} account statuses, ` +
      `${report.allowed} deliberately allowed)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main();
