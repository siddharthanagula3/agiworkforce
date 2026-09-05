import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  agiPalette,
  agiCoolPalette,
  agiChatCssVars,
  agiElevation,
  agiShadows,
} from '@agiworkforce/design-tokens';

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
const foundationCss = readFileSync(
  resolve(repoRoot, 'packages/ui/design-tokens/src/foundation.css'),
  'utf8',
);

const foundationBlock = (selector: string): string => {
  const start = foundationCss.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`foundation.css has no ${selector} block`);
  const open = foundationCss.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < foundationCss.length; i++) {
    if (foundationCss[i] === '{') depth++;
    else if (foundationCss[i] === '}' && --depth === 0) return foundationCss.slice(open + 1, i);
  }
  throw new Error(`unbalanced ${selector} block`);
};

const foundationLight = foundationBlock(':root');
const foundationDark = foundationBlock('.dark');

const CORNERS: Record<string, string> = Object.fromEntries(
  [...foundationLight.matchAll(/^\s*(--corner-[a-z]+):\s*([^;]+);/gm)].map((m) => [
    m[1]!,
    m[2]!.trim(),
  ]),
);

const throughLadder = (value: string): string => {
  const via = value.match(/^var\((--corner-[a-z]+)\)$/);
  if (!via) return value;
  const rung = CORNERS[via[1]!];
  if (!rung) throw new Error(`Unknown foundation rung ${via[1]}`);
  return rung;
};

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
  [...foundationCss.matchAll(/^\s*(--neutral-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [
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

// foundation.css owns these four; globals.css owns the rest of the shadcn set.
// The `foundation layer` suite asserts globals.css declares none of them, so the
// two halves of each block below can never disagree about a name.
const FOUNDATION_OWNED = [
  '--background',
  '--foreground',
  '--border',
  '--destructive-text',
  '--logo-surface',
  '--logo-on-surface',
];
const webBase = baseThemeBlocks(globalsCss);
const web = {
  light: `${foundationLight}\n${webBase.light}`,
  dark: `${foundationDark}\n${webBase.dark}`,
};
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

const SWATCHES = ['default', 'green', 'blue', 'violet', 'rose'] as const;

const BRAND_MARK_TOKENS = [
  '--brand-google-blue',
  '--brand-google-red',
  '--brand-google-yellow',
  '--brand-google-green',
  '--brand-microsoft-red',
  '--brand-microsoft-green',
  '--brand-microsoft-blue',
  '--brand-microsoft-yellow',
];

describe('brand mark colours belong to the brand, not to a theme', () => {
  it('declares each one once and never re-tunes it for dark', () => {
    for (const name of BRAND_MARK_TOKENS) {
      const declaration = new RegExp(`^\\s*${name}:\\s*#[0-9a-f]{6};`, 'm');
      expect(foundationLight, `${name} missing from the foundation root block`).toMatch(
        declaration,
      );
      expect(foundationDark, `${name} re-declared for dark`).not.toMatch(
        new RegExp(`^\\s*${name}:`, 'm'),
      );
    }
  });
});

describe('the logo tile is fixed light in both themes', () => {
  for (const [theme, block] of [
    ['light', web.light],
    ['dark', web.dark],
  ] as const) {
    it(`${theme}: --logo-on-surface on --logo-surface >= 4.5:1`, () => {
      expect(
        contrastRatio(colorToken(block, '--logo-on-surface'), colorToken(block, '--logo-surface')),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }

  it('keeps the same surface in both themes so a near black mark never inverts', () => {
    expect(colorToken(web.dark, '--logo-surface')).toEqual(colorToken(web.light, '--logo-surface'));
    expect(colorToken(web.dark, '--logo-on-surface')).toEqual(
      colorToken(web.light, '--logo-on-surface'),
    );
  });
});

describe('destructive tokens carry both roles', () => {
  // One --destructive served text and solid fills at once, so each theme failed
  // the role it was not tuned for: light text 3.55:1 and light fills 3.76:1,
  // dark text 2.10:1. No single value satisfies both, hence --destructive-text.
  for (const [theme, block, bg] of [
    ['light', web.light, LIGHT_BG],
    ['dark', web.dark, DARK_BG],
  ] as const) {
    it(`${theme}: --destructive-text on --background >= 4.5:1`, () => {
      expect(contrastRatio(colorToken(block, '--destructive-text'), bg)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
    });

    it(`${theme}: --destructive-foreground on --destructive >= 4.5:1`, () => {
      expect(
        contrastRatio(
          colorToken(block, '--destructive-foreground'),
          colorToken(block, '--destructive'),
        ),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }
});

describe('voice mode tokens', () => {
  // The muted microphone in voice mode is a solid --chat-destructive circle
  // with a mic-slash glyph on it, and a glyph is non-text content: WCAG asks
  // 3:1 against what it is drawn on, and the circle itself needs 3:1 against
  // the composer it sits in so the muted state is discernible at all.
  for (const [theme, block, inputBg] of [
    ['light', chat.light, colorToken(chat.light, '--chat-input-bg')],
    ['dark', chat.dark, colorToken(chat.dark, '--chat-input-bg')],
  ] as const) {
    it(`${theme}: --chat-destructive-on-fill on --chat-destructive >= 3:1`, () => {
      expect(
        contrastRatio(
          colorToken(block, '--chat-destructive-on-fill'),
          colorToken(block, '--chat-destructive'),
        ),
      ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it(`${theme}: --chat-destructive fill on --chat-input-bg >= 3:1`, () => {
      expect(
        contrastRatio(colorToken(block, '--chat-destructive'), inputBg),
      ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it(`${theme}: the orb gradient runs from a core to a lighter rim`, () => {
      const core = colorToken(block, '--chat-voice-orb-core');
      const rim = colorToken(block, '--chat-voice-orb-rim');
      expect(core).not.toBe(rim);
      expect(relativeLuminance(rim)).toBeGreaterThan(relativeLuminance(core));
    });
  }
});

describe('every accent swatch pairs with a legible foreground', () => {
  // The accent is a user-selectable fill. White cleared the light swatches but
  // failed amber (2.97:1) and every dark swatch (2.54-3.20:1), so the paired
  // --accent-swatch-*-on foreground is what call sites must render on the fill.
  for (const [theme, block] of [
    ['light', web.light],
    ['dark', web.dark],
  ] as const) {
    for (const swatch of SWATCHES) {
      it(`${theme}/${swatch}: --accent-swatch-${swatch}-on on its fill >= 4.5:1`, () => {
        expect(
          contrastRatio(
            colorToken(block, `--accent-swatch-${swatch}-on`),
            colorToken(block, `--accent-swatch-${swatch}`),
          ),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }
  }
});

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

describe('a selected settings toggle chip uses a neutral fill, not the brand accent', () => {
  for (const [theme, block] of [
    ['light', web.light],
    ['dark', web.dark],
  ] as const) {
    it(`${theme}: --accent-foreground on --accent >= 4.5:1`, () => {
      const ratio = contrastRatio(
        colorToken(block, '--accent'),
        colorToken(block, '--accent-foreground'),
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }
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

describe('the marketing stage amber clears AA through its own tint', () => {
  const STAGES = ['warm', 'pearl'] as const;

  const stageCascade = (stage: string): string => {
    const selector = `[data-design='agi'] .agi-stage--${stage}`;
    const blocks: string[] = [];
    for (
      let at = globalsCss.indexOf(selector);
      at !== -1;
      at = globalsCss.indexOf(selector, at + 1)
    ) {
      const open = globalsCss.indexOf('{', at + selector.length);
      if (open === -1 || /[;{}]/.test(globalsCss.slice(at + selector.length, open))) continue;
      let depth = 0;
      for (let i = open; i < globalsCss.length; i++) {
        if (globalsCss[i] === '{') depth++;
        else if (globalsCss[i] === '}' && --depth === 0) {
          blocks.push(globalsCss.slice(open + 1, i));
          break;
        }
      }
    }
    if (blocks.length === 0) throw new Error(`globals.css declares no .agi-stage--${stage}`);
    return blocks.join('\n');
  };

  const channels = (hex: string): number[] => hexToSRGB(hex).map((c) => Math.round(c * 255));

  const rgba = (value: string): { rgb: number[]; alpha: number } => {
    const inner = value.match(/^rgba\(([^)]+)\)$/);
    if (!inner?.[1]) throw new Error(`Expected an rgba tint, got ${value}`);
    const parts = inner[1].split(',').map((part) => Number.parseFloat(part));
    if (parts.length !== 4 || parts.some(Number.isNaN)) throw new Error(`Malformed ${value}`);
    return { rgb: parts.slice(0, 3), alpha: parts[3]! };
  };

  const compositeOver = (tint: { rgb: number[]; alpha: number }, ground: string): string => {
    const base = channels(ground);
    return `#${tint.rgb
      .map((c, i) => Math.round(base[i]! * (1 - tint.alpha) + c * tint.alpha))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')}`;
  };

  for (const stage of STAGES) {
    const block = stageCascade(stage);
    const amber = colorToken(block, '--agi-amber');
    const soft = rgba(token(block, '--agi-amber-soft'));
    const ground = colorToken(block, '--agi-bg-3');

    it(`${stage}: --agi-amber on the soft tint over --agi-bg-3 >= 4.5:1`, () => {
      expect(contrastRatio(amber, compositeOver(soft, ground))).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
    });

    it(`${stage}: --agi-amber on --agi-bg-3 >= 4.5:1`, () => {
      expect(contrastRatio(amber, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${stage}: --agi-amber-soft is --agi-amber at a lower alpha`, () => {
      expect(soft.rgb).toEqual(channels(amber));
      expect(soft.alpha).toBeLessThan(1);
    });
  }
});

describe('the marketing design-system palette clears AA in both themes', () => {
  const designBlock = (selector: string, mustDeclare: string): string => {
    for (
      let at = globalsCss.indexOf(selector);
      at !== -1;
      at = globalsCss.indexOf(selector, at + 1)
    ) {
      const open = globalsCss.indexOf('{', at + selector.length);
      if (open === -1 || /[;{}]/.test(globalsCss.slice(at + selector.length, open))) continue;
      let depth = 0;
      for (let i = open; i < globalsCss.length; i++) {
        if (globalsCss[i] === '{') depth++;
        else if (globalsCss[i] === '}' && --depth === 0) {
          const body = globalsCss.slice(open + 1, i);
          if (body.includes(`${mustDeclare}:`)) return body;
          break;
        }
      }
    }
    throw new Error(`globals.css has no ${selector} block declaring ${mustDeclare}`);
  };

  const THEMES = {
    dark: designBlock("[data-design='agi']", '--agi-ground'),
    light: designBlock("[data-theme='light'][data-design='agi']", '--agi-ground'),
  };

  const LANES = ['local', 'byok', 'cloud'] as const;

  for (const [theme, block] of Object.entries(THEMES)) {
    const ground = colorToken(block, '--agi-ground');
    const ground2 = colorToken(block, '--agi-ground-2');
    const ink = colorToken(block, '--agi-ink');
    const ink2 = colorToken(block, '--agi-ink-2');

    it(`${theme}: --agi-ink on --agi-ground >= 4.5:1`, () => {
      expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: --agi-ink on --agi-ground-2 >= 4.5:1`, () => {
      expect(contrastRatio(ink, ground2)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: --agi-ink-2 on --agi-ground >= 4.5:1`, () => {
      expect(contrastRatio(ink2, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: --agi-ink-2 on --agi-ground-2 >= 4.5:1`, () => {
      expect(contrastRatio(ink2, ground2)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: the primary CTA draws --agi-ground on --agi-ink at >= 4.5:1`, () => {
      expect(contrastRatio(ground, ink)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    for (const lane of LANES) {
      const fill = colorToken(block, `--agi-lane-${lane}`);
      const text = colorToken(block, `--agi-lane-${lane}-text`);
      const onFill = colorToken(block, `--agi-lane-${lane}-on-primary`);

      it(`${theme}: --agi-lane-${lane}-text on --agi-ground >= 4.5:1`, () => {
        expect(contrastRatio(text, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });

      it(`${theme}: --agi-lane-${lane}-text on --agi-ground-2 >= 4.5:1`, () => {
        expect(contrastRatio(text, ground2)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });

      it(`${theme}: --agi-lane-${lane}-on-primary on --agi-lane-${lane} >= 4.5:1`, () => {
        expect(contrastRatio(onFill, fill)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });

      it(`${theme}: the --agi-lane-${lane} dot stays visible on --agi-ground (>= 3:1)`, () => {
        expect(contrastRatio(fill, ground)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }

    it(`${theme}: the legacy neutral ramp holds no second set of values`, () => {
      expect(token(block, '--agi-bg')).toBe('var(--agi-ground)');
      expect(token(block, '--agi-bg-2')).toBe('var(--agi-ground-2)');
      expect(token(block, '--agi-bg-3')).toBe('var(--agi-ground-3)');
    });
  }
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

describe('design-token palettes consumed by extension, mobile and VS Code', () => {
  const palettes = { agiPalette, agiCoolPalette };
  const readableOn = ['base', 'raised', 'overlay', 'sidebar', 'input'] as const;

  for (const [paletteName, palette] of Object.entries(palettes)) {
    for (const mode of ['light', 'dark'] as const) {
      const { surface, text } = palette[mode];

      for (const [role, fg] of Object.entries(text)) {
        for (const surfaceName of readableOn) {
          const bg = surface[surfaceName];

          it(`${paletteName}.${mode}.text.${role} meets AA on surface.${surfaceName}`, () => {
            expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
          });
        }
      }

      it(`${paletteName}.${mode} keeps primary > secondary > muted in prominence`, () => {
        const onBase = (hex: string): number => contrastRatio(hex, surface.base);

        expect(onBase(text.primary)).toBeGreaterThan(onBase(text.secondary));
        expect(onBase(text.secondary)).toBeGreaterThan(onBase(text.muted));
      });
    }
  }
});

describe('the two emitters of the --chat-* contract agree', () => {
  const chatCssLight = baseThemeBlocks(chatCss).light;

  const sharedLightTokens = {
    '--chat-bg': agiChatCssVars.light['--chat-bg'],
    '--chat-text-primary': agiChatCssVars.light['--chat-text-primary'],
    '--chat-text-secondary': agiChatCssVars.light['--chat-text-secondary'],
    '--chat-text-muted': agiChatCssVars.light['--chat-text-muted'],
    '--chat-text-placeholder': agiChatCssVars.light['--chat-text-placeholder'],
  };

  for (const [name, fromTs] of Object.entries(sharedLightTokens)) {
    it(`${name} is identical in chat.css and design-tokens/src/index.ts`, () => {
      expect(fromTs.toLowerCase()).toBe(token(chatCssLight, name).toLowerCase());
    });
  }

  // chat.css reaches its faces through var(--font-*, 'Family') because next/font
  // attaches those variables to <body>, one level below the :root that declares
  // the token; index.ts emits the same contract for hosts with no next/font at
  // all, so it carries the family names bare. Compare the stacks, not the text.
  const familyStack = (value: string): string =>
    value
      .replace(/var\(--font-[a-z-]+,\s*([^)]+)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

  const sharedFontTokens = {
    '--chat-font-sans': agiChatCssVars.light['--chat-font-sans'],
    '--chat-font-serif': agiChatCssVars.light['--chat-font-serif'],
    '--chat-font-display': agiChatCssVars.light['--chat-font-display'],
    '--chat-font-mono': agiChatCssVars.light['--chat-font-mono'],
  };

  for (const [name, fromTs] of Object.entries(sharedFontTokens)) {
    it(`${name} names the same family stack in chat.css and design-tokens/src/index.ts`, () => {
      expect(familyStack(fromTs)).toBe(familyStack(token(chatCssLight, name)));
    });

    it(`${name} is identical in the light and dark halves of index.ts`, () => {
      expect(agiChatCssVars.dark[name as keyof typeof agiChatCssVars.dark]).toBe(fromTs);
    });
  }

  const sharedRadiusTokens = {
    '--chat-radius-sm': agiChatCssVars.light['--chat-radius-sm'],
    '--chat-radius-md': agiChatCssVars.light['--chat-radius-md'],
    '--chat-radius-lg': agiChatCssVars.light['--chat-radius-lg'],
    '--chat-radius-xl': agiChatCssVars.light['--chat-radius-xl'],
    '--chat-radius-2xl': agiChatCssVars.light['--chat-radius-2xl'],
    '--chat-user-bubble-radius': agiChatCssVars.light['--chat-user-bubble-radius'],
  };

  for (const [name, fromTs] of Object.entries(sharedRadiusTokens)) {
    it(`${name} resolves to the same rung in chat.css and design-tokens/src/index.ts`, () => {
      expect(fromTs).toBe(throughLadder(token(chatCssLight, name)));
    });
  }

  const RUNGS = [1, 2, 3, 4] as const;

  for (const [theme, block] of [
    ['light', foundationLight],
    ['dark', foundationDark],
  ] as const) {
    for (const rung of RUNGS) {
      it(`${theme} elevation ${rung} is identical in foundation.css and design-tokens/src/index.ts`, () => {
        expect(agiElevation[theme][rung]).toBe(token(block, `--elevation-${rung}`));
      });
    }
  }

  it('the shadow export derives from the elevation table rather than its own literals', () => {
    expect(agiShadows.sm).toBe(agiElevation.light[1]);
    expect(agiShadows.md).toBe(agiElevation.light[2]);
    expect(agiShadows.lg).toBe(agiElevation.light[3]);
    expect(agiChatCssVars.dark['--chat-shadow-lg']).toBe(agiElevation.dark[3]);
  });

  it('the chat elevation indirects through the foundation rung in one theme only', () => {
    // Resolving instead of restating is what makes the dark counterpart
    // unnecessary; a re-added .dark literal would silently pin one theme.
    expect(token(chatCssLight, '--chat-shadow-lg')).toBe('var(--elevation-3)');
    expect(chat.dark, 'chat.css .dark restates --chat-shadow-lg').not.toMatch(
      /^\s*--chat-shadow-lg\s*:/m,
    );
  });

  it('every chat radius indirects through the foundation ladder', () => {
    for (const name of Object.keys(sharedRadiusTokens)) {
      expect(token(chatCssLight, name), `${name} restates a literal radius`).toMatch(
        /^var\(--corner-[a-z]+\)$/,
      );
    }
  });

  it('every font family chat.css indirects through is one layout.tsx registers', () => {
    const registered = new Set(
      [
        ...readFileSync(resolve(repoRoot, 'apps/web/app/layout.tsx'), 'utf8').matchAll(
          /variable:\s*['"`](--font-[a-zA-Z0-9-]+)/g,
        ),
      ].map((m) => m[1]),
    );
    expect(registered.size).toBeGreaterThan(0);

    for (const name of Object.keys(sharedFontTokens)) {
      for (const [, referenced] of token(chatCssLight, name).matchAll(
        /var\((--font-[a-zA-Z0-9-]+)/g,
      )) {
        expect(registered, `${name} indirects through unregistered ${referenced}`).toContain(
          referenced,
        );
      }
    }
  });
});

const MODE_INVARIANT = /(^--(z|neutral)-)|(radius|shadow|font|dur|ease|spacing|blur|width|height)/;

describe('theme completeness', () => {
  const declarations = (block: string): Map<string, string> =>
    new Map(
      [...block.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [
        m[1] as string,
        (m[2] as string).trim(),
      ]),
    );

  const resolvesThroughAnotherToken = (value: string): boolean => value.includes('var(--');

  for (const [name, css] of [
    ['globals.css', globalsCss],
    ['chat.css', chatCss],
  ] as const) {
    const { light, dark } = baseThemeBlocks(css);
    const lightDecls = declarations(light);
    const darkDecls = declarations(dark);

    it(`${name} defines no theme-dependent literal in only one mode`, () => {
      const singleModeLiterals = [...lightDecls]
        .filter(([token, value]) => !darkDecls.has(token) && !resolvesThroughAnotherToken(value))
        .filter(([token]) => !MODE_INVARIANT.test(token))
        .map(([token, value]) => `${token}: ${value}`);

      expect(singleModeLiterals).toEqual([]);
    });
  }
});

describe('foundation layer', () => {
  const primitives: Record<string, string> = Object.fromEntries(
    [...foundationLight.matchAll(/^\s*(--n-\d+)\s*:\s*(#[0-9a-fA-F]{6});/gm)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );

  const resolveToken = (block: string, name: string): string => {
    const raw = token(block, name);
    const via = raw.match(/var\((--n-\d+)\)/);
    return via ? (primitives[via[1] as string] as string) : raw;
  };

  const SURFACES = [
    '--surface-page',
    '--surface-subtle',
    '--surface-elevated',
    '--surface-hover',
    '--surface-active',
    '--surface-selected',
  ];
  const TEXTS = ['--text-primary', '--text-secondary', '--text-muted'];
  const STATUS = ['--accent', '--danger', '--warning', '--success', '--info'];

  for (const [themeName, block] of [
    ['light', foundationLight],
    ['dark', foundationDark],
  ] as const) {
    for (const text of TEXTS) {
      it(`${themeName} ${text} meets AA on every surface it can land on`, () => {
        const fg = resolveToken(block, text);
        for (const surface of SURFACES) {
          const bg = resolveToken(block, surface);
          expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      });
    }

    for (const status of STATUS) {
      it(`${themeName} ${status} text meets AA and its on-fill meets AA on the fill`, () => {
        const page = resolveToken(block, '--surface-page');
        expect(contrastRatio(resolveToken(block, `${status}-text`), page)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
        const fill = resolveToken(block, `${status}-fill`);
        expect(
          contrastRatio(resolveToken(block, `${status}-on-fill`), fill),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    it(`${themeName} --rule-strong and --focus-ring clear 3:1 for a control boundary`, () => {
      const page = resolveToken(block, '--surface-page');
      expect(contrastRatio(resolveToken(block, '--rule-strong'), page)).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
      expect(contrastRatio(resolveToken(block, '--focus-ring'), page)).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });

    it(`${themeName} the primary action is legible on itself`, () => {
      expect(
        contrastRatio(
          resolveToken(block, '--action-primary-foreground'),
          resolveToken(block, '--action-primary'),
        ),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${themeName} text roles descend in prominence`, () => {
      const page = resolveToken(block, '--surface-page');
      const on = (t: string): number => contrastRatio(resolveToken(block, t), page);
      expect(on('--text-primary')).toBeGreaterThan(on('--text-secondary'));
      expect(on('--text-secondary')).toBeGreaterThan(on('--text-muted'));
    });
  }

  it('declares no type role below the 12px legibility floor', () => {
    const remSizes = [...foundationLight.matchAll(/--type-[a-z-]+-size:\s*([0-9.]+)rem/g)].map(
      (m) => Number(m[1]),
    );
    expect(remSizes.length).toBeGreaterThan(0);
    for (const rem of remSizes) expect(rem * 16).toBeGreaterThanOrEqual(12);
  });

  it('is the only declaration site for the four shadcn base names', () => {
    for (const name of FOUNDATION_OWNED) {
      expect(token(foundationLight, name), `${name} missing in foundation light`).not.toBe('');
      expect(token(foundationDark, name), `${name} missing in foundation dark`).not.toBe('');
      const declaration = new RegExp(`^\\s*${name}:`, 'm');
      expect(webBase.light, `${name} still declared in the globals.css light block`).not.toMatch(
        declaration,
      );
      expect(webBase.dark, `${name} still declared in the globals.css dark block`).not.toMatch(
        declaration,
      );
    }
  });

  it('is the only declaration site for the dark chat ramp', () => {
    expect(Object.keys(PRIMITIVES).length).toBeGreaterThan(0);
    expect(chatCss, 'chat.css declares a --neutral-* primitive again').not.toMatch(
      /^\s*--neutral-[a-z0-9-]+\s*:/m,
    );
  });

  it('every surface that loads chat.css also loads foundation.css', () => {
    // chat.css resolves its dark palette through the --neutral-* ramp above, so
    // a surface importing one without the other renders dark mode unstyled.
    for (const sheet of ['apps/web/app/globals.css', 'apps/desktop/src/styles/globals.css']) {
      const css = readFileSync(resolve(repoRoot, sheet), 'utf8');
      if (!css.includes('design-tokens/chat.css')) continue;
      expect(css, `${sheet} imports chat.css without foundation.css`).toContain(
        'design-tokens/foundation.css',
      );
    }
  });

  it('owns one radius ladder, ascending, with no duplicate rung', () => {
    const rungs = Object.entries(CORNERS).filter(([name]) => name !== '--corner-pill');
    expect(rungs.length).toBeGreaterThan(1);

    const px = rungs.map(([, value]) => Number.parseFloat(value));
    expect(px, 'a rung is declared out of order').toEqual([...px].sort((a, b) => a - b));
    expect(new Set(px).size, 'two rungs hold the same value').toBe(px.length);
  });

  it('is the only place a radius literal is written', () => {
    // globals.css re-exposes the ladder to Tailwind as --radius-*; a literal
    // there forks the scale, which is what the consolidation removed.
    const themed = [...webBase.light.matchAll(/^\s*(--radius[a-z0-9-]*):\s*([^;]+);/gm)];
    const bridged = [...globalsCss.matchAll(/^\s*(--radius-[a-z0-9]+):\s*([^;]+);/gm)];
    for (const [, name, value] of [...themed, ...bridged]) {
      expect(value!.trim(), `${name} writes a literal instead of a ladder rung`).toMatch(
        /^var\(--corner-[a-z]+\)$/,
      );
    }
  });

  it('defines every semantic role in both themes', () => {
    const roles = [
      ...SURFACES,
      ...TEXTS,
      '--rule',
      '--rule-subtle',
      '--rule-strong',
      '--focus-ring',
    ];
    for (const role of roles) {
      expect(token(foundationLight, role), `${role} missing in light`).not.toBe('');
      expect(token(foundationDark, role), `${role} missing in dark`).not.toBe('');
    }
  });
});

describe('the landing page palette clears AA in both themes', () => {
  const homeBlock = (selector: string): string => {
    const at = globalsCss.indexOf(`${selector} {`);
    if (at === -1) throw new Error(`globals.css declares no ${selector} block`);
    const open = globalsCss.indexOf('{', at);
    const close = globalsCss.indexOf('}', open);
    return globalsCss.slice(open + 1, close);
  };

  const THEMES = {
    dark: homeBlock("[data-design='agi'].agi-home"),
    light: homeBlock(
      "[data-theme='light'] [data-design='agi'].agi-home,\n[data-theme='light'][data-design='agi'].agi-home",
    ),
  };

  const GROUNDS = ['--agi-ground', '--agi-ground-2', '--agi-ground-3'] as const;
  const TEXTS = ['--agi-ink', '--agi-ink-2', '--agi-ink-3', '--agi-accent-text'] as const;
  const LANES = ['local', 'byok', 'cloud'] as const;

  for (const [theme, block] of Object.entries(THEMES)) {
    for (const ground of GROUNDS) {
      const surface = colorToken(block, ground);
      for (const text of TEXTS) {
        it(`${theme}: ${text} on ${ground} >= 4.5:1`, () => {
          expect(contrastRatio(colorToken(block, text), surface)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL,
          );
        });
      }
      for (const lane of LANES) {
        it(`${theme}: --agi-lane-${lane}-text on ${ground} >= 4.5:1`, () => {
          expect(
            contrastRatio(colorToken(block, `--agi-lane-${lane}-text`), surface),
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        });
      }
    }

    for (const fill of ['--agi-accent', '--agi-accent-hover'] as const) {
      it(`${theme}: --agi-accent-ink on ${fill} >= 4.5:1`, () => {
        expect(
          contrastRatio(colorToken(block, '--agi-accent-ink'), colorToken(block, fill)),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    for (const lane of LANES) {
      it(`${theme}: --agi-lane-${lane}-on-primary on --agi-lane-${lane} >= 4.5:1`, () => {
        expect(
          contrastRatio(
            colorToken(block, `--agi-lane-${lane}-on-primary`),
            colorToken(block, `--agi-lane-${lane}`),
          ),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });

      it(`${theme}: the --agi-lane-${lane} mark stays visible on --agi-ground (>= 3:1)`, () => {
        expect(
          contrastRatio(colorToken(block, `--agi-lane-${lane}`), colorToken(block, '--agi-ground')),
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }

    it(`${theme}: the button tokens point at the accent`, () => {
      expect(token(block, '--agi-button-bg')).toBe('var(--agi-accent)');
      expect(token(block, '--agi-button-ink')).toBe('var(--agi-accent-ink)');
    });
  }
});
