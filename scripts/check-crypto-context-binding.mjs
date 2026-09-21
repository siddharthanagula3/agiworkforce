#!/usr/bin/env node
/**
 * Every context-bound envelope open states whether it admits a ciphertext that
 * carries no associated data.
 *
 * A ciphertext sealed without associated data opens under EVERY context, so a
 * call site that admits one admits a value written for any other purpose,
 * resource or tenant. The envelope module makes the answer a required field;
 * this makes it a ratchet, so the set of call sites that still say yes can only
 * shrink and a new one cannot inherit the allowance by copying a neighbour.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const MODULE = 'apps/web/lib/crypto/envelope.ts';
const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'build', 'coverage']);

/**
 * Call sites that still admit a ciphertext with no associated data, each with
 * the reason it cannot refuse one yet. A `true` anywhere else fails, and an
 * entry whose call site has stopped saying `true` fails as stale.
 */
const ADMITS_UNBOUND = [
  {
    file: 'apps/web/lib/crypto/connector-secret-reseal.ts',
    reason:
      'connector secrets sealed before the purpose became associated data still open here, and this is the module whose re-seal takes the allowance away',
  },
  {
    file: 'apps/web/lib/crypto/cmek-lifecycle.ts',
    reason: 'the rewrap is the path that re-seals them, and it reports what it found unbound',
  },
];

const failures = [];

function sourceFilesUnder(root) {
  const absolute = path.join(scanRoot, root);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(dir, entry.name));
    }
  };
  walk(absolute);
  return files.sort();
}

/** The argument list of one `openEnvelope(...)`, balanced across nesting. */
function callArguments(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, index);
    }
  }
  return null;
}

export function contextBoundOpens(source) {
  const opens = [];
  const pattern = /\bopenEnvelope\s*\(/gu;
  for (const found of source.matchAll(pattern)) {
    const args = callArguments(source, (found.index ?? 0) + found[0].length - 1);
    if (args === null) continue;
    if (!/\bvalue\s*:/u.test(args) && !/\bcontext\b/u.test(args)) continue;
    const admits = /acceptUnbound\s*:\s*true/u.test(args);
    const refuses = /acceptUnbound\s*:\s*false/u.test(args);
    opens.push({ admits, refuses, stated: admits || refuses });
  }
  return opens;
}

const modulePath = path.join(scanRoot, MODULE);
if (!fs.existsSync(modulePath)) {
  console.error(
    `check-crypto-context-binding: ${MODULE} is missing; there is no contract to hold.`,
  );
  process.exit(1);
}

const moduleSource = fs.readFileSync(modulePath, 'utf8');
for (const required of [
  {
    pattern: /acceptUnbound\s*:\s*boolean/u,
    detail: 'requires every bound open to state whether it admits an unbound ciphertext',
  },
  {
    pattern: /if\s*\(\s*!\s*context\.acceptUnbound\s*\)\s*throw/u,
    detail: 'refuses an unbound ciphertext when the call site did not admit one',
  },
  {
    pattern: /setAAD\(/u,
    detail: 'binds the context into the authentication tag at all',
  },
]) {
  if (!required.pattern.test(moduleSource)) {
    failures.push(`${MODULE} no longer ${required.detail}`);
  }
}

const admitting = new Map();
let bound = 0;

for (const root of SCAN_ROOTS) {
  for (const file of sourceFilesUnder(root)) {
    const relative = path.relative(scanRoot, file);
    if (relative.replace(/\\/gu, '/') === MODULE) continue;
    if (/\.(test|spec)\.tsx?$/u.test(relative)) continue;
    for (const open of contextBoundOpens(fs.readFileSync(file, 'utf8'))) {
      bound += 1;
      const key = relative.replace(/\\/gu, '/');
      if (!open.stated) {
        failures.push(`${key} opens an envelope with a context and states no acceptUnbound`);
        continue;
      }
      if (open.admits) admitting.set(key, (admitting.get(key) ?? 0) + 1);
    }
  }
}

const baseline = new Set(ADMITS_UNBOUND.map((entry) => entry.file));
for (const entry of ADMITS_UNBOUND) {
  if (!entry.reason || entry.reason.length < 40) {
    failures.push(`${entry.file} is exempted with no reason worth reading`);
  }
  if (!admitting.has(entry.file)) {
    failures.push(
      `${entry.file} no longer admits an unbound ciphertext; drop it from the baseline`,
    );
  }
}
for (const file of admitting.keys()) {
  if (!baseline.has(file)) {
    failures.push(
      `${file} admits a ciphertext with no associated data, which opens under any context`,
    );
  }
}

for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  `[crypto context binding] ${bound} context-bound open(s), ${admitting.size} still admitting unbound, ${failures.length} failure(s)`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
