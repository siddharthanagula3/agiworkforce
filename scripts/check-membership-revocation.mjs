#!/usr/bin/env node
/**
 * A membership that ends takes every credential it authorized with it.
 *
 * The classes are enumerated from the route gate, not from a list: every call in
 * apps/web/lib/api-auth.ts that turns a presented credential into a principal,
 * which is how check-session-lifetime-enforcement reads them too. Each one has
 * to be revoked by the offboarding path for the (member, workspace) pair, so a
 * fifth way in cannot land without an answer, and a revocation that forgets to
 * name the workspace would reach credentials another tenant issued.
 *
 * The other half of offboarding, work that keeps running with nobody present,
 * is check-membership-unattended-work.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './lib/module-graph.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ROUTE_GATE = 'apps/web/lib/api-auth.ts';
export const DEPROVISION = 'apps/web/lib/services/deprovision-service.ts';

const VERIFIER_CALL = /\b(?:[A-Za-z_$][\w$]*\.)?(verify[A-Z]\w*|getRequestIdentity)\s*\(/g;
const LOCAL_DECLARATION = /\b(?:async\s+)?function\s+(\w+)|\bconst\s+(\w+)\s*=/g;

/**
 * What each credential class the gate authenticates is stored as, and the
 * revocation the workspace owes it. `table` null means the credential lives at
 * the identity provider and is ended through its API instead.
 */
export const CREDENTIAL_CLASSES = [
  { verifier: 'verifyKey', credential: 'an API key', table: 'api_keys' },
  {
    verifier: 'verifyDeveloperTokenSignature',
    credential: 'a device access token',
    table: 'device_refresh_tokens',
  },
  {
    verifier: 'verifySessionToken',
    credential: 'a provider session token presented as a bearer',
    table: null,
    endedBy: /revokeSession\(/,
  },
  {
    verifier: 'getRequestIdentity',
    credential: 'the browser session cookie',
    table: null,
    endedBy: /revokeSession\(/,
  },
];

/** Names the gate calls that never take a credential from the caller. */
const NOT_A_CREDENTIAL = new Set(['verifyIdentitySessionToken']);

function read(repoRoot, relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function statementsIn(source) {
  const statements = [];
  const template = /`([^`]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[\s\S]*?)`/gi;
  let match;
  while ((match = template.exec(source))) {
    if (/^\s*(?:with|select|insert|update|delete)\b/i.test(match[1])) statements.push(match[1]);
  }
  return statements;
}

export function credentialVerifiers(gateSource) {
  const declaredHere = new Set();
  for (const match of gateSource.matchAll(LOCAL_DECLARATION)) {
    declaredHere.add(match[1] ?? match[2]);
  }
  const verifiers = new Set();
  for (const match of gateSource.matchAll(VERIFIER_CALL)) {
    const name = match[1];
    if (declaredHere.has(name) || NOT_A_CREDENTIAL.has(name)) continue;
    verifiers.add(name);
  }
  return [...verifiers].sort();
}

export function checkMembershipRevocation(repoRoot = REPO_ROOT) {
  const failures = [];
  const report = { credentials: 0, revoked: 0 };

  const gate = read(repoRoot, ROUTE_GATE);
  const deprovision = read(repoRoot, DEPROVISION);
  if (gate === null) {
    failures.push(`${ROUTE_GATE}: the route gate is gone, so no credential class can be read.`);
    return { failures, report };
  }
  if (deprovision === null) {
    failures.push(`${DEPROVISION}: the offboarding path is gone, so nothing revokes anything.`);
    return { failures, report };
  }

  const verifiers = credentialVerifiers(gate);
  report.credentials = verifiers.length;
  if (verifiers.length === 0) {
    failures.push(`${ROUTE_GATE}: no credential verifier found, so this sweep proves nothing.`);
  }
  const classified = new Map(CREDENTIAL_CLASSES.map((entry) => [entry.verifier, entry]));
  const statements = statementsIn(stripComments(deprovision));

  for (const verifier of verifiers) {
    const entry = classified.get(verifier);
    if (!entry) {
      failures.push(
        `${ROUTE_GATE}: authenticates through ${verifier} and nothing says what a workspace ` +
          'revokes when a member of it leaves. Classify it, or revoke it.',
      );
      continue;
    }
    if (entry.table === null) {
      if (!entry.endedBy.test(deprovision)) {
        failures.push(
          `${DEPROVISION}: no longer ends ${entry.credential}, which lives at the identity ` +
            'provider and cannot be reached by a statement.',
        );
        continue;
      }
      report.revoked += 1;
      continue;
    }
    const revocation = statements.find(
      (statement) =>
        new RegExp(`\\b(?:public\\.)?${entry.table}\\b`).test(statement) &&
        /revoked_at\s*=\s*now\(\)/i.test(statement),
    );
    if (!revocation) {
      failures.push(
        `${DEPROVISION}: ${entry.credential} is stored in public.${entry.table} and offboarding ` +
          'revokes nothing there, so it keeps working after the membership ends.',
      );
      continue;
    }
    if (!/organization_id\s*=\s*\$\d/i.test(revocation)) {
      failures.push(
        `${DEPROVISION}: the revocation over public.${entry.table} names no workspace, so removing ` +
          'a member from one organization would revoke credentials another one issued.',
      );
      continue;
    }
    report.revoked += 1;
  }

  for (const entry of CREDENTIAL_CLASSES) {
    if (!verifiers.includes(entry.verifier)) {
      failures.push(
        `${entry.verifier} is classified here and ${ROUTE_GATE} no longer calls it; drop the entry.`,
      );
    }
  }

  return { failures, report };
}

function main() {
  const { failures, report } = checkMembershipRevocation();
  if (failures.length > 0) {
    console.error('check:membership-revocation failed.\n');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `check:membership-revocation: OK (${report.credentials} credential class(es) the gate ` +
      `authenticates, ${report.revoked} revoked for the member and workspace pair)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main();
