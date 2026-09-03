import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';

const ROOT = resolve(__dirname, '..');

interface PreferenceStore {
  file: string;
  /** The exported zustand hook production code calls. */
  hook: string;
  interfaces: string[];
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

function declaredMembers(source: string, interfaceName: string): string[] {
  const marker = `interface ${interfaceName} {`;
  const start = source.indexOf(marker);
  expect(start, `${interfaceName} interface must exist in the store`).toBeGreaterThan(-1);
  const body = source.slice(start + marker.length);
  const end = body.indexOf('\n}');
  expect(end, `${interfaceName} interface must be closed`).toBeGreaterThan(-1);
  return [...body.slice(0, end).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1] as string);
}

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

function rel(file: string): string {
  return file.slice(ROOT.length + 1);
}

function importName(file: string): string {
  const base = basename(file).replace(/\.tsx?$/, '');
  return base === 'index' ? basename(dirname(file)) : base;
}

function isRouteModule(file: string): boolean {
  const relative = rel(file);
  if (!relative.startsWith('app/') && !/^(proxy|instrumentation)\./.test(relative)) return false;
  return ROUTE_MODULES.has(basename(relative).replace(/\.tsx?$/, ''));
}

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

describe.each(PREFERENCE_STORES)('PP-24, $file has no member without a consumer', (store) => {
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
        `control and a real reader, or delete them, a stored preference nothing reads ` +
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
        `module imports them, so the member reads as "consumed" while the UI behind it ` +
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

describe('PP-24, the custom-command editor is reachable', () => {
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

    expect(composer).toContain(`replaceAll('${declared}'`);
    const editorCode = editor.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(editorCode).not.toMatch(/(?<!\{)\{input\}(?!\})/);
  });

  it('persists a chatFont only because something now renders it', () => {
    expect(generalSection).toContain('chatFont');

    const appearance = readFileSync(
      resolve(ROOT, 'shared/components/AppearancePreferences.tsx'),
      'utf8',
    );
    expect(appearance).toContain("setAttribute('data-chat-font'");

    const css = readFileSync(resolve(ROOT, 'app/globals.css'), 'utf8');
    expect(css).toContain("html[data-chat-font='serif'] .prose");
    expect(css).toContain("html[data-chat-font='sans'] .prose");
  });
});
