/**
 * PP-24 guard — a registered preference store may not hold a member that
 * nothing consumes.
 *
 * WHAT THIS COVERS, EXACTLY. Two stores, listed in `PREFERENCE_STORES` below:
 * `shared/stores/web-settings-store.ts` (`useSettingsStore`) and
 * `shared/stores/layout-store.ts` (`useUIStore`). It is NOT a repo-wide rule:
 * ten other zustand stores under `shared/stores/` persist state and are not
 * checked here. Adding a preference store means adding it to the registry.
 *
 * WHAT IT PROVED WORTH CATCHING:
 *   - `web-settings-store` declared `theme`, `chatFont`, `showTokenCount`,
 *     `streamingEnabled`, `responseStyle` and `notifications`. No screen read
 *     or wrote any of them; the real theme lives in `ThemeContext`, the real
 *     response style in `features/chat/stores/style-store`, and the real
 *     notification preferences are persisted server-side by
 *     `NotificationsSection`.
 *   - `layout-store` was the same defect at four times the size: ~20 members
 *     (`sidebarOpen`, `modals`, `theme`, `chatInterface`, `dashboard`,
 *     `notifications` and their setters) plus six selector hooks, with
 *     `WebChatPage` consuming only `sidebarCollapsed`/`setSidebarCollapsed`.
 *   - `CustomModelsSettings` destructured `customModels` / `addCustomModel` /
 *     `updateCustomModel` / `removeCustomModel` out of the store through a
 *     cast, with `() => {}` defaults. None of those members existed, so every
 *     "Add Model" click was silently discarded.
 *   - `CustomCommandsSettings` was the inverse: a working editor with no mount
 *     site, while `SlashCommandMenu` and `ChatComposerNew` already read the
 *     `customCommands` it writes.
 *
 * WHAT IT DOES NOT PROVE. These checks are static — they read source, so they
 * run in CI without a browser, and they cannot execute the app. The consumer
 * scan is a reference scan plus a ONE-HOP import check: a member counts as
 * consumed when some production file references it AND that file is either a
 * Next.js route module under `app/` or is imported by name somewhere. That is
 * enough to catch the `CustomCommandsSettings` shape (a component no file
 * imported), which a plain reference scan would have marked "consumed". It is
 * not a reachability proof: a consumer that is imported only by another
 * unreachable module still passes, and a component that is imported but never
 * rendered still passes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';

const ROOT = resolve(__dirname, '..');

interface PreferenceStore {
  /** Path relative to `apps/web`. */
  file: string;
  /** The exported zustand hook production code calls. */
  hook: string;
  /** Interfaces whose members must each have a consumer. */
  interfaces: string[];
  /**
   * Members invoked through a name table rather than a call site, so no regex
   * can see them. Each entry must be justified by `assertDynamicVerbIsReal`.
   */
  dynamicVerbs?: string[];
}

const PREFERENCE_STORES: PreferenceStore[] = [
  {
    file: 'shared/stores/web-settings-store.ts',
    hook: 'useSettingsStore',
    interfaces: ['SettingsState'],
  },
  {
    file: 'shared/stores/layout-store.ts',
    hook: 'useUIStore',
    interfaces: ['UIState', 'UIActions'],
    dynamicVerbs: ['reset'],
  },
];

const AUTH_STORE_REL = 'shared/stores/authentication-store.ts';

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', 'e2e']);

/** Next.js App Router files the framework mounts; nothing imports them. */
const ROUTE_MODULES = new Set([
  'page',
  'layout',
  'route',
  'template',
  'loading',
  'error',
  'global-error',
  'not-found',
  'default',
  'proxy',
  'sitemap',
  'robots',
  'manifest',
  'opengraph-image',
  'instrumentation',
]);

function isProductionSource(path: string): boolean {
  if (!/\.tsx?$/.test(path)) return false;
  if (/\.(test|spec)\.tsx?$/.test(path)) return false;
  if (/[\\/]__tests__[\\/]/.test(path)) return false;
  if (/[\\/]__mocks__[\\/]/.test(path)) return false;
  return true;
}

/** Every production .ts/.tsx file in the web app, absolute paths. */
function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.') continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) productionSources(full, out);
    else if (isProductionSource(full)) out.push(full);
  }
  return out;
}

/** Member names declared on one of the store's interfaces. */
function declaredMembers(source: string, interfaceName: string): string[] {
  const marker = `interface ${interfaceName} {`;
  const start = source.indexOf(marker);
  expect(start, `${interfaceName} interface must exist in the store`).toBeGreaterThan(-1);
  const body = source.slice(start + marker.length);
  const end = body.indexOf('\n}');
  expect(end, `${interfaceName} interface must be closed`).toBeGreaterThan(-1);
  return [...body.slice(0, end).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1] as string);
}

