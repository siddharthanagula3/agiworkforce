#!/usr/bin/env node
/* global console */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';

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
const DEBUG_ASSERTIONS_FLAG = /debug[-_]assertions(?!\s*=\s*(?:off|no|n|false)\b)/iu;

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function tomlTable(value, name) {
  if (value === undefined) return {};
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    throw new Error(`${name} must be a TOML table`);
  }
  return value;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a TOML string array`);
  }
  return value;
}

function tauriDependencies(manifestText, workspaceManifestText = '') {
  const manifest = parseToml(manifestText);
  const workspace = tomlTable(manifest.workspace, 'workspace');
  const inheritedWorkspace = tomlTable(parseToml(workspaceManifestText).workspace, 'workspace');
  const workspaceDependencies = {
    ...tomlTable(inheritedWorkspace.dependencies, 'workspace.dependencies'),
    ...tomlTable(workspace.dependencies, 'workspace.dependencies'),
  };
  const targets = tomlTable(manifest.target, 'target');
  const tables = [
    manifest.dependencies,
    workspace.dependencies,
    ...Object.entries(targets).map(
      ([name, target]) => tomlTable(target, `target.${name}`).dependencies,
    ),
  ];
  return tables.flatMap((value) =>
    Object.entries(tomlTable(value, 'dependencies')).flatMap(([name, dependency]) => {
      const entry =
        typeof dependency === 'string' ? {} : tomlTable(dependency, `dependencies.${name}`);
      const inherited =
        entry.workspace === true
          ? tomlTable(workspaceDependencies[name], `workspace.dependencies.${name}`)
          : {};
      const packageName = entry.package ?? inherited.package ?? name;
      if (typeof packageName !== 'string')
        throw new Error('Dependency package names must be strings');
      if (packageName !== 'tauri') return [];
      return [
        {
          name,
          features: [
            ...stringArray(inherited.features ?? [], `workspace.dependencies.${name}.features`),
            ...stringArray(entry.features ?? [], `dependencies.${name}.features`),
          ],
        },
      ];
    }),
  );
}

function tomlEntries(table, prefix = []) {
  return Object.entries(table).flatMap(([key, value]) => {
    const parts = [...prefix, key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      return tomlEntries(value, parts);
    }
    return [{ parts, value }];
  });
}

function tomlPath(parts) {
  return parts
    .map((part) => (/^[A-Za-z0-9_-]+$/u.test(part) ? part : JSON.stringify(part)))
    .join('.');
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
  const features = tomlTable(parseToml(manifestText).features, 'features');
  return new Map(
    Object.entries(features).map(([name, members]) => [
      name,
      stringArray(members, `features.${name}`).map(normalizeFeature),
    ]),
  );
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
  { noDefaultFeatures, allFeatures = false, tauriAliases = [] },
) {
  const table = parseFeatureTable(manifestText);
  const roots = [...requestedFeatures];
  if (!noDefaultFeatures && table.has(DEFAULT_FEATURE)) roots.push(DEFAULT_FEATURE);
  if (allFeatures) roots.push(...table.keys());

  const closure = resolveFeatureClosure(table, roots);
  const dependencies = [
    ...tauriDependencies(manifestText).map(({ name }) => name),
    ...tauriAliases,
  ];
  return [
    ...(closure.has(FORBIDDEN_FEATURE) ? [FORBIDDEN_FEATURE] : []),
    ...(closure.has(FORBIDDEN_DEPENDENCY_FEATURE) ||
    dependencies.some((name) => closure.has(`${name}/${FORBIDDEN_FEATURE}`))
      ? [FORBIDDEN_DEPENDENCY_FEATURE]
      : []),
  ];
}

export function tauriDependencyFeatures(manifestText, workspaceManifestText = '') {
  return tauriDependencies(manifestText, workspaceManifestText).flatMap(({ features }) => features);
}

export function tauriConfigFeatures(configText) {
  const features = JSON.parse(configText)?.build?.features;
  return Array.isArray(features)
    ? features.map((feature) => normalizeFeature(String(feature)))
    : [];
}

export function debugAssertionRoutes(tomlText) {
  return tomlEntries(parseToml(tomlText)).flatMap(({ parts, value }) => {
    const name = tomlPath(parts);
    if (parts[0] === 'profile' && parts[1] === 'release' && parts.at(-1) === 'debug-assertions') {
      if (typeof value !== 'boolean') throw new Error(`${name} must be a TOML boolean`);
      if (value) return [`${name} = true`];
    }
    if (parts.at(-1) === 'rustflags') {
      const flags = typeof value === 'string' ? value : stringArray(value, name).join(' ');
      if (DEBUG_ASSERTIONS_FLAG.test(flags)) return [`debug assertions in ${name}`];
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
    tauriAliases: tauriDependencies(workspaceManifestText).map(({ name }) => name),
  }).map((feature) => `the ${feature} feature`);
  for (const features of [
    tauriDependencyFeatures(manifestText, workspaceManifestText),
    tauriDependencyFeatures(workspaceManifestText),
  ]) {
    if (features.includes(FORBIDDEN_FEATURE)) {
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
    ...[
      workspaceManifestText,
      ...cargoConfigTexts,
      ...cargoConfigs.filter((value) => value.includes('=')),
    ].flatMap(debugAssertionRoutes),
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
