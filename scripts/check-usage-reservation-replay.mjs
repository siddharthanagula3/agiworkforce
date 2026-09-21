#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SCANNED_DIRS = ['apps/web/app', 'apps/web/lib'];

/**
 * The two entry points that put a hold on an account's money, and the property
 * that has to replay on each. A provider step extends the hold its parent
 * reservation already holds, so what has to be stable is the step's own name.
 */
export const RESERVATION_CALLS = Object.freeze({
  reserveManagedUsageRequest: 'idempotencyKey',
  reserveManagedUsageProviderStep: 'operationKey',
});

/**
 * A reservation is deduplicated by its idempotency key: the ledger stores the
 * key and returns the first reservation again rather than opening a second
 * hold. A key minted from a clock or a random source cannot collide with the
 * key the first attempt used, so a retried request, a redelivered webhook or a
 * resumed workflow step reserves and settles a second time against the same
 * work. Every one of these produces a different string on every call.
 */
export const NON_DETERMINISTIC_SOURCES = [
  'randomUUID',
  'randomBytes',
  'getRandomValues',
  'Math.random',
  'Date.now',
  'new Date',
  'performance.now',
  'nanoid',
  'uuidv4',
  'ulid',
];

/**
 * Call sites whose key is not derived from the request today, each with what
 * it costs and who owns the fix. The guard fails on anything outside this map
 * and on any entry here that has been fixed, so the count can only fall.
 */
export const KNOWN_REPLAY_UNSAFE = Object.freeze({
  'apps/web/lib/e2b/compute-metering.ts':
    'A sandbox that is resumed now keeps the hold it was admitted under, so only a first provision reserves. That provision has no durable identity distinct from the previous sandbox of the same scope: the session record is deleted at teardown, so a spawn identity has to come from the turn that asked for the sandbox, through getE2BExecutor.',
  'apps/web/lib/services/retrieval-embedding-service.ts':
    'The operationKey its only caller passes names a scope, not an operation, so dropping the per-call suffix would make two deliberate searches of the same text collide and the second silently lose semantic ranking. The identity has to come from the chat request id, which reaches the search provider through apps/web/app/api/llm.',
});

const CODE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED = /(^|\/)(node_modules|__tests__|\.next|dist)(\/|$)|\.test\.[a-z]+$|\.d\.ts$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (SKIPPED.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function scannedFiles(repoRoot = REPO_ROOT, dirs = SCANNED_DIRS) {
  const files = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(repoRoot, dir))) {
      if (CODE_EXTENSIONS.has(path.extname(file))) {
        files.push(path.relative(repoRoot, file));
      }
    }
  }
  return files.sort();
}

const QUOTES = new Set(['"', "'", '`']);

/**
 * Walks forward from an opening bracket to its partner, stepping over string
 * literals, template literals and comments so a brace inside a SQL fragment or
 * a URL inside a comment cannot end the span early.
 */
function matchingBracket(source, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index === -1) return -1;
      continue;
    }
    if (character === '/' && next === '*') {
      index = source.indexOf('*/', index + 2);
      if (index === -1) return -1;
      index += 1;
      continue;
    }
    if (QUOTES.has(character)) {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') index += 1;
        else if (source[index] === quote) break;
        index += 1;
      }
      continue;
    }
    if (pairs[character]) {
      stack.push(pairs[character]);
      continue;
    }
    if (character === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

/** The value written for `key` at the top level of an object literal body. */
export function objectPropertyValue(body, key) {
  const pattern = new RegExp(`(^|[,{\\s])${key}\\s*(:|,|$)`, 'm');
  const match = pattern.exec(body);
  if (!match) return null;

  const colon = body.indexOf(':', match.index + match[0].length - 1);
  const isShorthand = match[2] !== ':';
  if (isShorthand) return { shorthand: true, expression: key };

  let depth = 0;
  for (let index = colon + 1; index < body.length; index += 1) {
    const character = body[index];
    if (QUOTES.has(character)) {
      const quote = character;
      index += 1;
      while (index < body.length) {
        if (body[index] === '\\') index += 1;
        else if (body[index] === quote) break;
        index += 1;
      }
      continue;
    }
    if ('({['.includes(character)) depth += 1;
    else if (')}]'.includes(character)) depth -= 1;
    else if (character === ',' && depth === 0) {
      return { shorthand: false, expression: body.slice(colon + 1, index).trim() };
    }
  }
  return { shorthand: false, expression: body.slice(colon + 1).trim() };
}

/**
 * What a shorthand key resolves to inside its own module. A key handed in by a
 * caller resolves to nothing here, which is the correct answer: the guard then
 * judges the module that builds it.
 */
export function resolveLocalBinding(source, name) {
  const pattern = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*`, 'g');
  const expressions = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const end = source.indexOf('\n', start);
    expressions.push(source.slice(start, end === -1 ? source.length : end).trim());
  }
  return expressions;
}

export function nonDeterministicSourceIn(expression) {
  return NON_DETERMINISTIC_SOURCES.find((token) => expression.includes(token)) ?? null;
}

const CALLED_NAME = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Where a name used in a key expression comes from, for the local modules a
 * fix can hide a random source inside. A package import resolves to nothing,
 * which is the right answer: this walks one level only, because the reservation
 * service itself mints a lease token and is not what builds the key.
 */
export function importedModulePath(source, name, file) {
  NAMED_IMPORT.lastIndex = 0;
  let match;
  while ((match = NAMED_IMPORT.exec(source)) !== null) {
    const bound = match[1]
      .split(',')
      .map((entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim(),
      )
      .filter(Boolean);
    if (!bound.includes(name)) continue;
    const specifier = match[2];
    if (specifier.startsWith('@/')) return path.join('apps/web', specifier.slice(2));
    if (specifier.startsWith('.')) return path.join(path.dirname(file), specifier);
    return null;
  }
  return null;
}

function readModule(repoRoot, relative) {
  for (const candidate of [`${relative}.ts`, `${relative}.tsx`, path.join(relative, 'index.ts')]) {
    try {
      return readFileSync(path.join(repoRoot, candidate), 'utf8');
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The body of one exported function, so a helper is judged on what it does
 * rather than on what else its module contains. The reservation service mints a
 * lease token a few lines away from the key parser every route calls.
 */
export function exportedFunctionBody(source, name) {
  const declaration = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(|export\\s+const\\s+${name}\\s*(?::[^=]+)?=`,
  ).exec(source);
  if (!declaration) return null;

  const params = source.indexOf('(', declaration.index + declaration[0].length - 1);
  const afterParams = params === -1 ? declaration.index : matchingBracket(source, params);
  if (afterParams === -1) return null;

  const body = source.indexOf('{', afterParams);
  if (body !== -1) {
    const end = matchingBracket(source, body);
    if (end !== -1) return source.slice(body, end + 1);
  }
  const statementEnd = source.indexOf(';', afterParams);
  return source.slice(declaration.index, statementEnd === -1 ? source.length : statementEnd);
}