/**
 * Store members actually touched by a file, through either shape the codebase
 * uses: a zustand selector (`useX((s) => s.field)`), a destructure
 * (`const { a, b } = useX()`), or `getState()`.
 */
function referencedStoreMembers(source: string, hook: string): Set<string> {
  const found = new Set<string>();

  for (const match of source.matchAll(
    new RegExp(`${hook}\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*(?::[^=]*)?=>\\s*\\1\\.(\\w+)`, 'g'),
  )) {
    found.add(match[2] as string);
  }

  for (const match of source.matchAll(new RegExp(`${hook}\\.getState\\(\\)\\.(\\w+)`, 'g'))) {
    found.add(match[1] as string);
  }

  for (const body of destructureBodies(source, hook)) {
    for (const part of splitTopLevel(body)) {
      const name = part.trim().split(/[:=]/)[0]?.trim();
      if (name) found.add(name);
    }
  }

  return found;
}

/**
 * Bodies of every `const { ... } = useX(` destructure.
 *
 * Scanned by counting braces backwards rather than with a `[^{}]*` character
 * class, because the pattern this file exists to catch — `addModel = () => {}`
 * — puts a brace pair INSIDE the destructure and would slip past a naive
 * regex.
 */
function destructureBodies(source: string, hook: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(new RegExp(`\\}\\s*=\\s*${hook}\\(`, 'g'))) {
    const closeAt = match.index as number;
    let depth = 0;
    for (let i = closeAt; i >= 0; i--) {
      const ch = source[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) {
          bodies.push(source.slice(i + 1, closeAt));
          break;
        }
      }
    }
  }
  return bodies;
}

/** Split a destructure body on commas that are not nested in braces/parens. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const sources = productionSources(ROOT);
const sourceText = new Map<string, string>(
  sources.map((file) => [file, readFileSync(file, 'utf8')]),
);

/** `features/settings/components/CustomCommandsSettings.tsx` -> repo-relative. */
function rel(file: string): string {
  return file.slice(ROOT.length + 1);
}

/** The specifier tail another file would import this module by. */
function importName(file: string): string {
  const base = basename(file).replace(/\.tsx?$/, '');
  return base === 'index' ? basename(dirname(file)) : base;
}

/**
 * A Next.js route module, mounted by the framework rather than by an import.
 * Anything directly under `app/` whose basename is a reserved route filename.
 */
function isRouteModule(file: string): boolean {
  const relative = rel(file);
  if (!relative.startsWith('app/') && !/^(proxy|instrumentation)\./.test(relative)) return false;
  return ROUTE_MODULES.has(basename(relative).replace(/\.tsx?$/, ''));
}

/**
 * True when some other production file names this module in an import or a
 * dynamic `import(...)`. One hop only — see the header for what that does and
 * does not prove.
 */
function isImportedByAnotherModule(file: string): boolean {
  const name = importName(file);
  const pattern = new RegExp(`(?:from|import\\()\\s*['"][^'"]*\\/${name}['"]`);
  for (const [other, text] of sourceText) {
    if (other === file) continue;
    if (pattern.test(text)) return true;
  }
  return false;
}

function isMountableConsumer(file: string): boolean {
  return isRouteModule(file) || isImportedByAnotherModule(file);
}

/**
 * A `dynamicVerbs` entry is an escape hatch, so verify the escape rather than
 * trusting it: the sign-out cleanup must really list the verb AND really list
 * the store module.
 */
function assertDynamicVerbIsReal(store: PreferenceStore, verb: string): void {
  const auth = readFileSync(resolve(ROOT, AUTH_STORE_REL), 'utf8');
  const verbTable = /const STORE_RESET_METHODS = \[([^\]]*)\]/.exec(auth)?.[1] ?? '';
  expect(
    verbTable,
    `${AUTH_STORE_REL} must invoke '${verb}' for the exemption in ${store.file} to hold`,
  ).toContain(`'${verb}'`);

  const moduleName = basename(store.file).replace(/\.tsx?$/, '');
  expect(auth, `${AUTH_STORE_REL} must list ${moduleName} in USER_SCOPED_STORE_MODULES`).toContain(
    `import('./${moduleName}')`,
  );
}

