#!/usr/bin/env node
/* global console */
/**
 * Per-surface wiring invariants (SIX-32 step 1, guardrail cluster).
 *
 * These are the cheap structural checks the 2026-08-01 six-app sweep proved
 * were missing. Each one turns a defect class that shipped into a build
 * failure:
 *
 *   settings-section-registered  a settings section exists but no settings
 *                                modal can render it (dead control)
 *   route-has-navigation         a router route exists but nothing navigates
 *                                to it (unreachable screen)
 *   persisted-field-has-reader   a store persists a field to disk that no
 *                                consumer ever reads (fake preference)
 *   collection-has-reader        a Map/Set/storage key is written and never
 *                                read (silently discarded work)
 *   keybinding-tolerates-no-args a keybinding invokes a handler with a
 *                                required argument (silent no-op keypress)
 *
 * Every exception must be declared in
 * `scripts/config/surface-invariants-allowlist.json` with a reason and an
 * owning tracker id. Entries that stop matching fail as stale so the lists
 * only ratchet down.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  collectReachable,
  collectWorkspacePackageAliases,
  createResolver,
  isTestPath,
  listSourceFiles,
  stripComments,
  toRepoRelative,
} from './lib/module-graph.mjs';

const repoRoot = process.cwd();
export const ALLOWLIST_PATH = 'scripts/config/surface-invariants-allowlist.json';

const absolute = (relativePath) => path.join(repoRoot, relativePath);

function productFiles(relativeRoot) {
  return listSourceFiles(absolute(relativeRoot))
    .map((file) => toRepoRelative(repoRoot, file))
    .filter((file) => !isTestPath(file));
}

function readSource(relativePath) {
  return stripComments(fs.readFileSync(absolute(relativePath), 'utf8'));
}

// ---------------------------------------------------------------------------
// settings-section-registered
// ---------------------------------------------------------------------------

const SETTINGS_REGISTRIES = [
  {
    surface: 'desktop',
    sectionRoot: 'apps/desktop/src/features/settings',
    modalRoots: [
      'apps/desktop/src/features/settings/SettingsPanel.tsx',
      'apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx',
      'apps/desktop/src/features/settings/AutomationPermissionsModal.tsx',
    ],
    aliases: () => ({
      '@/*': absolute('apps/desktop/src'),
      '@components/*': absolute('apps/desktop/src/components'),
      '@stores/*': absolute('apps/desktop/src/stores'),
      '@hooks/*': absolute('apps/desktop/src/hooks'),
      '@utils/*': absolute('apps/desktop/src/utils'),
      '@styles/*': absolute('apps/desktop/src/styles'),
      '@lib/*': absolute('apps/desktop/src/lib'),
    }),
  },
];

export function checkSettingsSectionsRegistered(workspaceAliases) {
  const violations = [];

  for (const registry of SETTINGS_REGISTRIES) {
    const missingModals = registry.modalRoots.filter((modal) => !fs.existsSync(absolute(modal)));
    if (missingModals.length > 0) {
      violations.push({
        id: `${registry.surface}:missing-modal-root`,
        detail:
          `settings modal root(s) named by this check no longer exist: ${missingModals.join(', ')}. ` +
          'Update SETTINGS_REGISTRIES rather than letting the check pass vacuously.',
      });
      continue;
    }

    const resolve = createResolver({ ...registry.aliases(), ...workspaceAliases });
    const reachable = new Set(
      [...collectReachable(registry.modalRoots.map(absolute), resolve)].map((file) =>
        toRepoRelative(repoRoot, path.resolve(file)),
      ),
    );

    for (const section of productFiles(registry.sectionRoot)) {
      if (reachable.has(section)) continue;
      violations.push({
        id: `${registry.surface}:${section}`,
        detail: `${section} is not reachable from any registered settings modal (${registry.modalRoots.join(', ')})`,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// route-has-navigation
// ---------------------------------------------------------------------------

const ROUTE_SURFACES = [
  {
    surface: 'mobile',
    routeRoot: 'apps/mobile/app',
    literalRoots: ['apps/mobile'],
  },
];

/** Normalise a route or navigation target: drop query, hash and group segments. */
export function normalizeRoutePath(value) {
  const segments = value
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment));
  return `/${segments.join('/')}`;
}