/** The local modules a key expression calls into, so their bodies are judged too. */
export function keyHelperSources(source, expression, file, repoRoot) {
  const helpers = [];
  const seen = new Set();
  for (const match of expression.matchAll(CALLED_NAME)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const modulePath = importedModulePath(source, name, file);
    if (!modulePath) continue;
    const helper = readModule(repoRoot, modulePath);
    if (helper === null) continue;
    const body = exportedFunctionBody(helper, name);
    if (body !== null) helpers.push({ name, source: body });
  }
  return helpers;
}

export function reservationKeys(source) {
  const found = [];
  for (const [call, keyProperty] of Object.entries(RESERVATION_CALLS)) {
    const pattern = new RegExp(`\\b${call}\\s*\\(`, 'g');
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const open = match.index + match[0].length - 1;
      const close = matchingBracket(source, open);
      if (close === -1) continue;
      const args = source.slice(open + 1, close);
      const property = objectPropertyValue(args, keyProperty);
      if (!property) {
        found.push({ call, keyProperty, expression: null, resolved: [] });
        continue;
      }
      const resolved = property.shorthand ? resolveLocalBinding(source, property.expression) : [];
      found.push({ call, keyProperty, expression: property.expression, resolved });
    }
  }
  return found;
}

export function checkUsageReservationReplay(repoRoot = REPO_ROOT, dirs = SCANNED_DIRS) {
  const offenders = new Map();
  let callSites = 0;
  let files = 0;

  for (const file of scannedFiles(repoRoot, dirs)) {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    if (!Object.keys(RESERVATION_CALLS).some((call) => source.includes(call))) continue;

    const keys = reservationKeys(source);
    if (keys.length === 0) continue;
    files += 1;
    callSites += keys.length;

    for (const key of keys) {
      if (key.expression === null) {
        offenders.set(file, {
          file,
          call: key.call,
          token: `no ${key.keyProperty}`,
          expression: '',
        });
        continue;
      }
      const candidates = [key.expression, ...key.resolved];
      let flagged = false;
      for (const candidate of candidates) {
        const token = nonDeterministicSourceIn(candidate);
        if (token) {
          offenders.set(file, { file, call: key.call, token, expression: candidate.slice(0, 160) });
          flagged = true;
          break;
        }
      }
      if (flagged) continue;

      for (const candidate of candidates) {
        for (const helper of keyHelperSources(source, candidate, file, repoRoot)) {
          const token = nonDeterministicSourceIn(helper.source);
          if (!token) continue;
          offenders.set(file, {
            file,
            call: key.call,
            token: `${token} inside ${helper.name}`,
            expression: candidate.slice(0, 160),
          });
          flagged = true;
          break;
        }
        if (flagged) break;
      }
    }
  }

  const unexpected = [...offenders.values()].filter(
    (entry) => !(entry.file in KNOWN_REPLAY_UNSAFE),
  );
  const repaired = Object.keys(KNOWN_REPLAY_UNSAFE).filter((file) => !offenders.has(file));
  return { files, callSites, offenders: [...offenders.values()], unexpected, repaired };
}

function main() {
  const result = checkUsageReservationReplay();

  if (result.unexpected.length > 0) {
    console.error(
      'A managed usage reservation is keyed on something that changes every call.\n' +
        'The ledger deduplicates a hold by its idempotency key, so a key minted\n' +
        'from a clock or a random source bills a retry, a redelivery or a resumed\n' +
        'step a second time for one piece of work. Derive the key from the request.\n',
    );
    for (const entry of result.unexpected) {
      console.error(`  ${entry.file}: ${entry.call} keyed on ${entry.token}`);
      if (entry.expression) console.error(`    ${entry.expression.replace(/\s+/g, ' ')}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.repaired.length > 0) {
    console.error(
      'These call sites now derive a replayable key and must leave the known list:\n' +
        result.repaired.map((file) => `  ${file}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-usage-reservation-replay: ${result.callSites} reservations across ${result.files} files, ` +
      `${result.offenders.length} known replay unsafe, none new`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
