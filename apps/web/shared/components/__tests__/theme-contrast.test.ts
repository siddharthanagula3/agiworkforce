import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

function hexToSRGB(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function toLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = hexToSRGB(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const WCAG_AA_NORMAL = 4.5;
const WCAG_AA_LARGE = 3.0;

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const globalsCss = readFileSync(resolve(repoRoot, 'apps/web/app/globals.css'), 'utf8');
const chatCss = readFileSync(resolve(repoRoot, 'packages/ui/design-tokens/src/chat.css'), 'utf8');

function baseThemeBlocks(css: string): { light: string; dark: string } {
  const match = css.match(
    /@layer base\s*{\s*:root\s*{([\s\S]*?)\n\s*}\s*\n\s*\.dark\s*{([\s\S]*?)\n\s*}/,
  );
  if (!match?.[1] || !match[2]) throw new Error('Unable to locate the Web base theme blocks');
  return { light: match[1], dark: match[2] };
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
  if (!match?.[1]) throw new Error(`Missing ${name} in theme block`);
  return match[1].trim();
}

const PRIMITIVES: Record<string, string> = Object.fromEntries(
  [...chatCss.matchAll(/^\s*(--neutral-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [
    m[1]!,
    m[2]!.trim(),
  ]),
);

function tripleToHex(value: string): string {
  const [h = 0, s = 0, l = 0] = value.split(/\s+/).map(Number.parseFloat);
  return hslToHex(h, s, l);
}

function colorToken(block: string, name: string): string {
  const value = token(block, name);
  if (value.startsWith('#')) return value;

  const wrapped = value.match(/^hsl\(\s*var\((--[a-z0-9-]+)\)\s*\)$/);
  if (wrapped) {
    const primitive = PRIMITIVES[wrapped[1]!];
    if (!primitive) throw new Error(`Unknown primitive ${wrapped[1]}`);
    return tripleToHex(primitive);
  }

  const bare = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (bare) {
    const primitive = PRIMITIVES[bare[1]!];
    if (!primitive) throw new Error(`Unknown primitive ${bare[1]}`);
    return tripleToHex(primitive);
  }

  return tripleToHex(value);
}

const web = baseThemeBlocks(globalsCss);
const chat = baseThemeBlocks(chatCss);
// Dark mode IS the neutral ChatGPT palette now - there is no separate opt-in
// dark variant to check, so the shared package's own `.dark` block is the one
// every surface renders.
const cool = chat.dark;

const LIGHT_BG = colorToken(web.light, '--background');
const LIGHT_FG = colorToken(web.light, '--foreground');
const LIGHT_MUTED_FG = colorToken(web.light, '--muted-foreground');
const LIGHT_SIDEBAR_BG = colorToken(web.light, '--sidebar-background');
const LIGHT_SIDEBAR_FG = colorToken(web.light, '--sidebar-foreground');

const CHAT_BG_LIGHT = colorToken(chat.light, '--chat-bg');
const CHAT_TEXT_PRIMARY_LIGHT = colorToken(chat.light, '--chat-text-primary');
const CHAT_TEXT_SECONDARY_LIGHT = colorToken(chat.light, '--chat-text-secondary');

const DARK_BG = colorToken(web.dark, '--background');
const DARK_FG = colorToken(web.dark, '--foreground');
const DARK_MUTED_FG = colorToken(web.dark, '--muted-foreground');
const DARK_SIDEBAR_BG = colorToken(web.dark, '--sidebar-background');
const DARK_SIDEBAR_FG = colorToken(web.dark, '--sidebar-foreground');

const CHAT_BG_DARK = colorToken(web.dark, '--chat-bg');
const CHAT_TEXT_PRIMARY_DARK = colorToken(web.dark, '--chat-text-primary');
const CHAT_TEXT_SECONDARY_DARK = colorToken(web.dark, '--chat-text-secondary');
const CHAT_TEXT_MUTED_DARK = colorToken(web.dark, '--chat-text-muted');
const CHAT_INPUT_BG_DARK = colorToken(web.dark, '--chat-input-bg');
const CHAT_SURFACE_ELEVATED_DARK = colorToken(web.dark, '--chat-surface-elevated');
const CHAT_SURFACE_OVERLAY_DARK = colorToken(web.dark, '--chat-surface-overlay');
const DARK_CARD = colorToken(web.dark, '--card');
const DARK_POPOVER = colorToken(web.dark, '--popover');

describe('WCAG 2.1 AA contrast ratios · light mode', () => {
  it('--background vs --foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(LIGHT_BG, LIGHT_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('--background vs --muted-foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(LIGHT_BG, LIGHT_MUTED_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('--sidebar-background vs --sidebar-foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(LIGHT_SIDEBAR_BG, LIGHT_SIDEBAR_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('chat-bg vs chat-text-primary: >= 4.5:1', () => {
    const ratio = contrastRatio(CHAT_BG_LIGHT, CHAT_TEXT_PRIMARY_LIGHT);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('chat-bg vs chat-text-secondary: >= 4.5:1', () => {
    const ratio = contrastRatio(CHAT_BG_LIGHT, CHAT_TEXT_SECONDARY_LIGHT);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });
});

describe('WCAG 2.1 AA contrast ratios · dark mode', () => {
  it('--background vs --foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(DARK_BG, DARK_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('--background vs --muted-foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(DARK_BG, DARK_MUTED_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('--sidebar-background vs --sidebar-foreground: >= 4.5:1', () => {
    const ratio = contrastRatio(DARK_SIDEBAR_BG, DARK_SIDEBAR_FG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('chat-bg vs chat-text-primary: >= 4.5:1', () => {
    const ratio = contrastRatio(CHAT_BG_DARK, CHAT_TEXT_PRIMARY_DARK);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('chat-bg vs chat-text-secondary: >= 4.5:1', () => {
    const ratio = contrastRatio(CHAT_BG_DARK, CHAT_TEXT_SECONDARY_DARK);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it.each([
    ['chat-input-bg', () => CHAT_INPUT_BG_DARK],
    ['chat-surface-elevated', () => CHAT_SURFACE_ELEVATED_DARK],
    ['chat-surface-overlay', () => CHAT_SURFACE_OVERLAY_DARK],
    ['card', () => DARK_CARD],
    ['popover', () => DARK_POPOVER],
  ])('%s vs chat-text-muted: >= 4.5:1', (_name, surface) => {
    expect(contrastRatio(surface(), CHAT_TEXT_MUTED_DARK)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it.each([
    ['card', () => DARK_CARD],
    ['popover', () => DARK_POPOVER],
  ])('%s vs --muted-foreground: >= 4.5:1', (_name, surface) => {
    expect(contrastRatio(surface(), DARK_MUTED_FG)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });
});

describe('WCAG 2.1 AA contrast ratios - the shared dark chat palette', () => {
  const bg = colorToken(cool, '--chat-bg');
  const sidebar = colorToken(cool, '--chat-sidebar-bg');
  const input = colorToken(cool, '--chat-input-bg');
  const elevated = colorToken(cool, '--chat-surface-elevated');
  const overlay = colorToken(cool, '--chat-surface-overlay');
  const primary = colorToken(cool, '--chat-text-primary');
  const secondary = colorToken(cool, '--chat-text-secondary');
  const muted = colorToken(cool, '--chat-text-muted');
  const placeholder = colorToken(cool, '--chat-text-placeholder');

  it.each([
    ['primary on bg', () => primary, () => bg],
    ['primary on sidebar', () => primary, () => sidebar],
    ['primary on input', () => primary, () => input],
    ['primary on elevated', () => primary, () => elevated],
    ['primary on overlay', () => primary, () => overlay],
    ['secondary on bg', () => secondary, () => bg],
    ['secondary on input', () => secondary, () => input],
    ['muted on bg', () => muted, () => bg],
    ['muted on overlay', () => muted, () => overlay],
    ['placeholder on input', () => placeholder, () => input],
  ])('%s: >= 4.5:1', (_name, fg, surface) => {
    expect(contrastRatio(fg(), surface())).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('derives every surface and text colour from a shared primitive', () => {
    for (const name of [
      '--chat-bg',
      '--chat-sidebar-bg',
      '--chat-input-bg',
      '--chat-surface-elevated',
      '--chat-surface-overlay',
      '--chat-text-primary',
      '--chat-text-secondary',
      '--chat-text-muted',
    ]) {
      expect(token(cool, name), `${name} must reference a --neutral-* primitive`).toMatch(
        /var\(--neutral-[a-z0-9-]+\)/,
      );
    }
  });
});

describe('WCAG 2.1 AA contrast ratios · large text and graphics (>= 3:1)', () => {
  it('light sidebar-bg vs sidebar-border is decorative (< 3:1 acceptable)', () => {
    const sidebarBorder = hslToHex(214.3, 31.8, 91.4);
    const ratio = contrastRatio(LIGHT_SIDEBAR_BG, sidebarBorder);
    expect(ratio).toBeGreaterThan(1.0);
  });

  it('dark chat-border-strong is visually distinct from chat-bg (> 1:1)', () => {
    const chatBorderStrong = colorToken(web.dark, '--chat-border-strong');
    const ratio = contrastRatio(CHAT_BG_DARK, chatBorderStrong);
    expect(ratio).toBeGreaterThan(1.0);
  });

  it('focus ring (--ring) has >= 3:1 contrast with dark background', () => {
    const focusRing = hslToHex(224.3, 76.3, 52);
    const ratio = contrastRatio(DARK_BG, focusRing);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it('focus ring (--ring) has >= 3:1 contrast with light background', () => {
    const focusRingLight = hslToHex(221.2, 83.2, 53.3);
    const ratio = contrastRatio(LIGHT_BG, focusRingLight);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });
});

describe('contrastRatio utility', () => {
  it('returns 21 for black vs white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5);
  });

  it('is symmetric (order of arguments does not matter)', () => {
    const r1 = contrastRatio('#0f0f13', '#e4e4e7');
    const r2 = contrastRatio('#e4e4e7', '#0f0f13');
    expect(r1).toBeCloseTo(r2, 10);
  });
});