export function routePathForFile(relativeRouteFile) {
  let route = relativeRouteFile.replace(/\.[cm]?[jt]sx?$/, '');
  if (route.endsWith('/index')) route = route.slice(0, -'/index'.length);
  else if (route === 'index') route = '';
  return normalizeRoutePath(`/${route}`);
}

/** Collect every route-shaped string and template prefix in a source file. */
export function collectRouteLiterals(source) {
  const literals = [];
  for (const match of source.matchAll(/['"](\/[^'"\n]*)['"]/g)) {
    literals.push({ value: normalizeRoutePath(match[1]), dynamic: false });
  }
  // A template such as `/settings/permissions/${kind}` navigates to the dynamic
  // child, so its static prefix counts as a call site for `[permission].tsx`.
  for (const match of source.matchAll(/`(\/[^`\n$]*)(\$\{)?/g)) {
    literals.push({ value: normalizeRoutePath(match[1]), dynamic: Boolean(match[2]) });
  }
  return literals;
}

export function analyzeRouteNavigation({ routes, literalsByFile, declaredScreens }) {
  const violations = [];

  for (const route of routes) {
    const isDynamic = route.route.includes('[');
    const prefix = isDynamic ? route.route.slice(0, route.route.indexOf('[')) : null;
    const prefixWithoutSlash = prefix ? prefix.replace(/\/$/, '') : null;

    let navigated = false;
    for (const [file, literals] of literalsByFile) {
      if (file === route.file) continue;
      for (const literal of literals) {
        if (literal.value === route.route) {
          navigated = true;
          break;
        }
        if (!isDynamic) continue;
        if (literal.dynamic && literal.value === prefixWithoutSlash) {
          navigated = true;
          break;
        }
        if (literal.value.startsWith(prefix) && literal.value !== prefixWithoutSlash) {
          navigated = true;
          break;
        }
      }
      if (navigated) break;
    }
    if (navigated) continue;

    const segments = route.routeRelative.replace(/\.[cm]?[jt]sx?$/, '').split('/');
    if (declaredScreens.has(segments.at(-1)) || declaredScreens.has(segments.slice(-2).join('/'))) {
      continue;
    }

    violations.push({
      id: `${route.surface}:${route.file}`,
      detail: `route ${route.route} (${route.file}) has no navigation call site and is not declared as a navigator Screen`,
    });
  }

  return violations;
}

export function checkRoutesHaveNavigation() {
  const violations = [];

  for (const surface of ROUTE_SURFACES) {
    const routeRootAbsolute = absolute(surface.routeRoot);
    const routes = [];
    for (const file of listSourceFiles(routeRootAbsolute)) {
      const routeRelative = path.relative(routeRootAbsolute, file).split(path.sep).join('/');
      if (isTestPath(routeRelative)) continue;
      const basename = path.basename(routeRelative);
      // `_layout` is structure, `+not-found` / `+html` are framework specials.
      if (basename.startsWith('_') || basename.startsWith('+')) continue;
      routes.push({
        surface: surface.surface,
        file: `${surface.routeRoot}/${routeRelative}`,
        routeRelative,
        route: routePathForFile(routeRelative),
      });
    }

    if (routes.length === 0) {
      violations.push({
        id: `${surface.surface}:no-routes-found`,
        detail: `no route files found under ${surface.routeRoot}; the check would pass vacuously`,
      });
      continue;
    }

    const literalsByFile = new Map();
    const declaredScreens = new Set();
    for (const literalRoot of surface.literalRoots) {
      for (const relative of productFiles(literalRoot)) {
        const source = readSource(relative);
        literalsByFile.set(relative, collectRouteLiterals(source));
        for (const match of source.matchAll(
          /<(?:Tabs|Stack|Drawer)\.Screen[^>]*\bname\s*=\s*["']([^"']+)["']/g,
        )) {
          declaredScreens.add(match[1]);
        }
      }
    }

    violations.push(...analyzeRouteNavigation({ routes, literalsByFile, declaredScreens }));
  }

  return violations;
}

