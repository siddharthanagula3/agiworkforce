export type DeckFont = 'sans' | 'serif' | 'mono';

export interface DeckTheme {
  id: string;
  name: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  headingFont: DeckFont;
  bodyFont: DeckFont;
}

export const DECK_FONT_STACKS: Record<DeckFont, string> = {
  sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  serif: 'var(--font-newsreader), ui-serif, Georgia, serif',
  mono: 'var(--font-jetbrains), ui-monospace, SFMono-Regular, monospace',
};

export const DECK_FONT_LABELS: Record<DeckFont, string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  mono: 'Monospace',
};

export const DECK_THEMES: readonly DeckTheme[] = [
  {
    id: 'paper',
    name: 'Paper',
    background: '#ffffff',
    surface: '#f4f4f5',
    text: '#18181b',
    muted: '#52525b',
    accent: '#1d4ed8',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    background: '#18181b',
    surface: '#27272a',
    text: '#fafafa',
    muted: '#a1a1aa',
    accent: '#7dd3fc',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: '#0b1533',
    surface: '#15224a',
    text: '#f1f5ff',
    muted: '#a9b6d8',
    accent: '#fbbf24',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    background: '#faf7f0',
    surface: '#efe9dc',
    text: '#22201c',
    muted: '#5b554a',
    accent: '#9a3412',
    headingFont: 'serif',
    bodyFont: 'serif',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: '#0f2a22',
    surface: '#173b30',
    text: '#ecf7f2',
    muted: '#a7c7ba',
    accent: '#86efac',
    headingFont: 'serif',
    bodyFont: 'sans',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    background: '#000000',
    surface: '#111111',
    text: '#e5e5e5',
    muted: '#a3a3a3',
    accent: '#4ade80',
    headingFont: 'mono',
    bodyFont: 'mono',
  },
];

export const DEFAULT_DECK_THEME = DECK_THEMES[0]!;
export const CUSTOM_THEME_ID = 'custom';

const HEX = /^#[0-9a-f]{6}$/i;
const FONTS = new Set<DeckFont>(['sans', 'serif', 'mono']);

function readHex(value: string | undefined): string | null {
  return value && HEX.test(value) ? value.toLowerCase() : null;
}

function readFont(value: string | undefined): DeckFont | null {
  return value && FONTS.has(value as DeckFont) ? (value as DeckFont) : null;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export function readableOn(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000')
    ? '#ffffff'
    : '#000000';
}

function mix(hexA: string, hexB: string, weight: number): string {
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const part = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - weight) + ((b >> shift) & 255) * weight);
  return `#${[16, 8, 0].map((shift) => part(shift).toString(16).padStart(2, '0')).join('')}`;
}

export function resolveDeckTheme(meta: Record<string, string>): DeckTheme {
  const id = meta['theme'];
  if (id !== CUSTOM_THEME_ID) {
    return DECK_THEMES.find((theme) => theme.id === id) ?? DEFAULT_DECK_THEME;
  }
  const background = readHex(meta['bg']) ?? DEFAULT_DECK_THEME.background;
  const requestedText = readHex(meta['text']);
  const text =
    requestedText && contrastRatio(requestedText, background) >= 4.5
      ? requestedText
      : readableOn(background);
  const requestedAccent = readHex(meta['accent']);
  const accent =
    requestedAccent && contrastRatio(requestedAccent, background) >= 3 ? requestedAccent : text;
  return {
    id: CUSTOM_THEME_ID,
    name: meta['name'] || 'Brand',
    background,
    surface: mix(background, text, 0.06),
    text,
    muted: mix(text, background, 0.3),
    accent,
    headingFont: readFont(meta['heading']) ?? 'sans',
    bodyFont: readFont(meta['body']) ?? 'sans',
  };
}

export interface DeckBrand {
  name: string;
  background: string;
  text: string;
  accent: string;
  headingFont: DeckFont;
  bodyFont: DeckFont;
}

export function brandThemeMeta(brand: DeckBrand): Record<string, string> {
  return {
    theme: CUSTOM_THEME_ID,
    name: brand.name,
    bg: brand.background,
    text: brand.text,
    accent: brand.accent,
    heading: brand.headingFont,
    body: brand.bodyFont,
  };
}

export function themeMeta(meta: Record<string, string>, themeId: string): Record<string, string> {
  const { bg: _bg, text: _text, accent: _accent, heading: _h, body: _b, name: _n, ...rest } = meta;
  return { ...rest, theme: themeId };
}
