#!/usr/bin/env node

// The device authorization grant, checked against the schema rather than
// against a description of it. A user code is typed by a person into a page
// they reached from somewhere else, so it is guessable by construction: what
// keeps it safe is where it comes from, how long it lives, that it is spent
// once, and that every state it can be left in refuses to mint a token.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const GRANT_ROOTS = ['apps/web/app/api/auth/device', 'apps/web/app/api/device'];
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const CODE_VALIDATIONS = 'apps/web/lib/validations/device.ts';
export const CODE_GENERATOR = 'apps/web/lib/server/device-codes.ts';
export const TOKEN_ROUTE = 'apps/web/app/api/auth/device/token/route.ts';
export const GRANT_TABLE = 'device_authorization_codes';

/** Below this a code is worth guessing even through a throttle. */
export const MINIMUM_CODE_BITS = 32;

/** Characters a person reads off one screen and types into another. */
export const CONFUSABLE = ['0', 'O', '1', 'I', 'L'];

/** The states a code can be left in that must never produce a token. */
export const TERMINAL_STATUSES = ['denied', 'expired', 'consumed', 'revoked'];

/** A statement is only read for statuses when that statement names the grant table. */
const STATUS_CHECK = /check\s*\(\s*status\s*=\s*any\s*\(\s*array\[([^\]]*)\]/gis;

const STATUS_COMPARISON = /\bstatus\s*(?:===|!==|==|!=)\s*'([a-z_]+)'/g;

/** The refusal that makes an unrecognised state safe instead of a way through. */
const CATCH_ALL = /\bstatus\s*!==\s*'approved'/;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function routeFiles(repoRoot, roots) {
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
      if (path.basename(relativePath) === 'route.ts') found.push(relativePath);
      return;
    }
    for (const entry of readdirSync(absolute).sort()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(path.posix.join(relativePath, entry));
    }
  };
  for (const root of roots) walk(root);
  return found;
}

/** Every status the migrations allow the grant table to hold. */
export function grantStatuses(repoRoot, migrationsDir = MIGRATIONS_DIR, table = GRANT_TABLE) {
  const statuses = new Set();
  let entries;
  try {
    entries = readdirSync(path.join(repoRoot, migrationsDir)).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(path.join(repoRoot, migrationsDir, entry), 'utf8');
    if (!sql.includes(table)) continue;

    for (const statement of sql.split(';')) {
      const body = statement.replace(/--[^\n]*/g, '');
      if (!new RegExp(`(?:create table|alter table)[^(]*?\\b${table}\\b`, 'is').test(body))
        continue;
      for (const check of body.matchAll(STATUS_CHECK)) {
        for (const literal of check[1].matchAll(/'([a-z_]+)'/g)) statuses.add(literal[1]);
      }
    }
  }
  return [...statuses].sort();
}

export function userCodeEntropyBits(validationsSource) {
  const alphabet = /CLI_USER_CODE_ALPHABET\s*=\s*'([^']+)'/.exec(validationsSource)?.[1];
  const pattern = /CLI_USER_CODE_PATTERN\s*=\s*\/\^([^/]+)\$\//.exec(validationsSource)?.[1];
  if (!alphabet || !pattern) return null;

  let characters = 0;
  for (const group of pattern.matchAll(/\{(\d+)\}/g)) characters += Number(group[1]);
  if (characters === 0) return null;
  return { alphabet, characters, bits: Math.log2(alphabet.length) * characters };
}

