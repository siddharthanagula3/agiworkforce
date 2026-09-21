#!/usr/bin/env node
// A security control nothing calls is not dead code: it is a control the
// product claims, tests, and never performs. Asked one export at a time.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  collectWorkspacePackageAliases,
  createResolver,
  isTestPath,
  listSourceFiles,
  stripComments,
  toRepoRelative,
} from './lib/module-graph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

export const BASELINE_PATH = 'scripts/config/security-control-reachability-baseline.json';

/** The directories whose exports are security controls by construction. */
const CONTROL_DIRECTORIES = [
  'apps/web/lib/security',
  'apps/web/lib/auth',
  'apps/web/lib/crypto',
  'apps/web/lib/url-fetch',
  'apps/web/lib/server/step-up',
  'apps/web/lib/server/retention',
];

/** Server modules whose filename says they erase, retain or hold data. */
const CONTROL_FILE_PATTERN =
  /^apps\/web\/lib\/server\/[^/]*(?:erasure|retention|legal-hold|tombstone)[^/]*\.tsx?$/;

/**
 * Whatever the route gate leans on to decide a request is part of the decision,
 * so its subjects are read from the gate's own imports rather than named here.
 */
const ROUTE_GATE = 'apps/web/lib/api-auth.ts';

const CALLER_ROOTS = ['apps', 'packages', 'scripts', 'tools', 'services'];

/**
 * A control does something to a subject. A reader answers a question and costs
 * nothing when nobody asks it. Stems, so a past participle counts too.
 */
const CONTROL_STEMS = [
  'anonymise',
  'anonymize',
  'assert',
  'block',
  'bound',
  'cap',
  'check',
  'deny',
  'destroy',
  'detect',
  'disable',
  'end',
  'enforce',
  'ensure',
  'evict',
  'erase',
  'expire',
  'fence',
  'forbid',
  'guard',
  'inspect',
  'invalidate',
  'lock',
  'mask',
  'prevent',
  'protect',
  'provision',
  'purge',
  'quarantine',
  'redact',
  'refuse',
  'reject',
  'replay',
  'require',
  'reseal',
  'restrict',
  'retire',
  'revoke',
  'rewrap',
  'rotate',
  'sanitise',
  'sanitize',
  'scan',
  'scrub',
  'seal',
  'suspend',
  'terminate',
  'throttle',
  'unseal',
  'validate',
  'verify',
  'wipe',
];

/** A stem carries its participle and its plural, so `guarded` counts as `guard`. */
export function matchesControlStem(word) {
  return CONTROL_STEMS.some(
    (stem) =>
      word === stem ||
      word === `${stem}s` ||
      word === `${stem}d` ||
      word === `${stem}ed` ||
      word === `${stem}es` ||
      (stem.endsWith('y') &&
        (word === `${stem.slice(0, -1)}ied` || word === `${stem.slice(0, -1)}ies`)),
  );
}

/** Carries no meaning of its own, so it hands the question to what follows. */
const NEUTRAL_PREFIXES = new Set([
  'run',
  'perform',
  'execute',
  'start',
  'begin',
  'apply',
  'do',
  're',
]);

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const EXPORTED_DECLARATION =
  /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_LIST = /^export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/gm;
const EXPORT_STAR = /^export\s*\*\s*(?:as\s+[\w$]+\s*)?from\s*['"]([^'"]+)['"]/gm;

export function isControlName(name) {
  if (/^[A-Z0-9_]+$/.test(name)) return false;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .map((word) => word.toLowerCase());
  const [first, ...rest] = words;
  if (matchesControlStem(first)) return true;
  return NEUTRAL_PREFIXES.has(first) && rest.some((word) => matchesControlStem(word));
}

export function isControlModule(rel, gateDependencies = new Set()) {
  if (CONTROL_FILE_PATTERN.test(rel) || gateDependencies.has(rel)) return true;
  return CONTROL_DIRECTORIES.some((directory) => rel.startsWith(`${directory}/`));
}

/** What the route gate imports, resolved, so a decision it leans on is in scope. */
function gateDependencies(index) {
  const gate = index.files.find((file) => index.relOf.get(file) === ROUTE_GATE);
  if (gate === undefined) return new Set();
  const dependencies = new Set();
  for (const specifier of importedBindings(index.read(gate)).keys()) {
    const resolved = index.resolve(specifier, gate);
    if (resolved === null) continue;
    const rel = index.relOf.get(path.resolve(resolved));
    if (rel !== undefined) dependencies.add(rel);
  }
  return dependencies;
}

/**
 * Top level declarations start at column zero in this repository, so a chunk
 * runs from one of them to the next and owns every reference inside it.
 */
