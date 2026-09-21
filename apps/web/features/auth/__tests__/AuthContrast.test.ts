import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as authStyles from '../authStyles';

const here = path.dirname(new URL(import.meta.url).pathname);
const foundationCss = readFileSync(
  path.resolve(here, '../../../../../packages/ui/design-tokens/src/foundation.css'),
  'utf8',
);
const globalsCss = readFileSync(path.resolve(here, '../../../app/globals.css'), 'utf8');

function declarationsIn(css: string, start: number, end: number): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    declarations.set(match[1]!, match[2]!.trim());
  }
  return declarations;
}

const rootStart = foundationCss.indexOf(':root {');
const darkStart = foundationCss.indexOf('.dark {');
const light = declarationsIn(foundationCss, rootStart, darkStart);
const dark = new Map([...light, ...declarationsIn(foundationCss, darkStart, foundationCss.length)]);

/** Tailwind colour names this app exposes, and the token each one reads. */
const COLOUR_TOKENS = new Map<string, string>(
  [...globalsCss.matchAll(/--color-([a-z0-9-]+):\s*var\((--[a-z0-9-]+)\)/g)].map((match) => [
    match[1]!,
    match[2]!,
  ]),
);

function resolve(token: string, scope: Map<string, string>, depth = 0): string | null {
  const value = scope.get(token);
  if (value === undefined || depth > 8) return null;
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (reference) return resolve(reference[1]!, scope, depth + 1);
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : null;
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const full =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex.slice(0, 7);
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const CLASS_PATTERN = new RegExp(
  `(?:^|[\\s:])(text|bg|border)-(${[...COLOUR_TOKENS.keys()].join('|')})(?![a-z0-9-])`,
  'g',
);

interface Usage {
  constant: string;
  colour: string;
  on: string;
}

/**
 * Pairs each colour with the background of the element that carries it: a fill
 * declared in the same class string, and otherwise the page behind it.
 */
function usages(): Usage[] {
  const pageFill = /bg-([a-z0-9-]+)/.exec(authStyles.AUTH_PAGE_CLASS)?.[1] ?? 'surface-elevated';
  const found: Usage[] = [];

  for (const [constant, value] of Object.entries(authStyles)) {
    if (typeof value !== 'string') continue;
    const matches = [...value.matchAll(CLASS_PATTERN)];
    const ownFill = matches.find(
      (match) => match[1] === 'bg' && !value.includes('bg-transparent'),
    )?.[2];

    for (const match of matches) {
      if (match[1] === 'bg') continue;
      found.push({ constant, colour: match[2]!, on: ownFill ?? pageFill });
    }
  }
  return found;
}

const TEXT_MINIMUM = 4.5;
const BOUNDARY_MINIMUM = 3;

/**
 * Resting boundaries drawn with the decorative rule. Each one is the only thing
 * that shows where the control is, which is what --rule-strong exists for.
 */
const KNOWN_SHORTFALLS = new Map<string, string>([
  ['AUTH_INPUT_CLASS:rule', 'the text field has no fill, so this outline is the whole control'],
  ['AUTH_PROVIDER_BUTTON_CLASS:rule', 'the provider button has no fill either'],
  ['AUTH_BADGE_CLASS:rule', 'the last-used badge is outlined rather than filled'],
]);

describe('the colours the sign-in screens actually draw', () => {
  const measured = usages();

  it('resolves every one of them to a token this app declares', () => {
    expect(measured.length).toBeGreaterThan(5);
    for (const usage of measured) {
      expect(COLOUR_TOKENS.get(usage.colour), usage.colour).toBeDefined();
      expect(COLOUR_TOKENS.get(usage.on), `${usage.on} behind ${usage.constant}`).toBeDefined();
    }
  });

  for (const [theme, scope] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`${theme}: clears the minimum for every colour against the surface it sits on`, () => {
      const under = new Map<string, string>();

      for (const usage of measured) {
        const foreground = resolve(COLOUR_TOKENS.get(usage.colour)!, scope);
        const background = resolve(COLOUR_TOKENS.get(usage.on)!, scope);
        if (foreground === null || background === null) continue;

        const ratio = contrast(foreground, background);
        const minimum = usage.colour === 'rule' ? BOUNDARY_MINIMUM : TEXT_MINIMUM;
        if (ratio < minimum) {
          under.set(
            `${usage.constant}:${usage.colour}`,
            `${usage.colour} on ${usage.on} is ${ratio.toFixed(2)}:1, under ${minimum}`,
          );
        }
      }

      const unrecorded = [...under].filter(([key]) => !KNOWN_SHORTFALLS.has(key));
      expect(unrecorded.map(([key, detail]) => `${key}: ${detail}`)).toEqual([]);

      const recovered = [...KNOWN_SHORTFALLS.keys()].filter((key) => !under.has(key));
      expect(recovered, 'these now pass: take them out of KNOWN_SHORTFALLS').toEqual([]);
    });
  }

  it('never leaves a failure to colour alone', () => {
    const errorText = authStyles.AUTH_ERROR_CLASS;
    expect(errorText).toContain('danger-text');
    expect(authStyles.AUTH_INPUT_CLASS).not.toContain('danger');
  });
});

describe('the sizes the sign-in screens are built from', () => {
  it('states every one of them in units that grow with the reader', () => {
    const fixed: string[] = [];

    for (const [constant, value] of Object.entries(authStyles)) {
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(/\[([^\]]*\d)px\]/g)) {
        fixed.push(`${constant}: ${match[0]}`);
      }
    }

    expect(fixed).toEqual([]);
  });

  it('lets the column reflow instead of holding a width the viewport may not have', () => {
    expect(authStyles.AUTH_COLUMN_CLASS).toContain('w-full');
    expect(authStyles.AUTH_COLUMN_CLASS).toMatch(/max-w-\[[\d.]+rem\]/);
    expect(authStyles.AUTH_PAGE_CLASS).toContain('min-h-svh');
    expect(authStyles.AUTH_PAGE_CLASS).toMatch(/px-\d/);
  });
});
