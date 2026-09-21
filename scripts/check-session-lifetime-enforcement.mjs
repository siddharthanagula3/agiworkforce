#!/usr/bin/env node

// How long a credential may keep working, asked of every credential class the
// product authenticates. The classes are enumerated from the route gate itself,
// so a fifth way in cannot land without an answer, and the answer has to be
// visible in the module that is supposed to give it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const ROUTE_GATE = 'apps/web/lib/api-auth.ts';
export const POLICY_MODULE = 'apps/web/lib/auth/session-policy.ts';

export const POLICY_ENV = 'SESSION_ABSOLUTE_LIFETIME_HOURS';

const SEARCH_ROOTS = ['apps/web/app', 'apps/web/lib', 'packages/platform/identity/src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist']);

/** A call that turns a presented credential into a principal. */
const VERIFIER_CALL = /\b(?:[A-Za-z_$][\w$]*\.)?(verify[A-Z]\w*|getRequestIdentity)\s*\(/g;
const LOCAL_DECLARATION = /\b(?:async\s+)?function\s+(\w+)|\bconst\s+(\w+)\s*=/g;

/** Names the gate calls that never take a credential from the caller. */
const NOT_A_CREDENTIAL = new Set(['verifyIdentitySessionToken']);

/**
 * A credential class whose age the product really does bound, with the module
 * that bounds it and the statement that does. The statement is checked, so a
 * bound removed from that module fails here rather than going quiet.
 */
export const CREDENTIAL_AGE_BOUNDS = [
  {
    verifier: 'verifyKey',
    credential: 'an API key',
    boundedIn: 'apps/web/lib/services/api-key-service.ts',
    proves: /expires_at IS NULL OR expires_at > now\(\)/i,
    why: 'the key row is returned only while it is unrevoked and unexpired',
  },
  {
    verifier: 'verifyDeveloperTokenSignature',
    credential: 'a device access token',
    boundedIn: 'apps/web/lib/server/developer-token.ts',
    proves: /expires_at > now\(\)/i,
    why: 'the token is honoured only while its refresh family still holds a live row',
  },
  {
    verifier: 'verifySessionToken',
    credential: 'a provider session token presented as a bearer',
    boundedIn: 'apps/web/lib/auth/session-age.ts',
    proves: /hasOutlivedAbsoluteLifetime\(/,
    why: 'the session start is read once and measured against the absolute lifetime',
    calledFromGate: /assertSessionWithinAbsoluteLifetime\(/,
  },
  {
    verifier: 'getRequestIdentity',
    credential: 'the browser session cookie',
    boundedIn: 'apps/web/lib/auth/session-age.ts',
    proves: /hasOutlivedAbsoluteLifetime\(/,
    why: 'the session start is read once and measured against the absolute lifetime',
    calledFromGate: /assertSessionWithinAbsoluteLifetime\(/,
  },
];

/**
 * Credential classes with no bound on total age, each with what the product
 * relies on instead. A class here keeps working past the absolute lifetime this
 * product publishes, so the list is a defect record, not an exemption: nothing
 * may join it, and it goes stale the moment the gate consults the policy.
 */
export const UNBOUNDED_CREDENTIALS = [];

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isTestPath(relativePath) {
  return (
    /\.(test|spec)\.[cm]?tsx?$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|e2e)\//.test(relativePath)
  );
}

function sourceFiles(repoRoot, roots) {
  const found = [];
  const walk = (relativePath) => {
    const absolute = path.join(repoRoot, relativePath);
    let stats;
    try {
      stats = statSync(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!stats.isDirectory()) {
      if (SOURCE_EXTENSIONS.has(path.extname(relativePath)) && !isTestPath(relativePath)) {
        found.push(relativePath);
      }
      return;
    }
    for (const entry of readdirSync(absolute).sort()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      walk(path.posix.join(relativePath, entry));
    }
  };
  for (const root of roots) walk(root);
  return found;
}

/** The credential classes the gate authenticates, read out of the gate. */
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

export function checkSessionLifetimeEnforcement(repoRoot = REPO_ROOT, options = {}) {
  const gatePath = options.gate ?? ROUTE_GATE;
  const policyPath = options.policy ?? POLICY_MODULE;
  const roots = options.roots ?? SEARCH_ROOTS;
  const bounds = options.bounds ?? CREDENTIAL_AGE_BOUNDS;
  const unbounded = options.unbounded ?? UNBOUNDED_CREDENTIALS;
  const errors = [];
  const report = { verifiers: 0, bounded: 0, unbounded: 0, policyReferences: 0 };

  const gate = read(repoRoot, gatePath);
  if (gate === null) {
    errors.push(`${gatePath}: the route gate is gone, so no credential class can be enumerated.`);
    return { errors, report };
  }

  const verifiers = credentialVerifiers(gate);
  report.verifiers = verifiers.length;
  if (verifiers.length === 0) {
    errors.push(
      `${gatePath}: no credential verifier found, so the sweep no longer matches how the gate authenticates.`,
    );
  }

  const boundBy = new Map(bounds.map((entry) => [entry.verifier, entry]));
  const unboundedBy = new Map(unbounded.map((entry) => [entry.verifier, entry]));

  for (const verifier of verifiers) {
    const bound = boundBy.get(verifier);
    if (bound) {
      report.bounded += 1;
      const source = read(repoRoot, bound.boundedIn);
      if (source === null) {
        errors.push(
          `${bound.boundedIn}: names the bound on ${bound.credential} and does not exist.`,
        );
      } else if (!bound.proves.test(source)) {
        errors.push(
          `${bound.boundedIn}: no longer bounds ${bound.credential}. ${bound.why}, and the statement that did is gone.`,
        );
      }
      if (bound.calledFromGate && !bound.calledFromGate.test(gate)) {
        errors.push(
          `${gatePath}: ${bound.credential} is bounded in ${bound.boundedIn} and the gate no longer asks it, ` +
            'so the bound is code nothing runs.',
        );
      }
      continue;
    }
    if (unboundedBy.has(verifier)) {
      report.unbounded += 1;
      continue;
    }
    errors.push(
      `${gatePath}: authenticates through ${verifier} and nothing says how long that credential may keep working. ` +
        'Bound it, or record what the product relies on instead.',
    );
  }

  for (const entry of [...bounds, ...unbounded]) {
    if (!verifiers.includes(entry.verifier)) {
      errors.push(
        `${entry.verifier} is classified here and ${gatePath} no longer calls it; drop the entry.`,
      );
    }
  }

  for (const entry of unbounded) {
    if (entry.reliesOn.length < 40) {
      errors.push(`${entry.verifier}: an unbounded credential needs the reason stated in full.`);
    }
  }

  // The one way an entry above goes stale: the gate starts asking the policy.
  if (/AbsoluteLifetime|sessionLifetimeExceeded/.test(gate) && unbounded.length > 0) {
    errors.push(
      `${gatePath}: now consults the session lifetime policy, so ` +
        `${unbounded.map((entry) => entry.verifier).join(', ')} is no longer unbounded. Drop the entry.`,
    );
  }

  const policy = read(repoRoot, policyPath);
  if (policy === null) {
    errors.push(`${policyPath}: the session lifetime policy module does not exist.`);
  } else if (!policy.includes(POLICY_ENV)) {
    errors.push(`${policyPath}: no longer declares ${POLICY_ENV}.`);
  }

  const definitions = [];
  for (const relativePath of sourceFiles(repoRoot, roots)) {
    const source = read(repoRoot, relativePath);
    if (source === null || !source.includes(POLICY_ENV)) continue;
    report.policyReferences += 1;
    if (
      new RegExp(`(?:const|let|var|function)\\s+\\w*\\s*=?[^\\n]*['"\`]${POLICY_ENV}['"\`]`).test(
        source,
      )
    ) {
      definitions.push(relativePath);
    }
  }
  const strayDefinitions = definitions.filter((relativePath) => relativePath !== policyPath);
  if (strayDefinitions.length > 0) {
    errors.push(
      `${strayDefinitions.join(', ')}: reads ${POLICY_ENV} directly. One module answers how long a session may ` +
        `last, and it is ${policyPath}.`,
    );
  }

  return { errors, report };
}

function main() {
  const { errors, report } = checkSessionLifetimeEnforcement();

  if (errors.length > 0) {
    console.error('Session lifetime enforcement check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-session-lifetime-enforcement: OK (${report.verifiers} credential class(es): ` +
      `${report.bounded} bounded, ${report.unbounded} relying on the provider's own expiry)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
