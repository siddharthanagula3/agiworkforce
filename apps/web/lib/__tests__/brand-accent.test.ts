import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

const LIGHT_PRIMARY = 'var(--neutral-0)';
const DARK_PRIMARY = 'var(--neutral-fg-1)';
const LIGHT_PRIMARY_FOREGROUND = 'var(--neutral-fg-1)';
const DARK_PRIMARY_FOREGROUND = 'var(--neutral-0)';
const WCAG_AA_NORMAL = 4.5;

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function primaryValues(css: string, token = 'primary'): string[] {
  return [...css.matchAll(new RegExp(`^\\s*--${token}:\\s*([^;]+);`, 'gm'))].map((m) =>
    m[1]!.trim(),
  );
}

function baseThemeBlocks(css: string): { light: string; dark: string } {
  const match = css.match(
    /@layer base\s*{\s*:root\s*{([\s\S]*?)\n\s*}\s*\n\s*\.dark\s*{([\s\S]*?)\n\s*}/,
  );
  if (!match?.[1] || !match[2]) throw new Error('Unable to locate Web base theme blocks');
  return { light: match[1], dark: match[2] };
}

function tokenBlock(file: string, selector: string): string {
  const css = read(`packages/ui/design-tokens/src/${file}`);
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${file} has no ${selector} block`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${selector} block`);
}

// foundation.css owns --background, --foreground, --border and
// --destructive-text; globals.css owns the rest of the shadcn set.
function foundationBlock(selector: string): string {
  return tokenBlock('foundation.css', selector);
}

function webThemeBlocks(): { light: string; dark: string } {
  const { light, dark } = baseThemeBlocks(read('apps/web/app/globals.css'));
  return {
    light: `${foundationBlock(':root')}\n${light}\n${tokenBlock('chat.css', ':root')}`,
    dark: `${foundationBlock('.dark')}\n${dark}\n${tokenBlock('chat.css', '.dark')}`,
  };
}

function tokenValue(block: string, token: string): string {
  const match = block.match(new RegExp(`^\\s*--${token}:\\s*([^;]+);`, 'm'));
  if (!match?.[1]) throw new Error(`Missing --${token} in theme block`);
  return match[1].trim();
}

type Rgb = [number, number, number];

function hslToRgb(value: string): Rgb {
  const match = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`Expected an HSL token triple, received: ${value}`);
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [channel(0), channel(8), channel(4)];
}

function hexToRgb(value: string): Rgb {
  const match = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) throw new Error(`Expected a six-digit hex token, received: ${value}`);
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ].map((channel) => channel / 255) as Rgb;
}

function resolveReference(value: string): string {
  const reference = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (!reference) return value;
  return resolveReference(tokenValue(foundationBlock(':root'), reference[1]!));
}

function cssColorToRgb(value: string): Rgb {
  const resolved = resolveReference(value);
  return resolved.startsWith('#') ? hexToRgb(resolved) : hslToRgb(resolved);
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map(
    (channel, index) => channel * alpha + background[index]! * (1 - alpha),
  ) as Rgb;
}

function expectRgbClose(actual: Rgb, expected: Rgb): void {
  for (const [index, channel] of actual.entries()) {
    expect(channel).toBeCloseTo(expected[index]!, 3);
  }
}

describe('brand accent', () => {
  it('fills the primary action with the neutral inverse of the page in both modes', () => {
    const web = read('apps/web/app/globals.css');
    const values = primaryValues(web);

    expect(values.slice(0, 2)).toEqual([LIGHT_PRIMARY, DARK_PRIMARY]);
  });

  it('pairs each mode with a filled-control foreground that passes WCAG AA', () => {
    const web = read('apps/web/app/globals.css');
    expect(primaryValues(web, 'primary-foreground').slice(0, 2)).toEqual([
      LIGHT_PRIMARY_FOREGROUND,
      DARK_PRIMARY_FOREGROUND,
    ]);

    const { light, dark } = webThemeBlocks();
    for (const block of [light, dark]) {
      const primary = cssColorToRgb(tokenValue(block, 'primary'));
      const foreground = cssColorToRgb(tokenValue(block, 'primary-foreground'));
      expect(contrastRatio(foreground, primary)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });

  it('carries no hue in either mode', () => {
    const { light, dark } = webThemeBlocks();
    for (const block of [light, dark]) {
      const [r, g, b] = cssColorToRgb(tokenValue(block, 'primary'));
      expectRgbClose([g, b, r], [r, g, b]);
    }
  });

  it('keeps text-primary readable on every configured light surface and tint', () => {
    const { light } = webThemeBlocks();
    const primary = cssColorToRgb(tokenValue(light, 'primary'));
    const surfaceTokens = [
      'background',
      'card',
      'popover',
      'secondary',
      'muted',
      'accent',
      'sidebar-background',
      'sidebar-accent',
      'chat-bg',
      'chat-bg-elevated',
      'chat-sidebar-bg',
      'chat-input-bg',
    ];

    for (const surfaceToken of surfaceTokens) {
      const surface = cssColorToRgb(tokenValue(light, surfaceToken));
      for (const alpha of [0, 0.1, 0.15, 0.2, 0.25]) {
        const renderedBackground = composite(primary, surface, alpha);
        expect(
          contrastRatio(primary, renderedBackground),
          `--primary on --${surfaceToken} with bg-primary/${alpha * 100}`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      }
    }
  });

  it('keeps filled primary controls readable at their shipped hover opacities', () => {
    const { light } = webThemeBlocks();
    const primary = cssColorToRgb(tokenValue(light, 'primary'));
    const foreground = cssColorToRgb(tokenValue(light, 'primary-foreground'));

    for (const surfaceToken of ['background', 'card', 'popover', 'sidebar-background']) {
      const surface = cssColorToRgb(tokenValue(light, surfaceToken));
      for (const alpha of [0.8, 0.9, 1]) {
        const renderedBackground = composite(primary, surface, alpha);
        expect(
          contrastRatio(foreground, renderedBackground),
          `--primary-foreground on --${surfaceToken} with bg-primary/${alpha * 100}`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      }
    }
  });

  it('no longer carries a stock shadcn blue as the app accent', () => {
    const web = read('apps/web/app/globals.css');
    for (const value of primaryValues(web).slice(0, 2)) {
      expect(value).not.toMatch(/^22[12]/);
      expect(value).not.toMatch(/^217/);
    }
  });
});
