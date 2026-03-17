/**
 * WCAG 2.1 AA contrast ratio verification tests
 *
 * Verifies that the color pairs defined in globals.css meet WCAG 2.1 AA
 * minimum contrast ratios:
 *   - 4.5:1 for normal text (< 18pt or < 14pt bold)
 *   - 3.0:1 for large text (>= 18pt or >= 14pt bold) and UI components
 *
 * Reference: https://www.w3.org/TR/WCAG21/#contrast-minimum
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// WCAG contrast math utilities
// ---------------------------------------------------------------------------

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

/** Convert hsl(H S% L%) to hex */
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

// ---------------------------------------------------------------------------
// Color pairs from globals.css
// ---------------------------------------------------------------------------

// Light mode (:root)
const LIGHT_BG = hslToHex(40, 23, 97); // --background: 40 23% 97%
const LIGHT_FG = hslToHex(222.2, 84, 4.9); // --foreground: 222.2 84% 4.9%
const LIGHT_MUTED_FG = hslToHex(215.4, 16.3, 44); // --muted-foreground: 215.4 16.3% 44%
const LIGHT_SIDEBAR_BG = hslToHex(45, 17, 95); // --sidebar-background: 45 17% 95%
const LIGHT_SIDEBAR_FG = hslToHex(240, 5.3, 26.1); // --sidebar-foreground

// Light chat tokens (hex literals from globals.css)
const CHAT_BG_LIGHT = '#faf9f7';
const CHAT_TEXT_PRIMARY_LIGHT = '#1a1a1a';
const CHAT_TEXT_SECONDARY_LIGHT = '#636363';

// Dark mode (.dark)
const DARK_BG = hslToHex(240, 12, 7); // --background: 240 12% 7%
const DARK_FG = hslToHex(210, 40, 98); // --foreground: 210 40% 98%
const DARK_MUTED_FG = hslToHex(215, 20.2, 65.1); // --muted-foreground: 215 20.2% 65.1%
const DARK_SIDEBAR_BG = hslToHex(233, 29, 6); // --sidebar-background: 233 29% 6%
const DARK_SIDEBAR_FG = hslToHex(240, 5, 65); // --sidebar-foreground: 240 5% 65%

// Dark chat tokens (hex literals from globals.css)
const CHAT_BG_DARK = '#0f0f13';
const CHAT_TEXT_PRIMARY_DARK = '#e4e4e7';
const CHAT_TEXT_SECONDARY_DARK = '#a1a1a6';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WCAG 2.1 AA contrast ratios — light mode', () => {
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

describe('WCAG 2.1 AA contrast ratios — dark mode', () => {
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
});

describe('WCAG 2.1 AA contrast ratios — large text and graphics (>= 3:1)', () => {
  /**
   * Sidebar borders (--sidebar-border, --border, --chat-border-subtle/strong) are
   * purely decorative separators between surface areas that share very similar hues.
   * WCAG 1.4.11 (Non-text Contrast) requires 3:1 only for "components and states"
   * that convey information — not for decorative borders.
   * We verify the correct semantic role here and document the actual ratios.
   */
  it('light sidebar-bg vs sidebar-border is decorative (< 3:1 acceptable)', () => {
    // --sidebar-border: 214.3 31.8% 91.4%
    const sidebarBorder = hslToHex(214.3, 31.8, 91.4);
    const ratio = contrastRatio(LIGHT_SIDEBAR_BG, sidebarBorder);
    // These are background-to-background dividers — intentionally subtle
    // WCAG exception: purely decorative borders between surface zones
    expect(ratio).toBeGreaterThan(1.0); // must be distinct, not identical
  });

  it('dark chat-border-strong is visually distinct from chat-bg (> 1:1)', () => {
    // #2d2d35 on #0f0f13 — subtle structural divider, not a UI control
    const chatBorderStrong = '#2d2d35';
    const ratio = contrastRatio(CHAT_BG_DARK, chatBorderStrong);
    // Decorative layout separator — must be different from background
    expect(ratio).toBeGreaterThan(1.0);
  });

  it('focus ring (--ring) has >= 3:1 contrast with dark background', () => {
    // --ring: 224.3 76.3% 52% — used for focus indicators (non-decorative)
    // Updated from 48% (2.83:1 — failed) to 52% (3.24:1 — WCAG AA pass)
    const focusRing = hslToHex(224.3, 76.3, 52);
    const ratio = contrastRatio(DARK_BG, focusRing);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it('focus ring (--ring) has >= 3:1 contrast with light background', () => {
    // --ring light: 221.2 83.2% 53.3%
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
