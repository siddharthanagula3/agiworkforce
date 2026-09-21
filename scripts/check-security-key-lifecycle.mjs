#!/usr/bin/env node
/**
 * Every operation that changes the state of a key or a stored secret has a
 * production caller.
 *
 * Reachability is normally asked of a whole module, and a module answers yes as
 * soon as anything imports any one of its exports. A key lifecycle lives inside
 * such a module: `organizationKeyRing` is imported all over the app, so the file
 * is reachable, while `rotateOrganizationKey` next to it has never been called
 * by anything but its own test. The rotation exists, is tested, and cannot be
 * performed. So the question is asked one export at a time.
 *
 * The subjects are enumerated from the file tree: every module that handles key
 * material, meaning it imports the envelope or the customer-key module, plus
 * everything under the crypto directory itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const BASELINE_PATH = 'scripts/config/security-key-lifecycle-baseline.json';
const SCAN_ROOTS = ['apps/web', 'packages'];
const CRYPTO_DIR = 'apps/web/lib/crypto/';
const SKIPPED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  'coverage',
  '__mocks__',
  'e2e',
]);

/** A module that imports one of these handles key material by definition. */
const KEY_MATERIAL_IMPORT =
  /from\s+['"](?:@\/lib\/crypto\/(?:envelope|cmek)|\.{1,2}(?:\/crypto)?\/(?:envelope|cmek))['"]/;

/**
 * The verbs that move a key or a sealed value from one state to another. A
 * reader is not here: reading is what the rest of the app already does, and a
 * reader nobody calls costs nothing. A writer nobody calls is a control the
 * product claims and cannot perform.
 */
const LIFECYCLE_VERBS = new Set([
  'provision',
  'rotate',
  'revoke',
  'replace',
  'retire',
  'rewrap',
  'reseal',
  'reencrypt',
  'preload',
  'unseal',
  'destroy',
  'purge',
]);

/** `run` carries no meaning of its own, so it hands the question to what follows. */
const NEUTRAL_PREFIXES = new Set(['run', 'perform', 'execute', 'start', 'begin']);

const EXPORTED = /^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm;

export function isLifecycleOperation(name) {
  const words = name.split(/(?=[A-Z])/).map((word) => word.toLowerCase());
  const [first, ...rest] = words;
  if (LIFECYCLE_VERBS.has(first)) return true;
  return NEUTRAL_PREFIXES.has(first) && rest.some((word) => LIFECYCLE_VERBS.has(word));
}

function isTestPath(file) {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`)
  );
}

function sourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      sourceFiles(full, out);
      continue;
    }
    if (/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(scanRoot, file).split(path.sep).join('/');
}

export function lifecycleExports(source) {
  const names = [];
  EXPORTED.lastIndex = 0;
  let match;
  while ((match = EXPORTED.exec(source)) !== null) {
    if (isLifecycleOperation(match[1])) names.push(match[1]);
  }
  return names;
}

export function handlesKeyMaterial(rel, source) {
  return rel.startsWith(CRYPTO_DIR) || KEY_MATERIAL_IMPORT.test(source);
}

function main() {
  const files = SCAN_ROOTS.flatMap((root) => sourceFiles(path.join(scanRoot, root)));
  const production = files.filter((file) => !isTestPath(file));
  if (production.length === 0) {
    console.error('check-security-key-lifecycle: no source file was found, which cannot be right.');
    process.exit(1);
  }

  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8'));
    return cache.get(file);
  };

  const baselinePath = path.join(scanRoot, BASELINE_PATH);
  const baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { unreachable: [] };
  const excused = new Map();
  for (const entry of baseline.unreachable ?? []) {
    if (!entry.reason || !entry.owner) {
      console.error(
        `${BASELINE_PATH} entry ${entry.module}::${entry.name} needs both a reason and the file ` +
          `that owes the call.`,
      );
      process.exit(1);
    }
    excused.set(`${entry.module}::${entry.name}`, entry);
  }

  const unreachable = [];
  let operations = 0;
  let subjects = 0;

  for (const file of production) {
    const rel = relative(file);
    const source = read(file);
    if (!handlesKeyMaterial(rel, source)) continue;
    const names = lifecycleExports(source);
    if (names.length === 0) continue;
    subjects += 1;
    for (const name of names) {
      operations += 1;
      const reference = new RegExp(`\\b${name}\\b`);
      const called = production.some((other) => other !== file && reference.test(read(other)));
      if (!called) unreachable.push({ module: rel, name });
    }
  }

  const live = unreachable.filter((entry) => !excused.has(`${entry.module}::${entry.name}`));
  const fixed = [...excused.keys()].filter(
    (key) => !unreachable.some((entry) => `${entry.module}::${entry.name}` === key),
  );

  const failures = live.map(
    (entry) =>
      `${entry.module}::${entry.name} changes the state of a key or a stored secret and nothing ` +
      `outside its own tests calls it. The control exists and cannot be performed. Give it a ` +
      `route, a job or a script, or delete it.`,
  );
  for (const key of fixed) {
    failures.push(
      `${BASELINE_PATH} still excuses ${key}, which now has a caller. Remove the entry so the ` +
        `list can only shrink.`,
    );
  }

  if (failures.length === 0) {
    console.log(
      `check-security-key-lifecycle: ${subjects} modules handle key material, ${operations} ` +
        `lifecycle operations, ${excused.size} awaiting a caller, none new.`,
    );
    process.exit(0);
  }

  console.error('Key lifecycle operations nothing can reach:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