describe.each(PREFERENCE_STORES)('PP-24 — $file has no member without a consumer', (store) => {
  const storeSource = readFileSync(resolve(ROOT, store.file), 'utf8');
  const storeAbsolute = resolve(ROOT, store.file);
  const members = store.interfaces.flatMap((name) => declaredMembers(storeSource, name));

  const consumers = new Map<string, string[]>();
  for (const [file, text] of sourceText) {
    if (file === storeAbsolute) continue;
    if (!text.includes(store.hook)) continue;
    for (const member of referencedStoreMembers(text, store.hook)) {
      const list = consumers.get(member) ?? [];
      list.push(rel(file));
      consumers.set(member, list);
    }
  }

  it('declares members at all', () => {
    expect(members.length).toBeGreaterThan(0);
  });

  it('every declared member is read or written by production code', () => {
    const exempt = new Set(store.dynamicVerbs ?? []);
    const orphans = members.filter((member) => !consumers.has(member) && !exempt.has(member));
    expect(
      orphans,
      `These ${store.hook} members have no production consumer. Wire them to a real ` +
        `control and a real reader, or delete them — a stored preference nothing reads ` +
        `is a control that lies. Orphans: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every consuming file is a route module or is imported somewhere', () => {
    const stranded = new Set<string>();
    for (const files of consumers.values()) {
      for (const relative of files) {
        if (!isMountableConsumer(join(ROOT, relative))) stranded.add(relative);
      }
    }
    expect(
      [...stranded],
      `These files are the ONLY thing consuming a ${store.hook} member, and no other ` +
        `module imports them — so the member reads as "consumed" while the UI behind it ` +
        `is unreachable. This is how CustomCommandsSettings hid: a complete editor with ` +
        `no mount site. Mount them or delete them.`,
    ).toEqual([]);
  });

  it('no production file destructures the store with fallback defaults', () => {
    const offenders: string[] = [];
    for (const [file, text] of sourceText) {
      if (file === storeAbsolute) continue;
      if (!text.includes(store.hook)) continue;
      for (const body of destructureBodies(text, store.hook)) {
        if (splitTopLevel(body).some((part) => part.includes('='))) offenders.push(rel(file));
      }
    }
    expect(
      offenders,
      `A '= () => {}' or '= []' default on a ${store.hook} destructure hides the fact ` +
        `that the member does not exist, turning every write into a no-op. Files: ` +
        `${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the store is not read through a type assertion', () => {
    const pattern = new RegExp(`${store.hook}\\(\\)\\s+as\\s`);
    const offenders = [...sourceText]
      .filter(([file, text]) => file !== storeAbsolute && pattern.test(text))
      .map(([file]) => rel(file));
    expect(offenders).toEqual([]);
  });

  it('each dynamic-verb exemption is backed by a real caller', () => {
    for (const verb of store.dynamicVerbs ?? []) assertDynamicVerbIsReal(store, verb);
  });
});

describe('PP-24 — the custom-command editor is reachable', () => {
  const generalSection = readFileSync(
    resolve(ROOT, 'features/settings/sections/GeneralSection.tsx'),
    'utf8',
  );

  it('GeneralSection mounts CustomCommandsSettings', () => {
    expect(generalSection).toMatch(/import\s*\{\s*CustomCommandsSettings\s*\}/);
    expect(generalSection).toContain('<CustomCommandsSettings />');
  });

  it('GeneralSection is rendered by the settings modal', () => {
    const modal = readFileSync(
      resolve(ROOT, 'features/settings/components/WebSettingsModal.tsx'),
      'utf8',
    );
    expect(modal).toContain('<GeneralSection />');
  });

  it('the composer still consumes the commands that editor writes', () => {
    const menu = readFileSync(
      resolve(ROOT, 'features/chat/components/Composer/SlashCommandMenu.tsx'),
      'utf8',
    );
    expect(menu).toContain('useSettingsStore');
    expect(menu).toContain('customCommands');
  });

  it('the editor documents the placeholder the composer actually substitutes', () => {
    const editor = readFileSync(
      resolve(ROOT, 'features/settings/components/CustomCommandsSettings.tsx'),
      'utf8',
    );
    const composer = readFileSync(
      resolve(ROOT, 'features/chat/components/Composer/ChatComposerNew.tsx'),
      'utf8',
    );

    const declared = /const INPUT_TOKEN = '([^']+)';/.exec(editor)?.[1];
    expect(declared, 'CustomCommandsSettings must declare INPUT_TOKEN').toBeTruthy();

    // The composer replaces exactly one literal; the editor must teach that
    // literal and no other, or a template written from these instructions
    // reaches the model with the placeholder still in it.
    expect(composer).toContain(`replaceAll('${declared}'`);
    // No single-brace `{input}` may survive anywhere in the editor's code —
    // that is the token the composer does NOT substitute.
    const editorCode = editor.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(editorCode).not.toMatch(/(?<!\{)\{input\}(?!\})/);
  });

  it('GeneralSection no longer persists a chatFont nothing renders', () => {
    const withoutComments = generalSection.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toContain('chatFont');
  });
});
