#!/usr/bin/env node
/* global console */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The webview inspector must not reach a shipped binary. Tauri turns it on for
 * the crate's own `devtools` feature, for `tauri/devtools` reached from any
 * feature, for `devtools` in the tauri dependency's own feature list, for
 * features the Tauri config hands to cargo, and for any build compiled with
 * debug assertions. The compile_error in src-tauri/src/lib.rs covers only the
 * first, so this resolves every other source a release build takes them from.
 */
const FORBIDDEN_FEATURE = 'devtools';
const FORBIDDEN_DEPENDENCY_FEATURE = 'tauri/devtools';
const DEFAULT_FEATURE = 'default';
const RELEASE_PROFILE = 'release';
const PROJECT_DIR = 'apps/desktop';
const TAURI_DIR = 'apps/desktop/src-tauri';
const RELEASE_CONFIG_FILES = [
  'tauri.conf.json',
  'tauri.linux.conf.json',
  'tauri.macos.conf.json',
  'tauri.windows.conf.json',
];
const TABLE_PREFIX = String.raw`(?:workspace\.|target\.(?:'[^']*'|"[^"]*"|[^.'"]+)\.)?`;
const DEPENDENCY_TABLE = new RegExp(`^${TABLE_PREFIX}dependencies$`, 'u');
const TAURI_DEPENDENCY_TABLE = new RegExp(`^${TABLE_PREFIX}dependencies\\."?tauri"?$`, 'u');
const DEBUG_ASSERTIONS_FLAG = /debug[-_]assertions(?!\s*=\s*(?:off|no|n|false)\b)/iu;

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function count(text, pattern) {
  return (text.replace(/"[^"]*"/gu, '""').match(pattern) ?? []).length;
}

function unclosed(body) {
  return count(body, /\[/gu) > count(body, /\]/gu) || count(body, /\{/gu) > count(body, /\}/gu);
}

function manifestEntries(manifestText) {
  const entries = [];
  let section = '';
  let pending = null;

  for (const rawLine of manifestText.split(/\r?\n/u)) {
    const line = rawLine.replace(/^((?:[^"'#]|"[^"]*"|'[^']*')*)#.*$/u, '$1').trim();
    if (line.length === 0) continue;

    if (pending === null) {
      const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/u.exec(line);
      if (header) {
        section = header[1];
        continue;
      }
      const assignment = /^"?([A-Za-z0-9_.-]+?)"?\s*=\s*(.*)$/u.exec(line);
      if (!assignment) continue;
      pending = { section, key: assignment[1], body: assignment[2] };
    } else {
      pending.body += ` ${line}`;
    }

    if (unclosed(pending.body)) continue;
    entries.push(pending);
    pending = null;
  }
  return entries;
}

function quoted(text) {
  return [...text.matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
}

function normalizeFeature(feature) {
  return feature.replace(/^agiworkforce-desktop\//u, '').replace('?/', '/');
}

function splitFeatureList(value) {
  return value
    .split(/[\s,]+/u)
    .map((feature) => feature.trim())
    .filter((feature) => feature.length > 0)
    .map(normalizeFeature);
}

export function parseFeatureTable(manifestText) {
  const table = new Map();
  for (const { section, key, body } of manifestEntries(manifestText)) {
    if (section === 'features') table.set(key, quoted(body).map(normalizeFeature));
  }
  return table;
}

export function resolveFeatureClosure(table, requested) {
  const seen = new Set();
  const queue = [...requested];
  while (queue.length > 0) {
    const feature = queue.pop();
    if (feature === undefined || seen.has(feature)) continue;
    seen.add(feature);
    for (const member of table.get(feature) ?? []) {
      if (!seen.has(member)) queue.push(member);
    }
  }
  return seen;
}

export function findDevtoolsActivation(
  manifestText,
  requestedFeatures,
  { noDefaultFeatures, allFeatures = false },
) {
  const table = parseFeatureTable(manifestText);
  const roots = [...requestedFeatures];
  if (!noDefaultFeatures && table.has(DEFAULT_FEATURE)) roots.push(DEFAULT_FEATURE);
  if (allFeatures) roots.push(...table.keys());

  const closure = resolveFeatureClosure(table, roots);
  return [FORBIDDEN_FEATURE, FORBIDDEN_DEPENDENCY_FEATURE].filter((feature) =>
    closure.has(feature),
  );
}

export function tauriDependencyFeatures(manifestText) {
  const features = [];
  for (const { section, key, body } of manifestEntries(manifestText)) {
    if (TAURI_DEPENDENCY_TABLE.test(section)) {
      if (key === 'features') features.push(...quoted(body));
      continue;
    }
    if (!DEPENDENCY_TABLE.test(section)) continue;
    if (key === 'tauri.features') features.push(...quoted(body));
    if (key !== 'tauri') continue;
    const list = /(?:^|[\s{,])features\s*=\s*\[([^\]]*)\]/u.exec(body);
    if (list) features.push(...quoted(list[1]));
  }
  return features;
}

export function tauriConfigFeatures(configText) {
  const features = JSON.parse(configText)?.build?.features;
  return Array.isArray(features)
    ? features.map((feature) => normalizeFeature(String(feature)))
    : [];
}

export function debugAssertionRoutes(tomlText) {
  return manifestEntries(tomlText).flatMap(({ section, key, body }) => {
    const name = section ? `${section}.${key}` : key;
    if (/^profile\.release(?:\..+)?\.debug-assertions$/u.test(name) && body.trim() === 'true') {
      return [`${name} = true`];
    }
    if (/(?:^|\.)rustflags$/u.test(name) && DEBUG_ASSERTIONS_FLAG.test(body)) {
      return [`debug assertions in ${name}`];
    }
    return [];
  });
}

export function environmentRoutes(env) {
  return Object.entries(env ?? {}).flatMap(([name, value]) => {
    const text = String(value ?? '');
    if (
      /^CARGO_PROFILE_RELEASE_.*DEBUG_ASSERTIONS$/u.test(name) &&
      /^(?:true|on|yes|y|1)$/iu.test(text.trim())
    ) {
      return [`${name} in the environment`];
    }
    if (/RUSTFLAGS$/u.test(name) && DEBUG_ASSERTIONS_FLAG.test(text)) {
      return [`debug assertions in ${name}`];
    }
    return [];
  });
}

/** Reads `tauri build` arguments, its own flags and the cargo tail after `--`. */
export function parseCargoFeatureArgs(args) {
  const requested = [];
  const configs = [];
  const cargoConfigs = [];
  let noDefaultFeatures = false;
  let allFeatures = false;
  let debug = false;
  let profile = RELEASE_PROFILE;
  let cargoTail = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--') {
      cargoTail = true;
      continue;
    }
    if (arg === '--no-default-features') {
      noDefaultFeatures = true;
      continue;
    }
    if (arg === '--all-features') {
      allFeatures = true;
      continue;
    }
    if (arg === '--features' || arg === '-F' || arg === '-f') {
      do {
        index += 1;
        requested.push(...splitFeatureList(args[index] ?? ''));
      } while (!cargoTail && index + 1 < args.length && !args[index + 1].startsWith('-'));
      continue;
    }
    const inline = /^(?:--features=|-F=?|-f=?)(.+)$/u.exec(arg);
    if (inline) {
      requested.push(...splitFeatureList(inline[1]));
      continue;
    }
    const valued = /^--(profile|config)(?:=(.*))?$/u.exec(arg);
    if (valued || (!cargoTail && arg === '-c')) {
      let value = valued?.[2];
      if (value === undefined) {
        index += 1;
        value = args[index] ?? '';
      }
      if (valued?.[1] === 'profile') profile = value;
      else if (cargoTail) cargoConfigs.push(value);
      else configs.push(value);
      continue;
    }
    if (arg === '--debug' || (!cargoTail && /^-[A-Za-z]*d[A-Za-z]*$/u.test(arg))) debug = true;
  }
  return { requested, noDefaultFeatures, allFeatures, debug, profile, configs, cargoConfigs };
}

export function splitArgs(text) {
  return [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

function cargoConfigFiles(repoRoot) {
  const files = [];
  for (let dir = path.join(repoRoot, TAURI_DIR); ; dir = path.dirname(dir)) {
    files.push(path.join(dir, '.cargo', 'config.toml'), path.join(dir, '.cargo', 'config'));
    if (dir === repoRoot || dir === path.dirname(dir)) return files;
  }
}

function readExisting(files) {
  return files.filter((file) => existsSync(file)).map((file) => readFileSync(file, 'utf8'));
}

export function readReleaseSources(repoRoot = REPO_ROOT) {
  const tauriDir = path.join(repoRoot, TAURI_DIR);
  return {
    repoRoot,
    manifestText: readFileSync(path.join(tauriDir, 'Cargo.toml'), 'utf8'),
    workspaceManifestText: readFileSync(path.join(repoRoot, 'Cargo.toml'), 'utf8'),
    configTexts: readExisting(RELEASE_CONFIG_FILES.map((name) => path.join(tauriDir, name))),
    cargoConfigTexts: readExisting(cargoConfigFiles(repoRoot)),
  };
}

function overlayFeatures(value, repoRoot) {
  if (value.includes('${{')) return { features: [] };
  const file = path.resolve(repoRoot, PROJECT_DIR, value);
  const text = value.trimStart().startsWith('{')
    ? value
    : existsSync(file)
      ? readFileSync(file, 'utf8')
      : null;
  try {
    return { features: text === null ? [] : tauriConfigFeatures(text), unread: text === null };
  } catch {
    return { features: [], unread: true };
  }
}

export function findInspectorRoutes({
  repoRoot = REPO_ROOT,
  manifestText,
  workspaceManifestText = '',
  configTexts = [],
  cargoConfigTexts = [],
  env = {},
  args = [],
}) {
  const { requested, noDefaultFeatures, allFeatures, debug, profile, configs, cargoConfigs } =
    parseCargoFeatureArgs(args);
  const overlays = configs.map((value) => ({ value, ...overlayFeatures(value, repoRoot) }));
  const configured = [
    ...configTexts.flatMap(tauriConfigFeatures),
    ...overlays.flatMap(({ features }) => features),
  ];
  const routes = findDevtoolsActivation(manifestText, [...requested, ...configured], {
    noDefaultFeatures,
    allFeatures,
  }).map((feature) => `the ${feature} feature`);
  for (const text of [manifestText, workspaceManifestText]) {
    if (tauriDependencyFeatures(text).includes(FORBIDDEN_FEATURE)) {
      routes.push('the tauri dependency features list devtools');
    }
  }
  for (const { value, unread } of overlays) {
    if (unread) routes.push(`the --config overlay ${value}, which cannot be read as Tauri JSON`);
  }
  for (const value of cargoConfigs) {
    if (!value.includes('=')) routes.push(`the cargo --config file ${value}, which is not read`);
  }
  if (debug) routes.push('a --debug build, which always carries the inspector');
  if (profile !== RELEASE_PROFILE) routes.push(`the ${profile || '(empty)'} cargo profile`);
  routes.push(
    ...[workspaceManifestText, ...cargoConfigTexts, ...cargoConfigs].flatMap(debugAssertionRoutes),
    ...environmentRoutes(env),
  );
  return routes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const { requested, noDefaultFeatures } = parseCargoFeatureArgs(args);
  const routes = findInspectorRoutes({ ...readReleaseSources(), env: process.env, args });

  if (routes.length > 0) {
    console.error(
      `ERROR: the release build enables the webview inspector via ${routes.join(', ')}`,
    );
    console.error(`  requested: ${requested.join(', ') || '(none)'}`);
    console.error(`  default features: ${noDefaultFeatures ? 'disabled' : 'enabled'}`);
    process.exit(1);
  }
  console.log(
    `OK: devtools is not reachable from the resolved feature set (${requested.join(', ') || 'default'})`,
  );
}
