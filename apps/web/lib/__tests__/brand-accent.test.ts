import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');

const BRAND_PRIMARY = '15 64.1% 59.6%';
const LIGHT_PRIMARY = '15.75 52.63% 29.8%';
const LIGHT_PRIMARY_FOREGROUND = '0 0% 100%';
const BRAND_PRIMARY_FOREGROUND = '180 3.1% 12.5%';
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

// foundation.css owns --background, --foreground, --border and
// --destructive-text; globals.css owns the rest of the shadcn set.
function foundationBlock(selector: string): string {
  const css = read('packages/ui/design-tokens/src/foundation.css');
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`foundation.css has no ${selector} block`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${selector} block`);
}

function webThemeBlocks(): { light: string; dark: string } {
  const { light, dark } = baseThemeBlocks(read('apps/web/app/globals.css'));
  return {
    light: `${foundationBlock(':root')}\n${light}`,
    dark: `${foundationBlock('.dark')}\n${dark}`,
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

function cssColorToRgb(value: string): Rgb {
  return value.startsWith('#') ? hexToRgb(value) : hslToRgb(value);
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
  it('uses the accessible brand shade in light mode and the raw brand in dark mode', () => {
    const web = read('apps/web/app/globals.css');
    const values = primaryValues(web);

    expect(values.slice(0, 2)).toEqual([LIGHT_PRIMARY, BRAND_PRIMARY]);
  });

  it('pairs each mode with a filled-control foreground that passes WCAG AA', () => {
    const web = read('apps/web/app/globals.css');
    expect(primaryValues(web, 'primary-foreground').slice(0, 2)).toEqual([
      LIGHT_PRIMARY_FOREGROUND,
      BRAND_PRIMARY_FOREGROUND,
    ]);

    const { light, dark } = webThemeBlocks();
    for (const block of [light, dark]) {
      const primary = cssColorToRgb(tokenValue(block, 'primary'));
      const foreground = cssColorToRgb(tokenValue(block, 'primary-foreground'));
      expect(contrastRatio(foreground, primary)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });

  it('uses shades from the shared desktop terra-cotta ramp', () => {
    const desktop = read('apps/desktop/src/styles/globals.css');
    const { light, dark } = webThemeBlocks();

    expectRgbClose(
      cssColorToRgb(tokenValue(light, 'primary')),
      cssColorToRgb(tokenValue(desktop, 'color-terra-cotta-700')),
    );
    expectRgbClose(
      cssColorToRgb(tokenValue(dark, 'primary')),
      cssColorToRgb(tokenValue(desktop, 'color-terra-cotta-500')),
    );
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
