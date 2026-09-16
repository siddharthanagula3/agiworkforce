import {
  colors,
  lightColors,
  highContrastColors,
  highContrastLightColors,
} from '@/src/ui/theme/tokens';

/**
 * Mobile measured contrast only for code syntax, so the rest of the palette was
 * unguarded and `textMuted` shipped at 3.28:1 in light theme, on 11px and 12px
 * labels. The web side has enforced this from its stylesheet for a while; this
 * is the same rule on the tokens the native app actually renders.
 */
type Rgb = [number, number, number];

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parse(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex?.[1]) {
    const h = hex[1];
    return {
      rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)],
      alpha: 1,
    };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgba?.[1]) {
    const parts = rgba[1].split(',').map((part) => Number(part.trim()));
    const [r = 0, g = 0, b = 0, a = 1] = parts;
    return { rgb: [r, g, b], alpha: a };
  }
  throw new Error(`Unreadable colour: ${value}`);
}

/** A token with alpha is only as readable as what sits behind it. */
function ratio(foreground: string, background: string): number {
  const fg = parse(foreground);
  const bg = parse(background);
  const composited = fg.rgb.map((c, i) => c * fg.alpha + (bg.rgb[i] ?? 0) * (1 - fg.alpha)) as Rgb;
  const a = luminance(composited);
  const b = luminance(bg.rgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const THEMES = {
  light: lightColors,
  dark: colors,
  'high contrast light': highContrastLightColors,
  'high contrast dark': highContrastColors,
} as const;

const SURFACES = ['background', 'surfaceBase', 'surfaceElevated', 'surfaceOverlay'] as const;
const TEXT = ['textPrimary', 'textSecondary', 'textMuted'] as const;

describe('every text token is readable on every surface it can sit on', () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        it(`${themeName}: ${text} on ${surface}`, () => {
          // The test name carries the pair and the default message carries the
          // measured ratio, which together say what failed and by how much.
          expect(ratio(theme[text], theme[surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