export function checkDeviceAuthGrant(repoRoot = REPO_ROOT, options = {}) {
  const roots = options.roots ?? GRANT_ROOTS;
  const errors = [];
  const report = { routes: 0, statuses: 0, codeBits: 0 };

  const routes = routeFiles(repoRoot, roots);
  report.routes = routes.length;
  if (routes.length === 0) {
    errors.push(`${roots.join(', ')}: no route found, so the grant cannot be checked.`);
    return { errors, report };
  }

  for (const route of routes) {
    const source = read(repoRoot, route) ?? '';
    if (!/\bwithRateLimit\s*\(/.test(source)) {
      errors.push(`${route}: part of the device grant and throttles nothing.`);
    }
    if (!/Cache-Control['"]?\s*:\s*['"]no-store/.test(source)) {
      errors.push(
        `${route}: answers a device grant request without no-store, so a code or a token can be cached.`,
      );
    }
  }

  const validations = read(repoRoot, options.validations ?? CODE_VALIDATIONS);
  if (validations === null) {
    errors.push(`${options.validations ?? CODE_VALIDATIONS}: the user-code format is gone.`);
  } else {
    const entropy = userCodeEntropyBits(validations);
    if (entropy === null) {
      errors.push(
        `${options.validations ?? CODE_VALIDATIONS}: the user-code alphabet and pattern can no longer be read together, ` +
          'so nothing measures how guessable a code is.',
      );
    } else {
      report.codeBits = Math.floor(entropy.bits);
      if (entropy.bits < MINIMUM_CODE_BITS) {
        errors.push(
          `${options.validations ?? CODE_VALIDATIONS}: a user code carries ${entropy.bits.toFixed(1)} bits ` +
            `(${entropy.alphabet.length} characters over ${entropy.characters} places) and needs at least ${MINIMUM_CODE_BITS}.`,
        );
      }
      const confusable = CONFUSABLE.filter((character) => entropy.alphabet.includes(character));
      if (confusable.length > 0) {
        errors.push(
          `${options.validations ?? CODE_VALIDATIONS}: the user-code alphabet holds ${confusable.join(', ')}, which a person ` +
            'mistypes from one screen to another, turning a refusal into a guess at another live code.',
        );
      }
    }
  }

  const generator = read(repoRoot, options.generator ?? CODE_GENERATOR);
  if (generator === null) {
    errors.push(`${options.generator ?? CODE_GENERATOR}: the user-code generator is gone.`);
  } else {
    if (/Math\.random/.test(generator)) {
      errors.push(
        `${options.generator ?? CODE_GENERATOR}: draws a user code from Math.random, which is predictable from earlier codes.`,
      );
    }
    if (!/crypto\.randomBytes|crypto\.getRandomValues/.test(generator)) {
      errors.push(
        `${options.generator ?? CODE_GENERATOR}: no longer draws a user code from the platform random source.`,
      );
    }
  }

  const statuses = grantStatuses(repoRoot, options.migrations ?? MIGRATIONS_DIR, GRANT_TABLE);
  report.statuses = statuses.length;
  if (statuses.length === 0) {
    errors.push(
      `${options.migrations ?? MIGRATIONS_DIR}: no status vocabulary found for ${GRANT_TABLE}, so nothing enumerates what a code can be.`,
    );
  }

  const tokenRoute = read(repoRoot, options.tokenRoute ?? TOKEN_ROUTE);
  if (tokenRoute === null) {
    errors.push(`${options.tokenRoute ?? TOKEN_ROUTE}: the route that mints the token is gone.`);
  } else {
    const compared = new Set([...tokenRoute.matchAll(STATUS_COMPARISON)].map((match) => match[1]));
    const invented = [...compared].filter((status) => !statuses.includes(status));
    if (invented.length > 0) {
      errors.push(
        `${options.tokenRoute ?? TOKEN_ROUTE}: decides on status ${invented.map((status) => `'${status}'`).join(', ')}, ` +
          `which ${GRANT_TABLE} can never hold, so that branch is dead and the state it meant to catch is not caught.`,
      );
    }

    for (const status of TERMINAL_STATUSES) {
      if (statuses.includes(status) && !compared.has(status) && !CATCH_ALL.test(tokenRoute)) {
        errors.push(
          `${options.tokenRoute ?? TOKEN_ROUTE}: '${status}' is a state a code never returns from, and the route neither ` +
            'names it nor refuses everything that is not approved.',
        );
      }
    }

    if (!CATCH_ALL.test(tokenRoute)) {
      errors.push(
        `${options.tokenRoute ?? TOKEN_ROUTE}: has no refusal for a code that is not approved, so a state added to ` +
          `${GRANT_TABLE} tomorrow is answered by whatever the fall-through happens to do.`,
      );
    }
    if (!/status\s*===\s*'pending'/.test(tokenRoute)) {
      errors.push(
        `${options.tokenRoute ?? TOKEN_ROUTE}: never names 'pending', so a client waiting on a live code and a client ` +
          'holding a dead one are told the same thing.',
      );
    }
    if (!/status\s*=\s*'consumed'[^;]*WHERE[^;]*status\s*=\s*'approved'/is.test(tokenRoute)) {
      errors.push(
        `${options.tokenRoute ?? TOKEN_ROUTE}: spends a code without making 'approved' the condition of the update, ` +
          'so two polls of one code can both mint a token.',
      );
    }
  }

  return { errors, report };
}

function main() {
  const { errors, report } = checkDeviceAuthGrant();

  if (errors.length > 0) {
    console.error('Device authorization grant check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-device-auth-grant: OK (${report.routes} grant route(s), ${report.statuses} code state(s), ` +
      `${report.codeBits}-bit user code)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
