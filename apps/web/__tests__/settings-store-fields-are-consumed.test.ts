/**
 * PP-24 guard — every web setting is wired to something.
 *
 * The settings surface had accumulated controls and store members that looked
 * settable and changed nothing:
 *
 *   - `web-settings-store` declared `theme`, `chatFont`, `showTokenCount`,
 *     `streamingEnabled`, `responseStyle` and `notifications`. No screen read
 *     or wrote any of them; the real theme lives in `ThemeContext`, the real
 *     response style in `features/chat/stores/style-store`, and the real
 *     notification preferences are persisted server-side by
 *     `NotificationsSection`.
 *   - `GeneralSection` loaded and re-saved a `chatFont` key into the
 *     server-synced `general` namespace with no control and no stylesheet
 *     behind it.
 *   - `CustomModelsSettings` destructured `customModels` / `addCustomModel` /
 *     `updateCustomModel` / `removeCustomModel` out of the store through a
 *     cast, with `() => {}` defaults. None of those members existed, so every
 *     "Add Model" click was silently discarded — and the panel was not mounted
 *     anywhere either.
 *   - `CustomCommandsSettings` was the inverse: a working editor with no mount
 *     site, while `SlashCommandMenu` and `ChatComposerNew` already read the
 *     `customCommands` it writes. The slash menu offered a list the user had no
 *     way to fill.
 *
 * These checks are static (they read source) so they run in CI without a
 * browser, and they guard the CLASS rather than the six instances: a seventh
 * dead field, or a seventh no-op fallback, fails here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..');
const STORE_REL = 'shared/stores/web-settings-store.ts';

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', 'e2e']);

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

/** Member names declared on the store's `SettingsState` interface. */
function declaredStateMembers(source: string): string[] {
  const start = source.indexOf('interface SettingsState {');
  expect(start, 'SettingsState interface must exist in the settings store').toBeGreaterThan(-1);
  const body = source.slice(start + 'interface SettingsState {'.length);
  const end = body.indexOf('\n}');
  expect(end, 'SettingsState interface must be closed').toBeGreaterThan(-1);
  return [...body.slice(0, end).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1] as string);
}

/**
 * Store members actually touched by a file, through either shape the codebase
 * uses: a zustand selector (`useSettingsStore((s) => s.field)`), a destructure
 * (`const { a, b } = useSettingsStore()`), or `getState()`.
 */
function referencedStoreMembers(source: string): Set<string> {
  const found = new Set<string>();

  for (const match of source.matchAll(
    /useSettingsStore\(\s*\(?\s*(\w+)\s*\)?\s*(?::[^=]*)?=>\s*\1\.(\w+)/g,
  )) {
    found.add(match[2] as string);
  }

  for (const match of source.matchAll(/useSettingsStore\.getState\(\)\.(\w+)/g)) {
    found.add(match[1] as string);
  }

  for (const body of destructureBodies(source)) {
    for (const part of splitTopLevel(body)) {
      const name = part.trim().split(/[:=]/)[0]?.trim();
      if (name) found.add(name);
    }
  }

  return found;
}

/**
 * Bodies of every `const { ... } = useSettingsStore(` destructure.
 *
 * Scanned by counting braces backwards rather than with a `[^{}]*` character
 * class, because the pattern this file exists to catch — `addModel = () => {}`
 * — puts a brace pair INSIDE the destructure and would slip past a naive
 * regex.
 */
function destructureBodies(source: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(/\}\s*=\s*useSettingsStore\(/g)) {
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

const storeSource = readFileSync(resolve(ROOT, STORE_REL), 'utf8');
const sources = productionSources(ROOT).filter((p) => !p.endsWith(STORE_REL.replace(/\//g, '/')));

describe('PP-24 — web settings store has no members without a consumer', () => {
  const members = declaredStateMembers(storeSource);

  const consumers = new Map<string, string[]>();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('useSettingsStore')) continue;
    for (const member of referencedStoreMembers(text)) {
      const list = consumers.get(member) ?? [];
      list.push(file.slice(ROOT.length + 1));
      consumers.set(member, list);
    }
  }

  it('declares at least the shipped controls', () => {
    expect(members).toContain('chatTextSize');
    expect(members).toContain('codeBlockWrap');
    expect(members).toContain('customCommands');
  });

  it('every SettingsState member is read or written by production code', () => {
    const orphans = members.filter((member) => !consumers.has(member));
    expect(
      orphans,
      `These settings-store members have no production consumer. Wire them to a real ` +
        `control and a real reader, or delete them — a stored preference nothing reads ` +
        `is a control that lies. Orphans: ${orphans.join(', ')}`,
    ).toEqual([]);
  });
});

describe('PP-24 — no component papers over missing store members', () => {
  it('no production file destructures the settings store with fallback defaults', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('useSettingsStore')) continue;
      for (const body of destructureBodies(text)) {
        if (splitTopLevel(body).some((part) => part.includes('='))) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(
      offenders,
      `A '= () => {}' or '= []' default on a settings-store destructure hides the fact ` +
        `that the member does not exist, turning every write into a no-op. Files: ` +
        `${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('the settings store is not read through a type assertion', () => {
    const offenders = sources.filter((file) =>
      /useSettingsStore\(\)\s+as\s/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
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
