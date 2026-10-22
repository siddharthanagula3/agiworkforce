import { render, screen } from '@testing-library/react-native';
import { Switch } from '@/components/ui/switch';
import {
  colors,
  lightColors,
  highContrastColors,
  highContrastLightColors,
  type ColorScheme,
} from '@/src/ui/theme/tokens';

let mockColors: ColorScheme = colors;

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => mockColors,
}));

type Rgb = [number, number, number];

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function opaque(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!hex?.[1]) {
    throw new Error(`Expected an opaque #rrggbb colour, got ${value}`);
  }
  const h = hex[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function ratio(a: string, b: string): number {
  const la = luminance(opaque(a));
  const lb = luminance(opaque(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const NON_TEXT_CONTRAST = 3;

const THEMES = {
  light: lightColors,
  dark: colors,
  'high contrast light': highContrastLightColors,
  'high contrast dark': highContrastColors,
} as const;

const SURFACES = [
  'background',
  'surfaceBase',
  'surfaceElevated',
  'surfaceOverlay',
  'surfaceHover',
] as const;

describe('switch off state meets WCAG 1.4.11 non-text contrast', () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const surface of SURFACES) {
      it(`${themeName}: off track on ${surface}`, () => {
        expect(ratio(theme.switchTrackOff, theme[surface])).toBeGreaterThanOrEqual(
          NON_TEXT_CONTRAST,
        );
      });
    }

    it(`${themeName}: thumb on the off track`, () => {
      expect(ratio(theme.white, theme.switchTrackOff)).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    });
  }
});

describe('Switch paints its off state from the switch track token', () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    it(`${themeName}: off track, iOS background and thumb`, () => {
      mockColors = theme;
      render(<Switch testID="switch" value={false} onValueChange={jest.fn()} />);
      const node = screen.getByTestId('switch');
      expect(node.props.tintColor).toBe(theme.switchTrackOff);
      expect(node.props.onTintColor).toBe(theme.agentSuccess);
      expect(node.props.thumbTintColor).toBe(theme.white);
    });
  }
});