// ---------------------------------------------------------------------------
// persisted-field-has-reader
// ---------------------------------------------------------------------------

const PERSISTED_STORE_ZONES = [
  {
    surface: 'desktop',
    storeRoot: 'apps/desktop/src/stores',
    readerRoots: ['apps/desktop/src', 'packages'],
  },
  {
    surface: 'mobile',
    storeRoot: 'apps/mobile/stores',
    readerRoots: ['apps/mobile', 'packages'],
  },
];

/**
 * Field names a store writes to disk, taken from every `partialize` body.
 *
 * A persisted field is any `name: state.…` (or `base.…`) property inside the
 * body. Matching on the value expression rather than on brace depth means
 * `windowPreferences: { theme: state.windowPreferences.theme }` contributes the
 * leaf `theme` — the granularity a user actually experiences — and no depth
 * heuristic can drift when a store wraps its return in a branch.
 */
export function extractPersistedKeys(source) {
  const keys = new Set();
  let cursor = source.indexOf('partialize');

  while (cursor !== -1) {
    const arrow = source.indexOf('=>', cursor);
    const open = arrow === -1 ? -1 : findBodyStart(source, arrow);
    if (open === -1) break;

    const openChar = source[open];
    const closeChar = openChar === '{' ? '}' : ')';
    let depth = 0;
    let end = open;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === openChar) depth += 1;
      else if (source[index] === closeChar) {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    const body = source.slice(open + 1, end);
    // Walk property keys without consuming their values, so the leaves of a
    // nested wrapper are still visited. A field is persisted when its value
    // expression derives from store state; a value that opens a nested object
    // or array is a wrapper, and its own properties are matched separately.
    for (const match of body.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
      const valueStart = match.index + match[0].length;
      const value = body.slice(valueStart).split('\n')[0].split(',')[0].trim();
      if (value.startsWith('{') || value.startsWith('[')) continue;
      if (!/\b(?:state|base|get\(\))\s*\./.test(value)) continue;
      keys.add(match[1]);
    }

    cursor = source.indexOf('partialize', cursor + 1);
  }

  return keys;
}

function findBodyStart(source, arrowIndex) {
  for (let index = arrowIndex + 2; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) continue;
    return character === '{' || character === '(' ? index : -1;
  }
  return -1;
}

