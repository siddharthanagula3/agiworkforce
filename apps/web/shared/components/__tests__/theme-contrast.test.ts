import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import postcss from 'postcss';
import { describe, it, expect } from 'vitest';

import {
  agiPalette,
  agiCoolPalette,
  agiBrandScale,
  agiChatCssVars,
  agiElevation,
  agiExtensionCssVars,
  agiMobileAccentSwatches,
  agiMobileColors,
  agiMobileHighContrastColors,
  agiRadii,
  agiRadiiVar,
  agiShadows,
  brandScaleVar,
  type AgiBrandFamily,
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

function channels(colour: string): [number, number, number, number] {
  const rgba = colour.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] === undefined ? 1 : Number(rgba[4]),
    ];
  }
  const [r = 0, g = 0, b = 0] = hexToSRGB(colour).map((c) => Math.round(c * 255));
  return [r, g, b, 1];
}

function over(colour: string, ground: string): string {
  const [r, g, b, alpha] = channels(colour);
  const [gr, gg, gb] = channels(ground);
  const blend = (top: number, below: number): string =>
    Math.round(top * alpha + below * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${blend(r, gr)}${blend(g, gg)}${blend(b, gb)}`;
}

function tint(fill: string, share: number, ground: string): string {
  const [r, g, b] = channels(fill);
  return over(`rgba(${r}, ${g}, ${b}, ${share})`, ground);
}

function legibility(text: string, ground: string): number {
  return contrastRatio(over(text, ground), ground);
}

function braceBody(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start === -1) throw new Error(`no block opens with ${opener}`);
  const open = source.indexOf('{', start + opener.length - 1);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unbalanced block after ${opener}`);
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
const tailwindCss = readFileSync(
  resolve(repoRoot, 'packages/ui/design-tokens/src/tailwind.css'),
  'utf8',
);
const foundationCss = readFileSync(
  resolve(repoRoot, 'packages/ui/design-tokens/src/foundation.css'),
  'utf8',
);

const foundationBlock = (selector: string): string => braceBody(foundationCss, `${selector} {`);

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
    if (primitive) return tripleToHex(primitive);
    const neutralStep = foundationLight.match(
      new RegExp(`^\\s*${bare[1]}:\\s*(#[0-9a-f]{3,8});`, 'm'),
    );
    if (neutralStep?.[1]) return neutralStep[1];
    throw new Error(`Unknown primitive ${bare[1]}`);
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

describe('artifact change highlights pair a text role with its own fill', () => {
  for (const [theme, block, bg] of [
    ['light', web.light, LIGHT_BG],
    ['dark', web.dark, DARK_BG],
  ] as const) {
    for (const change of ['--diff-added', '--diff-removed']) {
      it(`${theme}: ${change}-text >= 4.5:1 on ${change}-fill and on --background`, () => {
        const text = colorToken(block, `${change}-text`);
        expect(contrastRatio(text, colorToken(block, `${change}-fill`))).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
        expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    it(`${theme}: added and removed fills differ from each other and from --background`, () => {
      const added = colorToken(block, '--diff-added-fill');
      const removed = colorToken(block, '--diff-removed-fill');
      expect(new Set([added, removed, bg]).size).toBe(3);
    });
  }
});

describe('the sign-in scene draws four bodies on its own panel', () => {
  const BODIES = ['purple', 'black', 'orange', 'yellow'] as const;
  const SHAPE_VISIBLE = 1.3;

  for (const [theme, block] of [
    ['light', web.light],
    ['dark', web.dark],
  ] as const) {
    const panel = colorToken(block, '--auth-scene-panel');
    const face = colorToken(block, '--auth-scene-face');
    const eye = colorToken(block, '--auth-scene-eye');

    it(`${theme}: the panel is its own surface, not the page behind the form`, () => {
      expect(panel).not.toBe(colorToken(block, '--surface-elevated'));
    });

    for (const body of BODIES) {
      it(`${theme}: the ${body} body reads as a shape on the panel (>= ${SHAPE_VISIBLE}:1)`, () => {
        expect(
          contrastRatio(colorToken(block, `--auth-scene-${body}`), panel),
        ).toBeGreaterThanOrEqual(SHAPE_VISIBLE);
      });
    }

    for (const body of ['orange', 'yellow'] as const) {
      it(`${theme}: a dark feature on the ${body} body >= 4.5:1`, () => {
        expect(
          contrastRatio(face, colorToken(block, `--auth-scene-${body}`)),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    for (const body of ['purple', 'black'] as const) {
      it(`${theme}: an eye white on the ${body} body >= 3:1`, () => {
        expect(
          contrastRatio(eye, colorToken(block, `--auth-scene-${body}`)),
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }

    it(`${theme}: a pupil on an eye white >= 4.5:1`, () => {
      expect(contrastRatio(face, eye)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: the purple mouth and closed lids, drawn in the face colour, >= 3:1 on the body`, () => {
      expect(contrastRatio(face, colorToken(block, '--auth-scene-purple'))).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });

    it(`${theme}: the brand wordmark sits on the panel at >= 4.5:1`, () => {
      expect(contrastRatio(colorToken(block, '--text-primary'), panel)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
    });
  }
});

describe('the sign-in form draws on the elevated panel', () => {
  // One dark action carrying the inverse label, quiet provider pills carrying
  // the primary text, an underline beneath each field, and the small text the
  // lifted labels and footer are set in.
  const QUIET_SURFACE = 1.08;
  const SMALL_TEXT = 7;

  for (const [theme, block] of [
    ['light', web.light],
    ['dark', web.dark],
  ] as const) {
    const panel = colorToken(block, '--surface-elevated');
    const onPrimary = colorToken(block, '--auth-primary-on-fill');
    const text = colorToken(block, '--text-primary');

    for (const fill of ['--auth-primary-fill', '--auth-primary-fill-hover'] as const) {
      it(`${theme}: --auth-primary-on-fill on ${fill} >= 4.5:1`, () => {
        expect(contrastRatio(onPrimary, colorToken(block, fill))).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      });

      it(`${theme}: ${fill} reads as a control on the form panel (>= 3:1)`, () => {
        expect(contrastRatio(colorToken(block, fill), panel)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }

    for (const fill of ['--auth-provider-fill', '--auth-provider-fill-hover'] as const) {
      it(`${theme}: --text-primary on ${fill} >= 4.5:1`, () => {
        expect(contrastRatio(text, colorToken(block, fill))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    it(`${theme}: the provider fill is its own quiet surface, distinct from the panel`, () => {
      const fill = colorToken(block, '--auth-provider-fill');
      expect(fill).not.toBe(panel);
      expect(contrastRatio(fill, panel)).toBeGreaterThanOrEqual(QUIET_SURFACE);
      expect(contrastRatio(fill, panel)).toBeLessThan(WCAG_AA_LARGE);
    });

    it(`${theme}: the field underline reads as a boundary on the panel (>= 3:1)`, () => {
      expect(contrastRatio(colorToken(block, '--auth-field-line'), panel)).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });

    it(`${theme}: the scene ground and the form panel read as two surfaces`, () => {
      const ground = colorToken(block, '--auth-scene-panel');
      expect(ground).not.toBe(panel);
      expect(contrastRatio(ground, panel)).toBeGreaterThanOrEqual(QUIET_SURFACE);
    });

    for (const token of ['--text-primary', '--accent-text', '--danger-text'] as const) {
      it(`${theme}: ${token} on the form panel >= 4.5:1`, () => {
        expect(contrastRatio(colorToken(block, token), panel)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      });
    }

    it(`${theme}: --text-secondary, set under 16px for lifted labels and the footer, >= 7:1 on the panel`, () => {
      expect(contrastRatio(colorToken(block, '--text-secondary'), panel)).toBeGreaterThanOrEqual(
        SMALL_TEXT,
      );
    });

    it(`${theme}: a tick on the primary fill reads at >= 4.5:1`, () => {
      expect(
        contrastRatio(onPrimary, colorToken(block, '--auth-primary-fill')),
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

describe('loading tokens', () => {
  // A spinner is non-text content that says something is happening, so it
  // needs 3:1 against every surface it is drawn on. A skeleton fill is a
  // placeholder shape and only has to read as distinct from the page.
  for (const [theme, block] of [
    ['light', chat.light],
    ['dark', chat.dark],
  ] as const) {
    const indicator = colorToken(block, '--chat-loading-indicator');

    it(`${theme}: --chat-loading-indicator on --chat-bg >= 3:1`, () => {
      expect(contrastRatio(indicator, colorToken(block, '--chat-bg'))).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });

    it(`${theme}: --chat-loading-indicator on --chat-surface-elevated >= 3:1`, () => {
      expect(
        contrastRatio(indicator, colorToken(block, '--chat-surface-elevated')),
      ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    });

    it(`${theme}: --chat-loading-placeholder is distinguishable from --chat-bg`, () => {
      expect(
        contrastRatio(
          colorToken(block, '--chat-loading-placeholder'),
          colorToken(block, '--chat-bg'),
        ),
      ).toBeGreaterThan(1);
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

  it('the canonical focus ring has >= 3:1 contrast with dark background', () => {
    const focusRing = colorToken(web.dark, '--focus-ring');
    const ratio = contrastRatio(DARK_BG, focusRing);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it('the canonical focus ring has >= 3:1 contrast with light background', () => {
    const focusRingLight = colorToken(web.light, '--focus-ring');
    const ratio = contrastRatio(LIGHT_BG, focusRingLight);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const ground of ['--popover', '--background']) {
      it(`${theme}: the focus ring on a model picker row clears 3:1 on ${ground} and on the row's muted fill`, () => {
        const ring = colorToken(web[theme], '--focus-ring');
        const surface = colorToken(web[theme], ground);
        const focusedFill = tint(colorToken(web[theme], '--muted'), 0.6, surface);
        expect(contrastRatio(ring, surface)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
        expect(contrastRatio(ring, focusedFill)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }
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

  const BASE = designBlock("[data-design='agi']", '--agi-ground');

  const THEMES = {
    dark: BASE,
    light: designBlock("[data-theme='light'][data-design='agi']", '--agi-ground'),
  };

  const GROUNDS = ['--agi-ground', '--agi-ground-2', '--agi-ground-3'] as const;
  const TEXTS = ['--agi-ink', '--agi-ink-2', '--agi-ink-3', '--agi-accent-text'] as const;
  const LANES = ['local', 'byok', 'cloud'] as const;

  for (const [theme, block] of Object.entries(THEMES)) {
    const ground = colorToken(block, '--agi-ground');
    const ink = colorToken(block, '--agi-ink');

    for (const name of GROUNDS) {
      const surface = colorToken(block, name);

      for (const text of TEXTS) {
        it(`${theme}: ${text} on ${name} >= 4.5:1`, () => {
          expect(contrastRatio(colorToken(block, text), surface)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL,
          );
        });
      }

      for (const lane of LANES) {
        it(`${theme}: --agi-lane-${lane}-text on ${name} >= 4.5:1`, () => {
          expect(
            contrastRatio(colorToken(block, `--agi-lane-${lane}-text`), surface),
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        });
      }
    }

    it(`${theme}: the primary CTA draws --agi-ground on --agi-ink at >= 4.5:1`, () => {
      expect(contrastRatio(ground, ink)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    for (const fill of ['--agi-accent', '--agi-accent-hover'] as const) {
      it(`${theme}: --agi-accent-ink on ${fill} >= 4.5:1`, () => {
        expect(
          contrastRatio(colorToken(block, '--agi-accent-ink'), colorToken(block, fill)),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });
    }

    for (const lane of LANES) {
      const fill = colorToken(block, `--agi-lane-${lane}`);

      it(`${theme}: --agi-lane-${lane}-on-primary on --agi-lane-${lane} >= 4.5:1`, () => {
        expect(
          contrastRatio(colorToken(block, `--agi-lane-${lane}-on-primary`), fill),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      });

      it(`${theme}: the --agi-lane-${lane} mark stays visible on --agi-ground (>= 3:1)`, () => {
        expect(contrastRatio(fill, ground)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      });
    }

    it(`${theme}: the legacy neutral ramp holds no second set of values`, () => {
      expect(token(block, '--agi-bg')).toBe('var(--agi-ground)');
      expect(token(block, '--agi-bg-2')).toBe('var(--agi-ground-2)');
      expect(token(block, '--agi-bg-3')).toBe('var(--agi-ground-3)');
    });
  }

  it('paints the primary button with the ink pair, in one place, for both themes', () => {
    expect(token(BASE, '--agi-button-bg')).toBe('var(--agi-ink)');
    expect(token(BASE, '--agi-button-bg-hover')).toBe('var(--agi-ink-2)');
    expect(token(BASE, '--agi-button-ink')).toBe('var(--agi-ground)');
    expect(THEMES.light).not.toMatch(/--agi-button-(bg|ink)/);
  });

  for (const [theme, block] of Object.entries(THEMES)) {
    it(`${theme}: --agi-button-ink resolves to --agi-ground and clears AA on the --agi-ink fill`, () => {
      expect(
        contrastRatio(colorToken(block, '--agi-ground'), colorToken(block, '--agi-ink')),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it(`${theme}: --agi-amber on the --agi-ink fill stays below AA, so the accent cannot label the selected toggle`, () => {
      expect(
        contrastRatio(colorToken(block, '--agi-amber'), colorToken(block, '--agi-ink')),
      ).toBeLessThan(WCAG_AA_NORMAL);
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
    '--chat-badge-neutral': agiChatCssVars.light['--chat-badge-neutral'],
    '--chat-loading-placeholder': agiChatCssVars.light['--chat-loading-placeholder'],
    '--chat-loading-indicator': agiChatCssVars.light['--chat-loading-indicator'],
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

describe('the brand ramps have one owner', () => {
  const declaredHues = new Map(
    [...foundationLight.matchAll(/^\s*(--hue-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6});/gm)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );

  const mirrored = Object.entries(agiBrandScale).flatMap(([family, ramp]) =>
    Object.entries(ramp).map(
      ([step, value]) => [brandScaleVar(family as AgiBrandFamily, step), value] as const,
    ),
  );

  for (const [name, value] of mirrored) {
    it(`${name} is identical in foundation.css and design-tokens/src/index.ts`, () => {
      expect(declaredHues.get(name)).toBe(value);
    });
  }

  it('declares no --hue-* the TypeScript mirror has dropped', () => {
    const mirroredNames = new Set<string>(mirrored.map(([name]) => name));
    expect([...declaredHues.keys()].filter((name) => !mirroredNames.has(name))).toEqual([]);
  });

  it('resolves every radius size to the foundation rung it names', () => {
    for (const [size, rung] of Object.entries(agiRadiiVar)) {
      expect(agiRadii[size as keyof typeof agiRadii], `${size} is not ${rung}`).toBe(CORNERS[rung]);
    }
  });
});

const MODE_INVARIANT = /(^--(z|neutral)-)|(radius|shadow|font|dur|ease|spacing|blur|width|height)/;
const LENGTH_LITERAL = /^-?\d*\.?\d+(px|rem|em|vh|vw|%)$/;

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
        .filter(([token, value]) => !MODE_INVARIANT.test(token) && !LENGTH_LITERAL.test(value))
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

    for (const status of ['--danger', '--warning', '--success', '--info']) {
      it(`${themeName} ${status}-text meets AA on every surface and on its own 10 percent fill tint`, () => {
        const text = resolveToken(block, `${status}-text`);
        const fill = resolveToken(block, `${status}-fill`);
        for (const surface of [
          '--surface-page',
          '--surface-subtle',
          '--surface-elevated',
          '--surface-hover',
        ]) {
          expect(contrastRatio(text, resolveToken(block, surface))).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL,
          );
        }
        for (const surface of ['--surface-page', '--surface-subtle', '--surface-elevated']) {
          expect(
            contrastRatio(text, tint(fill, 0.1, resolveToken(block, surface))),
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
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

  it('every Tailwind surface that loads chat.css also loads the foundation and shared bridge', () => {
    // chat.css resolves its dark palette through the --neutral-* ramp above, so
    // a surface importing one without the other renders dark mode unstyled.
    for (const sheet of ['apps/web/app/globals.css', 'apps/desktop/src/styles/globals.css']) {
      const css = readFileSync(resolve(repoRoot, sheet), 'utf8');
      if (!css.includes('design-tokens/chat.css')) continue;
      expect(css, `${sheet} imports chat.css without foundation.css`).toContain(
        'design-tokens/foundation.css',
      );
      expect(css, `${sheet} imports chat.css without tailwind.css`).toContain(
        'design-tokens/tailwind.css',
      );
    }
  });

  it('maps Tailwind roles to canonical foundation tokens without restating values', () => {
    const mappings = {
      '--text-caption': 'var(--type-caption-size)',
      '--text-metadata': 'var(--type-metadata-size)',
      '--container-reading': 'var(--measure-prose)',
      '--container-content': 'var(--measure-content)',
      '--container-wide': 'var(--measure-wide)',
      '--spacing-space-3': 'var(--space-3)',
      '--spacing-gutter-compact': 'var(--gutter-compact)',
      '--spacing-gutter-regular': 'var(--gutter-regular)',
      '--spacing-gutter-wide': 'var(--gutter-wide)',
      '--shadow-e1': 'var(--elevation-1)',
      '--shadow-e2': 'var(--elevation-2)',
      '--shadow-e3': 'var(--elevation-3)',
      '--shadow-e4': 'var(--elevation-4)',
    } as const;

    for (const [name, expected] of Object.entries(mappings)) {
      expect(token(tailwindCss, name), `${name} forks its foundation owner`).toBe(expected);
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

describe('the chat focus ring is a visible control boundary (>= 3:1) in both themes', () => {
  const RING_SOURCE = 'var(--focus-ring)';

  it('light', () => {
    expect(token(web.light, '--chat-focus-ring')).toBe(RING_SOURCE);
    expect(
      contrastRatio(colorToken(web.light, '--focus-ring'), CHAT_BG_LIGHT),
    ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it('dark', () => {
    expect(token(web.dark, '--chat-focus-ring')).toBe(RING_SOURCE);
    expect(
      contrastRatio(colorToken(web.dark, '--focus-ring'), CHAT_BG_DARK),
    ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });
});

describe('status colour has no role-less legacy token', () => {
  it('declares no bare success or warning colour that could paint a word with a fill', () => {
    for (const name of ['--color-success', '--color-warning']) {
      expect(globalsCss, `${name} is back in the Tailwind theme`).not.toMatch(
        new RegExp(`^\\s*${name}:`, 'm'),
      );
    }
    for (const block of [webBase.light, webBase.dark]) {
      expect(block).not.toMatch(/^\s*--(success|warning)(-foreground)?:/m);
    }
  });

  it('paints text-destructive-text with the danger text role', () => {
    expect(globalsCss).toMatch(/^\s*--color-destructive-text:\s*var\(--danger-text\);/m);
  });
});

describe('chat status text roles clear AA on every chat surface and on their own tints', () => {
  const coolLight = braceBody(chatCss, "html:not(.dark)[data-chat-theme='cool'] {");
  const SURFACES = [
    '--chat-bg',
    '--chat-surface-elevated',
    '--chat-surface-overlay',
    '--chat-surface-hover',
    '--chat-sidebar-bg',
    '--chat-input-bg',
    '--chat-code-bg',
    '--chat-user-bubble-bg',
  ];
  const grounds = {
    light: [
      ...SURFACES.map((name) => colorToken(chat.light, name)),
      ...SURFACES.map((name) => colorToken(coolLight, name)),
      ...['--chat-bg-elevated', '--chat-sidebar-bg', '--chat-input-bg', '--chat-code-bg'].map(
        (name) => colorToken(webBase.light, name),
      ),
    ],
    dark: SURFACES.map((name) => colorToken(chat.dark, name)),
  };

  for (const [theme, block] of [
    ['light', chat.light],
    ['dark', chat.dark],
  ] as const) {
    for (const [text, fill, shares] of [
      ['--chat-success-text', '--chat-success', [0.1, 0.16]],
      ['--chat-info-text', '--chat-info', [0.12, 0.15]],
    ] as const) {
      it(`${theme}: ${text} >= 4.5:1 on every surface and on a ${fill} tint`, () => {
        const colour = colorToken(block, text);
        const fillColour = colorToken(block, fill);
        for (const ground of grounds[theme]) {
          expect(contrastRatio(colour, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
          for (const share of shares) {
            expect(contrastRatio(colour, tint(fillColour, share, ground))).toBeGreaterThanOrEqual(
              WCAG_AA_NORMAL,
            );
          }
        }
      });
    }

    it(`${theme}: --chat-badge-neutral >= 4.5:1 on --chat-surface-hover`, () => {
      expect(
        contrastRatio(
          colorToken(block, '--chat-badge-neutral'),
          colorToken(block, '--chat-surface-hover'),
        ),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  }
});

describe('code syntax colours clear AA on every code ground', () => {
  const coolLight = braceBody(chatCss, "html:not(.dark)[data-chat-theme='cool'] {");
  const grounds = {
    light: [
      colorToken(chat.light, '--chat-code-bg'),
      colorToken(coolLight, '--chat-code-bg'),
      colorToken(webBase.light, '--chat-code-bg'),
    ],
    dark: [colorToken(chat.dark, '--chat-code-bg'), colorToken(webBase.dark, '--chat-code-bg')],
  };
  const SYNTAX = ['keyword', 'string', 'comment', 'number', 'function', 'type'];

  for (const [theme, block] of [
    ['light', chat.light],
    ['dark', chat.dark],
  ] as const) {
    for (const role of SYNTAX) {
      it(`${theme}: --chat-code-syntax-${role} >= 4.5:1 on the code background`, () => {
        const colour = colorToken(block, `--chat-code-syntax-${role}`);
        for (const ground of grounds[theme]) {
          expect(contrastRatio(colour, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      });
    }
  }
});

describe('the Chrome extension map separates fill, text and on-fill roles', () => {
  const STATES = ['danger', 'success', 'warning', 'info'] as const;

  for (const mode of ['light', 'dark'] as const) {
    const vars = agiExtensionCssVars[mode];
    const surfaces = [
      vars['--agi-ext-bg'],
      vars['--agi-ext-surface'],
      vars['--agi-ext-overlay'],
      vars['--agi-ext-hover'],
    ];
    const tintGrounds = [
      vars['--agi-ext-bg'],
      vars['--agi-ext-surface'],
      vars['--agi-ext-overlay'],
    ];
    const stateTints: Record<(typeof STATES)[number], string[]> = {
      danger: [
        vars['--agi-ext-danger-bg'],
        `rgba(${channels(agiPalette[mode].state.warning).slice(0, 3).join(', ')}, 0.1)`,
      ],
      success: [vars['--agi-ext-success-bg']],
      warning: [vars['--agi-ext-warning-bg']],
      info: [],
    };

    it(`${mode}: --agi-ext-accent-text >= 4.5:1 on every surface and on accent tints up to 20 percent`, () => {
      for (const ground of surfaces) {
        expect(contrastRatio(vars['--agi-ext-accent-text'], ground)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      }
      for (const ground of tintGrounds) {
        for (const share of [0.08, 0.12, 0.2]) {
          expect(
            contrastRatio(
              vars['--agi-ext-accent-text'],
              tint(vars['--agi-ext-accent'], share, ground),
            ),
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      }
    });

    it(`${mode}: accent and danger labels >= 4.5:1 on their fills at rest and on hover`, () => {
      for (const fill of [vars['--agi-ext-accent'], vars['--agi-ext-accent-hover']]) {
        expect(contrastRatio(vars['--agi-ext-on-accent'], fill)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      }
      for (const fill of [vars['--agi-ext-danger'], vars['--agi-ext-danger-hover']]) {
        expect(contrastRatio(vars['--agi-ext-on-danger'], fill)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      }
    });

    for (const state of STATES) {
      it(`${mode}: --agi-ext-${state}-text >= 4.5:1 on every surface and on its tints`, () => {
        const text = vars[`--agi-ext-${state}-text`];
        for (const ground of surfaces) {
          expect(contrastRatio(text, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
        for (const ground of tintGrounds) {
          for (const share of [0.08, 0.1, 0.12]) {
            expect(
              contrastRatio(text, tint(agiPalette[mode].state[state], share, ground)),
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
          }
          for (const layer of stateTints[state]) {
            expect(contrastRatio(text, over(layer, ground))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
          }
        }
      });
    }

    it(`${mode}: --agi-ext-text-placeholder >= 4.5:1 on the grounds a field sits on`, () => {
      for (const ground of tintGrounds) {
        expect(contrastRatio(vars['--agi-ext-text-placeholder'], ground)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      }
    });

    it(`${mode}: --agi-ext-focus is a visible control boundary (>= 3:1)`, () => {
      expect(contrastRatio(vars['--agi-ext-focus'], vars['--agi-ext-bg'])).toBeGreaterThanOrEqual(
        WCAG_AA_LARGE,
      );
    });
  }
});

describe('the mobile palette clears AA in every theme', () => {
  // The palettes live in @agiworkforce/design-tokens (508372fdd2); only the
  // AccentToken union the settings screen offers stays in the mobile theme.
  const tokensTs = readFileSync(resolve(repoRoot, 'apps/mobile/src/ui/theme/tokens.ts'), 'utf8');
  const palettes: Record<string, Record<string, string>> = {
    light: agiMobileColors.light,
    dark: agiMobileColors.dark,
    'high-contrast light': agiMobileHighContrastColors.light,
    'high-contrast dark': agiMobileHighContrastColors.dark,
  };
  const accentNames = [
    ...(tokensTs.match(/export type AccentToken = ([^;]+);/)?.[1] ?? '').matchAll(/'([a-z]+)'/g),
  ].map((m) => m[1]!);
  const swatches: Record<string, { light: string; dark: string }> = agiMobileAccentSwatches;

  const SURFACES = [
    'background',
    'surfaceBase',
    'surfaceElevated',
    'surfaceOverlay',
    'surfaceHover',
  ];
  const TINT_BASES = ['background', 'surfaceBase', 'surfaceElevated'];
  const TEXTS = ['textPrimary', 'textSecondary', 'textMuted'];
  const STATUS_TINTS: Record<string, string> = {
    agentSuccess: 'successSurface',
    agentWarning: 'warningSurface',
    agentError: 'dangerSurface',
    agentActive: 'accentSurface',
    agentThinking: 'purpleSurface',
    purple: 'purpleSurface',
  };
  const STATUS_FILLS = ['agentSuccess', 'agentWarning', 'agentError'];

  it('reads every palette, variant and accent swatch from the source', () => {
    for (const palette of Object.values(palettes)) {
      for (const name of [...SURFACES, ...TEXTS, ...Object.keys(STATUS_TINTS), 'accentText']) {
        expect(palette[name], `${name} not parsed`).toBeDefined();
      }
    }
    expect(accentNames.length).toBeGreaterThan(1);
    for (const name of accentNames.filter((accent) => accent !== 'neutral')) {
      expect(swatches[name], `${name} swatch not parsed`).toBeDefined();
    }
  });

  for (const [name, palette] of Object.entries(palettes)) {
    const colour = (key: string): string => palette[key]!;

    it(`${name}: text roles >= 4.5:1 on every surface`, () => {
      for (const text of TEXTS) {
        for (const surface of SURFACES) {
          expect(
            legibility(colour(text), colour(surface)),
            `${text} on ${surface}`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      }
    });

    it(`${name}: status colours >= 4.5:1 as text on every surface and on their own tint`, () => {
      for (const [status, tintName] of Object.entries(STATUS_TINTS)) {
        for (const surface of SURFACES) {
          expect(
            contrastRatio(colour(status), colour(surface)),
            `${status} on ${surface}`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
        for (const base of TINT_BASES) {
          expect(
            contrastRatio(colour(status), over(colour(tintName), colour(base))),
            `${status} on ${tintName} over ${base}`,
          ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
      }
    });

    it(`${name}: accentText >= 4.5:1 on the accent and on every status fill`, () => {
      for (const fill of ['teal', 'terraCotta', ...STATUS_FILLS]) {
        expect(
          contrastRatio(colour('accentText'), colour(fill)),
          `accentText on ${fill}`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      }
    });
  }

  for (const mode of ['light', 'dark'] as const) {
    const palette = palettes[mode]!;

    for (const accent of accentNames.filter((name) => name !== 'neutral')) {
      it(`${mode}/${accent}: the swatch reads as text and carries accentText as a fill`, () => {
        const swatch = swatches[accent]![mode];
        const grounds = [
          ...SURFACES.map((surface) => palette[surface]!),
          ...TINT_BASES.map((base) => over(palette['accentSurface']!, palette[base]!)),
        ];
        for (const ground of grounds) {
          expect(contrastRatio(swatch, ground)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
        }
        expect(contrastRatio(palette['accentText']!, swatch)).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      });
    }

    it(`${mode}: voice sheet text >= 4.5:1`, () => {
      for (const sheet of ['voiceSheetSurface', 'voiceOverlaySurface']) {
        const ground = over(palette[sheet]!, '#ffffff');
        for (const text of ['voiceTextMuted', 'voiceTextSubtle']) {
          expect(legibility(palette[text]!, ground), `${text} on ${sheet}`).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL,
          );
        }
      }
    });
  }
});

describe('plain source text clears AA on the code surface it is drawn on', () => {
  const coolLight = braceBody(chatCss, "html:not(.dark)[data-chat-theme='cool'] {");

  for (const [theme, text, grounds] of [
    ['light', chat.light, [chat.light, webBase.light]],
    ['cool light', coolLight, [coolLight]],
    ['dark', chat.dark, [chat.dark, webBase.dark]],
  ] as const) {
    it(`${theme}: --chat-code-text >= 4.5:1 on --chat-code-bg`, () => {
      const colour = colorToken(text, '--chat-code-text');
      for (const ground of grounds) {
        expect(contrastRatio(colour, colorToken(ground, '--chat-code-bg'))).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL,
        );
      }
    });
  }
});