export function declarationChunks(source) {
  const lines = stripComments(source).split('\n');
  const chunks = new Map();
  const preamble = [];
  let current = null;
  for (const line of lines) {
    const match = DECLARATION.exec(line);
    if (match !== null) {
      current = match[1];
      if (!chunks.has(current)) chunks.set(current, []);
    } else if (/^\S/.test(line) && !/^[)\]}`]/.test(line) && current !== null) {
      current = null;
    }
    if (current === null) preamble.push(line);
    else chunks.get(current).push(line);
  }
  return {
    chunks: new Map([...chunks].map(([k, v]) => [k, v.join('\n')])),
    preamble: preamble.join('\n'),
  };
}

export function exportedNames(source) {
  const stripped = stripComments(source);
  const names = new Set();
  for (const line of stripped.split('\n')) {
    const match = EXPORTED_DECLARATION.exec(line);
    if (match !== null) names.add(match[1]);
  }
  EXPORT_LIST.lastIndex = 0;
  for (const match of stripped.matchAll(EXPORT_LIST)) {
    if (match[2]) continue;
    for (const clause of match[1].split(',')) {
      const parts = clause.trim().split(/\s+as\s+/);
      const exposed = (parts[1] ?? parts[0]).trim();
      if (exposed.length > 0 && !exposed.startsWith('type ')) names.add(exposed);
    }
  }
  return names;
}

/** What this module pulls out of each specifier, or '*' for a whole namespace. */
export function importedBindings(source) {
  const stripped = stripComments(source);
  const bindings = new Map();
  const add = (specifier, name) => {
    if (!bindings.has(specifier)) bindings.set(specifier, new Set());
    bindings.get(specifier).add(name);
  };
  const namedImport = /import\s+([^'";]+?)\s+from\s*['"]([^'"\n]+)['"]/g;
  for (const match of stripped.matchAll(namedImport)) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (clause.startsWith('type ')) continue;
    const braced = /\{([^}]*)\}/.exec(clause);
    if (braced !== null) {
      for (const entry of braced[1].split(',')) {
        const trimmed = entry.trim();
        if (trimmed.length === 0 || trimmed.startsWith('type ')) continue;
        add(specifier, trimmed.split(/\s+as\s+/)[0].trim());
      }
    }
    if (/^\*\s+as\s/.test(clause) || /\*\s+as\s/.test(clause)) add(specifier, '*');
    const bare = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (bare !== null) add(specifier, 'default');
  }
  const dynamicImport = /import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  for (const match of stripped.matchAll(dynamicImport)) add(match[1], '*');
  const requireCall = /require\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  for (const match of stripped.matchAll(requireCall)) add(match[1], '*');
  EXPORT_LIST.lastIndex = 0;
  for (const match of stripped.matchAll(EXPORT_LIST)) {
    if (!match[2]) continue;
    for (const clause of match[1].split(',')) {
      const trimmed = clause.trim();
      if (trimmed.length === 0 || trimmed.startsWith('type ')) continue;
      add(match[2], trimmed.split(/\s+as\s+/)[0].trim());
    }
  }
  EXPORT_STAR.lastIndex = 0;
  for (const match of stripped.matchAll(EXPORT_STAR)) add(match[1], '*');
  return bindings;
}

function webAliases(root) {
  return {
    '@/*': path.join(root, 'apps/web'),
    '@shared/*': path.join(root, 'apps/web/shared'),
    '@features/*': path.join(root, 'apps/web/features'),
  };
}

function buildIndex(root) {
  const files = [];
  for (const caller of CALLER_ROOTS) files.push(...listSourceFiles(path.join(root, caller)));
  const relOf = new Map(files.map((file) => [file, toRepoRelative(root, file)]));
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8'));
    return cache.get(file);
  };
  const workspace = collectWorkspacePackageAliases(root);
  const webResolver = createResolver({ ...webAliases(root), ...workspace });
  const plainResolver = createResolver(workspace);
  const resolve = (specifier, from) =>
    relOf.get(from)?.startsWith('apps/web/')
      ? webResolver(specifier, from)
      : plainResolver(specifier, from);
  const byRel = new Map(files.map((file) => [relOf.get(file), file]));
  return { files, relOf, byRel, read, resolve };
}

/**
 * Who pulls each name out of each module, split by whether the importer is a
 * test. A test importing a control is exactly the shape this guard is for.
 */
function importerIndex(index) {
  const pulls = new Map();
  const record = (target, name, importer, fromTest) => {
    if (!pulls.has(target)) pulls.set(target, new Map());
    const perName = pulls.get(target);
    if (!perName.has(name)) perName.set(name, { production: new Set(), tests: new Set() });
    perName.get(name)[fromTest ? 'tests' : 'production'].add(importer);
  };
  for (const file of index.files) {
    const rel = index.relOf.get(file);
    const fromTest = isTestPath(rel);
    let bindings;
    try {
      bindings = importedBindings(index.read(file));
    } catch {
      continue;
    }
    for (const [specifier, names] of bindings) {
      const resolved = index.resolve(specifier, file);
      if (resolved === null) continue;
      const target = index.relOf.get(path.resolve(resolved));
      if (target === undefined || target === rel) continue;
      for (const name of names) record(target, name, rel, fromTest);
    }
  }
  return pulls;
}

/** A whole-namespace import says nothing by itself, so ask whether it names this one. */
function namesInImporters(index, importers, name) {
  if (importers === undefined) return false;
  const reference = new RegExp(`\\b${name}\\b`);
  for (const importer of importers) {
    const file = index.byRel.get(importer);
    if (file !== undefined && reference.test(index.read(file))) return true;
  }
  return false;
}

/**
 * Reachability inside one module: an export used by a reachable declaration is
 * reachable, so a private helper behind a live entry point is not a finding.
 */
export function intraModuleClosure(source, seeds) {
  const { chunks, preamble } = declarationChunks(source);
  const declared = new Set(chunks.keys());
  const reachable = new Set(seeds);
  const queue = [...reachable];
  const scan = (text) => {
    for (const name of declared) {
      if (reachable.has(name)) continue;
      if (new RegExp(`\\b${name}\\b`).test(text)) {
        reachable.add(name);
        queue.push(name);
      }
    }
  };
  scan(preamble);
  while (queue.length > 0) {
    const name = queue.pop();
    const body = chunks.get(name);
    if (body !== undefined) scan(body);
  }
  return reachable;
}

function readBaseline(root) {
  const file = path.join(root, BASELINE_PATH);
  if (!fs.existsSync(file)) return { entries: new Map(), failures: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { entries: new Map(), failures: [`${BASELINE_PATH} is not readable JSON: ${error}`] };
  }
  const entries = new Map();
  const failures = [];
  for (const entry of parsed.unreachable ?? []) {
    if (!entry.control || !entry.owner) {
      failures.push(
        `${BASELINE_PATH} entry ${entry.module}::${entry.name} needs both the control it ` +
          `promises and the file that owes the call.`,
      );
      continue;
    }
    entries.set(`${entry.module}::${entry.name}`, entry);
  }
  return { entries, failures };
}

export function analyse(root) {
  const index = buildIndex(root);
  const pulls = importerIndex(index);
  const dependencies = gateDependencies(index);
  const subjects = index.files.filter((file) => {
    const rel = index.relOf.get(file);
    return !isTestPath(rel) && isControlModule(rel, dependencies);
  });

  const controls = [];
  for (const file of subjects) {
    const rel = index.relOf.get(file);
    const source = index.read(file);
    const names = exportedNames(source);
    if (names.size === 0) continue;
    const perName = pulls.get(rel) ?? new Map();
    const namespaced = (perName.get('*')?.production.size ?? 0) > 0;
    const seeds = new Set();
    for (const name of names) {
      const production = perName.get(name)?.production;
      if ((production?.size ?? 0) > 0) seeds.add(name);
    }
    if (namespaced) {
      for (const name of names) {
        if (namesInImporters(index, perName.get('*').production, name)) seeds.add(name);
      }
    }
    const reachable = intraModuleClosure(source, seeds);
    for (const name of names) {
      if (!isControlName(name)) continue;
      const entry = perName.get(name);
      controls.push({
        module: rel,
        name,
        reachable: reachable.has(name),
        tested:
          (entry?.tests.size ?? 0) > 0 || namesInImporters(index, perName.get('*')?.tests, name),
        callers: [...(entry?.production ?? [])],
      });
    }
  }
  return { subjects: subjects.length, controls, moduleCount: index.files.length };
}

function main() {
  const { subjects, controls, moduleCount } = analyse(scanRoot);
  if (moduleCount === 0 || subjects === 0) {
    console.error(
      'check-security-control-reachability: no control module was found, which cannot be right.',
    );
    process.exit(1);
  }

  const { entries: excused, failures } = readBaseline(scanRoot);
  const unreachable = controls.filter((control) => !control.reachable);
  for (const control of unreachable) {
    const key = `${control.module}::${control.name}`;
    if (excused.has(key)) continue;
    failures.push(
      `${key} names a control and nothing in production reaches it` +
        `${control.tested ? ', though its own tests do' : ''}. The control exists and is never ` +
        `performed. Give it a caller, or delete it and the claim with it.`,
    );
  }
  for (const key of excused.keys()) {
    if (unreachable.some((control) => `${control.module}::${control.name}` === key)) continue;
    failures.push(
      `${BASELINE_PATH} still excuses ${key}, which is reachable now. Remove the entry so the ` +
        `list can only shrink.`,
    );
  }

  if (failures.length === 0) {
    const tested = unreachable.filter((control) => control.tested).length;
    console.log(
      `check-security-control-reachability: ${subjects} control modules, ${controls.length} ` +
        `exported controls, ${unreachable.length} without a production caller (${tested} of ` +
        `them tested), all accounted for.`,
    );
    process.exit(0);
  }

  console.error('Security controls nothing performs:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