export function checkPersistedFieldsHaveReaders() {
  const violations = [];

  for (const zone of PERSISTED_STORE_ZONES) {
    const persistedKeys = new Map();
    for (const relative of productFiles(zone.storeRoot)) {
      for (const key of extractPersistedKeys(readSource(relative))) {
        if (!persistedKeys.has(key)) persistedKeys.set(key, relative);
      }
    }

    if (persistedKeys.size === 0) {
      violations.push({
        id: `${zone.surface}:no-persisted-keys-found`,
        detail: `no partialize keys found under ${zone.storeRoot}; the check would pass vacuously`,
      });
      continue;
    }

    const storePrefix = `${zone.storeRoot}/`;
    const readKeys = new Set();
    for (const readerRoot of zone.readerRoots) {
      for (const relative of productFiles(readerRoot)) {
        if (relative.startsWith(storePrefix)) continue;
        const source = readSource(relative);
        for (const key of persistedKeys.keys()) {
          if (readKeys.has(key)) continue;
          if (new RegExp(`\\b${key}\\b`).test(source)) readKeys.add(key);
        }
      }
    }

    for (const [key, declaredIn] of [...persistedKeys].sort(([a], [b]) => a.localeCompare(b))) {
      if (readKeys.has(key)) continue;
      violations.push({
        id: `${zone.surface}:${key}`,
        detail: `${declaredIn} persists "${key}" to disk but nothing outside ${zone.storeRoot} reads it`,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// collection-has-reader
// ---------------------------------------------------------------------------

const COLLECTION_ROOTS = [
  'apps/desktop/src',
  'apps/web/features',
  'apps/web/lib',
  'apps/web/shared',
  'apps/mobile/src',
  'apps/mobile/lib',
  'apps/extension/src',
  'apps/extension-vscode/src',
];

const COLLECTION_DECLARATION =
  /(?:\b(?:const|let|var)\s+|\b(?:private|public|protected)\s+(?:readonly\s+)?|\breadonly\s+)([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+?)?\s*=\s*new\s+(Map|Set|WeakMap|WeakSet)\b/g;

/**
 * A collection is write-only when every mention of its name is either a
 * declaration or a mutating call. Counting occurrences rather than pattern
 * matching each read form keeps `for (const x of this.listeners)` and
 * `{...state, items: next}` from being misreported.
 */
export function findWriteOnlyCollections(relativePath, source) {
  const violations = [];
  const seen = new Set();
  COLLECTION_DECLARATION.lastIndex = 0;

  for (const match of source.matchAll(COLLECTION_DECLARATION)) {
    const name = match[1];
    const kind = match[2];
    if (seen.has(name)) continue;
    seen.add(name);

    const escaped = name.replace(/\$/g, '\\$');
    const occurrences = (source.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? []).length;
    const declarations = (
      source.match(
        new RegExp(
          `${escaped}\\s*(?::\\s*[^=;\\n]+?)?\\s*=\\s*new\\s+(?:Map|Set|WeakMap|WeakSet)\\b`,
          'g',
        ),
      ) ?? []
    ).length;
    const writes = (
      source.match(new RegExp(`\\b${escaped}\\s*\\.\\s*(?:set|add|delete|clear)\\s*\\(`, 'g')) ?? []
    ).length;

    if (writes > 0 && occurrences - writes - declarations <= 0) {
      violations.push({
        id: `${relativePath}:${name}`,
        detail: `${relativePath} writes ${kind} "${name}" ${writes} time(s) and never reads it`,
      });
    }
  }

  return violations;
}

export function findWriteOnlyStorageKeys(relativePath, source, readIndex) {
  const violations = [];
  const written = new Set();
  for (const match of source.matchAll(
    /\b(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*['"]([^'"]+)['"]/g,
  )) {
    written.add(match[1]);
  }

  for (const key of written) {
    if (readIndex.has(key)) continue;
    violations.push({
      id: `${relativePath}:${key}`,
      detail: `${relativePath} writes web-storage key "${key}" that no module in the repository reads back`,
    });
  }

  return violations;
}

export function checkCollectionsHaveReaders() {
  const sources = new Map();
  for (const root of COLLECTION_ROOTS) {
    for (const relative of productFiles(root)) sources.set(relative, readSource(relative));
  }

  // Storage keys are read across module boundaries, so index reads repo-wide first.
  const storageReadIndex = new Set();
  for (const source of sources.values()) {
    for (const match of source.matchAll(
      /\b(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|removeItem)\s*\(\s*['"]([^'"]+)['"]/g,
    )) {
      storageReadIndex.add(match[1]);
    }
  }

  const violations = [];
  for (const [relative, source] of sources) {
    violations.push(...findWriteOnlyCollections(relative, source));
    violations.push(...findWriteOnlyStorageKeys(relative, source, storageReadIndex));
  }
  return violations;
}

// ---------------------------------------------------------------------------
// keybinding-tolerates-no-args
// ---------------------------------------------------------------------------

const KEYBINDING_SURFACES = [
  {
    surface: 'vscode',
    manifest: 'apps/extension-vscode/package.json',
    sourceRoot: 'apps/extension-vscode/src',
  },
];

const COMMAND_REGISTRATION =
  /\b(?:register|(?:vscode\.)?commands\.registerCommand)\s*\(\s*['"]([A-Za-z0-9_.-]+)['"]\s*,\s*/g;

function readBalancedParens(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return null;
}

export function splitParameters(text) {
  const parameters = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if ('([{<'.includes(character)) depth += 1;
    else if (')]}>'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      if (current.trim().length > 0) parameters.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim().length > 0) parameters.push(current.trim());
  return parameters;
}

/** Number of leading parameters a caller must supply. */
export function requiredArity(parameterText) {
  let count = 0;
  for (const parameter of splitParameters(parameterText)) {
    const name = parameter.split(':')[0].trim();
    if (parameter.startsWith('...') || name.endsWith('?') || parameter.includes('=')) break;
    count += 1;
  }
  return count;
}

/** Map command id -> { arity, shape } for every registration in a source tree. */
export function collectCommandArities(sources) {
  const arities = new Map();

  for (const [relative, source] of sources) {
    COMMAND_REGISTRATION.lastIndex = 0;
    for (const match of source.matchAll(COMMAND_REGISTRATION)) {
      const id = match[1];
      const cursor = match.index + match[0].length;
      const rest = source.slice(cursor);
      let entry = { arity: null, shape: 'unrecognized-handler', file: relative };

      let head = rest.match(/^(?:async\s*)?\(/);
      if (head) {
        const inner = readBalancedParens(source, cursor + head[0].length - 1);
        entry = {
          arity: inner === null ? null : requiredArity(inner),
          shape: 'arrow',
          file: relative,
        };
      } else if ((head = rest.match(/^(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/))) {
        entry = { arity: 1, shape: 'single-parameter-arrow', file: relative };
      } else if ((head = rest.match(/^(?:async\s+)?function\s*\*?\s*[A-Za-z_$]*\s*\(/))) {
        const inner = readBalancedParens(source, cursor + head[0].length - 1);
        entry = {
          arity: inner === null ? null : requiredArity(inner),
          shape: 'function',
          file: relative,
        };
      }

      arities.set(id, entry);
    }
  }

  return arities;
}

export function analyzeKeybindings({ surface, keybindings, arities }) {
  const violations = [];

  for (const keybinding of keybindings) {
    if (keybinding.args !== undefined) continue;
    const entry = arities.get(keybinding.command);

    if (!entry) {
      violations.push({
        id: `${surface}:${keybinding.command}`,
        detail: `keybinding "${keybinding.key ?? keybinding.mac}" invokes ${keybinding.command}, which has no command registration in the extension source`,
      });
      continue;
    }
    if (entry.arity === null) {
      violations.push({
        id: `${surface}:${keybinding.command}`,
        detail: `keybinding "${keybinding.key ?? keybinding.mac}" invokes ${keybinding.command}, whose handler shape (${entry.shape}, ${entry.file}) could not be proved to tolerate a zero-argument call`,
      });
      continue;
    }
    if (entry.arity > 0) {
      violations.push({
        id: `${surface}:${keybinding.command}`,
        detail: `keybinding "${keybinding.key ?? keybinding.mac}" passes no args but ${keybinding.command} (${entry.file}) requires ${entry.arity} argument(s); the keypress is a silent no-op`,
      });
    }
  }

  return violations;
}

export function checkKeybindingsTolerateNoArgs() {
  const violations = [];

  for (const surface of KEYBINDING_SURFACES) {
    const manifest = JSON.parse(fs.readFileSync(absolute(surface.manifest), 'utf8'));
    const keybindings = manifest?.contributes?.keybindings ?? [];
    if (keybindings.length === 0) {
      violations.push({
        id: `${surface.surface}:no-keybindings-found`,
        detail: `${surface.manifest} declares no keybindings; the check would pass vacuously`,
      });
      continue;
    }

    const sources = new Map();
    for (const relative of productFiles(surface.sourceRoot))
      sources.set(relative, readSource(relative));

    violations.push(
      ...analyzeKeybindings({
        surface: surface.surface,
        keybindings,
        arities: collectCommandArities(sources),
      }),
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export function readAllowlist(rawJson) {
  const allowlist = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  if (!allowlist || allowlist.schemaVersion !== 1 || typeof allowlist.invariants !== 'object') {
    throw new Error(`${ALLOWLIST_PATH} must have schemaVersion 1 and an invariants object`);
  }

  for (const [invariantId, entries] of Object.entries(allowlist.invariants)) {
    if (!Array.isArray(entries)) {
      throw new Error(`${ALLOWLIST_PATH}: invariants.${invariantId} must be an array`);
    }
    const seen = new Set();
    for (const [index, entry] of entries.entries()) {
      if (typeof entry?.id !== 'string' || entry.id.length === 0) {
        throw new Error(`${ALLOWLIST_PATH}: ${invariantId}[${index}] needs an id`);
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
        throw new Error(
          `${ALLOWLIST_PATH}: ${invariantId}[${index}] needs a reason of at least 20 characters`,
        );
      }
      if (typeof entry.trackedBy !== 'string' || entry.trackedBy.trim().length === 0) {
        throw new Error(`${ALLOWLIST_PATH}: ${invariantId}[${index}] needs a trackedBy id`);
      }
      if (seen.has(entry.id)) {
        throw new Error(`${ALLOWLIST_PATH}: ${invariantId} lists ${entry.id} twice`);
      }
      seen.add(entry.id);
    }
  }

  return allowlist;
}

export function partitionViolations(violations, allowedEntries) {
  const allowed = new Set((allowedEntries ?? []).map((entry) => entry.id));
  const observed = new Set(violations.map((violation) => violation.id));
  return {
    undeclared: violations.filter((violation) => !allowed.has(violation.id)),
    stale: [...allowed].filter((id) => !observed.has(id)).sort(),
  };
}

export const INVARIANTS = [
  {
    id: 'settings-section-registered',
    label: 'Every settings section is registered in a settings modal',
    run: (context) => checkSettingsSectionsRegistered(context.workspaceAliases),
  },
  {
    id: 'route-has-navigation',
    label: 'Every registered route has a navigation call site',
    run: () => checkRoutesHaveNavigation(),
  },
  {
    id: 'persisted-field-has-reader',
    label: 'Every persisted store field has a reader outside its store',
    run: () => checkPersistedFieldsHaveReaders(),
  },
  {
    id: 'collection-has-reader',
    label: 'No Map, Set or web-storage key is write-only',
    run: () => checkCollectionsHaveReaders(),
  },
  {
    id: 'keybinding-tolerates-no-args',
    label: 'Every keybound command tolerates a zero-argument invocation',
    run: () => checkKeybindingsTolerateNoArgs(),
  },
];

export function main(argv = process.argv.slice(2)) {
  const emitBaseline = argv.includes('--emit-baseline');
  const allowlist = readAllowlist(fs.readFileSync(absolute(ALLOWLIST_PATH), 'utf8'));
  const context = { workspaceAliases: collectWorkspacePackageAliases(repoRoot) };

  const failures = [];
  const baseline = { schemaVersion: 1, invariants: {} };

  for (const invariant of INVARIANTS) {
    const violations = invariant.run(context);
    const declared = allowlist.invariants[invariant.id];

    if (emitBaseline) {
      const existing = new Map((declared ?? []).map((entry) => [entry.id, entry]));
      baseline.invariants[invariant.id] = violations.map((violation) => ({
        id: violation.id,
        reason: existing.get(violation.id)?.reason ?? 'TODO: declare why this is acceptable',
        trackedBy: existing.get(violation.id)?.trackedBy ?? 'SIX-32',
      }));
      continue;
    }

    if (declared === undefined) {
      failures.push(`${ALLOWLIST_PATH} has no entry for invariant "${invariant.id}"`);
      continue;
    }

    const { undeclared, stale } = partitionViolations(violations, declared);
    console.log(
      `  ${invariant.id}: ${violations.length} violation(s), ${declared.length} declared, ${undeclared.length} undeclared`,
    );

    if (undeclared.length > 0) {
      failures.push(
        `${invariant.label} — ${undeclared.length} undeclared violation(s):\n` +
          undeclared.map((violation) => `    - ${violation.detail}`).join('\n'),
      );
    }
    if (stale.length > 0) {
      failures.push(
        `${invariant.label} — ${stale.length} stale allowlist entr(ies); remove them from ${ALLOWLIST_PATH}:\n` +
          stale.map((id) => `    - ${id}`).join('\n'),
      );
    }
  }

  if (emitBaseline) {
    fs.writeFileSync(absolute(ALLOWLIST_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote baseline to ${ALLOWLIST_PATH}`);
    return 0;
  }

  if (failures.length > 0) {
    console.error('Surface invariant check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    return 1;
  }

  console.log('Surface invariant check passed.');
  return 0;
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) process.exit(main());
