import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { agiChatCssVars } from '@agiworkforce/design-tokens';
import { describe, expect, it } from 'vitest';

import { LANGUAGE_LOADERS, THEME_LOADERS } from './shikiHighlighter';

type ThemeName = keyof typeof THEME_LOADERS;

interface ThemeRule {
  readonly scope?: string | readonly string[];
  readonly settings?: { readonly foreground?: string };
}

interface DrawnColour {
  readonly scopes: readonly string[];
  readonly colour: string;
}

const WCAG_AA_NORMAL = 4.5;
const CODE_GROUND_TOKEN = '--chat-code-bg';
const DEFAULT_FOREGROUND_KEY = 'editor.foreground';
const COMMENT_SCOPE = 'comment';
const SOLID_HEX = /^#[0-9a-f]{6}$/i;
const INNERMOST_RULE = /([^{};]+)\{([^{}]*)\}/g;
const NEGATION = /:not\([^)]*\)/g;
const DARK_SELECTOR = /\.dark\b/;
const SCOPE_NAME_KEYS = new Set(['name', 'contentName', 'scopeName']);

const SCOPES_PAINTED_ON_THEIR_OWN_FILL = ['carriage-return', 'markup.ignored', 'markup.untracked'];
const SCOPE_DRAWN_WITHOUT_ITS_FILL = 'markup.deleted';

const chatCss = readFileSync(
  createRequire(import.meta.url).resolve('@agiworkforce/design-tokens/chat.css'),
  'utf8',
);

function stylesheetGrounds(css: string): Record<ThemeName, string[]> {
  const grounds: Record<ThemeName, string[]> = { light: [], dark: [] };
  const declaration = new RegExp(`${CODE_GROUND_TOKEN}:\\s*([^;]+);`);
  for (const [, selector = '', body = ''] of css.matchAll(INNERMOST_RULE)) {
    const value = declaration.exec(body)?.[1]?.trim();
    if (!value) continue;
    const theme = DARK_SELECTOR.test(selector.replace(NEGATION, '')) ? 'dark' : 'light';
    grounds[theme].push(value);
  }
  return grounds;
}

function scriptGround(themeName: ThemeName): string {
  return agiChatCssVars[themeName][CODE_GROUND_TOKEN];
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(colour: string): number {
  if (!SOLID_HEX.test(colour)) throw new Error(`not a solid hex colour: ${colour}`);
  return 0.2126 * channel(colour, 1) + 0.7152 * channel(colour, 3) + 0.0722 * channel(colour, 5);
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function scopesOf(rule: ThemeRule): string[] {
  return [rule.scope ?? []]
    .flat()
    .flatMap((scope) => scope.split(','))
    .map((scope) => scope.trim());
}

function matchesScope(selector: string, scope: string): boolean {
  return scope === selector || scope.startsWith(`${selector}.`);
}

function isPaintedOnItsOwnFill(rule: ThemeRule): boolean {
  const scopes = scopesOf(rule);
  return (
    scopes.length > 0 && scopes.every((scope) => SCOPES_PAINTED_ON_THEIR_OWN_FILL.includes(scope))
  );
}

function drawnColours(theme: {
  readonly colors?: Record<string, string>;
  readonly tokenColors?: readonly ThemeRule[];
}): DrawnColour[] {
  const colours: DrawnColour[] = [];
  const fallback = theme.colors?.[DEFAULT_FOREGROUND_KEY];
  if (fallback) colours.push({ scopes: [DEFAULT_FOREGROUND_KEY], colour: fallback });
  for (const rule of theme.tokenColors ?? []) {
    const colour = rule.settings?.foreground;
    if (!colour || isPaintedOnItsOwnFill(rule)) continue;
    colours.push({ scopes: scopesOf(rule), colour });
  }
  return colours;
}

function collectScopeNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectScopeNames(item, names);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && SCOPE_NAME_KEYS.has(key)) {
      for (const name of value.split(/\s+/)) names.add(name);
    } else {
      collectScopeNames(value, names);
    }
  }
}

describe('Shiki theme colours on the code surface', () => {
  const declared = stylesheetGrounds(chatCss);
  const grounds: Record<ThemeName, string[]> = {
    light: [...declared.light, scriptGround('light')],
    dark: [...declared.dark, scriptGround('dark')],
  };

  for (const themeName of Object.keys(THEME_LOADERS) as ThemeName[]) {
    it(`${themeName}: every token colour clears 4.5:1 on every ${CODE_GROUND_TOKEN}`, async () => {
      const theme = (await THEME_LOADERS[themeName]()).default;
      const colours = drawnColours(theme);

      expect(theme.type).toBe(themeName);
      expect(declared[themeName].length).toBeGreaterThan(0);
      expect(grounds[themeName]).toContain(scriptGround(themeName));
      expect(colours.some(({ scopes }) => scopes.includes(DEFAULT_FOREGROUND_KEY))).toBe(true);
      expect(colours.some(({ scopes }) => scopes.includes(COMMENT_SCOPE))).toBe(true);

      const failures = colours.flatMap(({ scopes, colour }) =>
        grounds[themeName]
          .map((ground) => ({ ground, ratio: contrastRatio(colour, ground) }))
          .filter(({ ratio }) => ratio < WCAG_AA_NORMAL)
          .map(
            ({ ground, ratio }) =>
              `${scopes.join(', ')}: ${colour} on ${ground} is ${ratio.toFixed(2)}:1`,
          ),
      );
      expect(failures).toEqual([]);
    });
  }

  it(`reads every ${CODE_GROUND_TOKEN} the token stylesheet declares`, () => {
    const declarations = chatCss.split(`${CODE_GROUND_TOKEN}:`).length - 1;

    expect(declarations).toBeGreaterThan(0);
    expect(declared.light.length + declared.dark.length).toBe(declarations);
  });

  it('no loadable grammar emits a scope the themes colour for a fill the highlighter drops', async () => {
    const emitted = new Set<string>();
    for (const load of Object.values(LANGUAGE_LOADERS)) {
      collectScopeNames((await load()).default, emitted);
    }
    const emits = (selector: string): boolean =>
      [...emitted].some((scope) => matchesScope(selector, scope));

    expect(emits(SCOPE_DRAWN_WITHOUT_ITS_FILL)).toBe(true);
    expect(SCOPES_PAINTED_ON_THEIR_OWN_FILL.filter(emits)).toEqual([]);
  });
});
