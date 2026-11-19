import { renderHook } from '@testing-library/react-native';
import { agiMobileAccentSwatches, agiMobileColors } from '@agiworkforce/design-tokens';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { accentTokenFrom, getAccentSwatch } from '../src/ui/theme/tokens';
import { useTheme } from '../src/ui/theme/useTheme';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../src/ui/theme/useSystemHighContrast', () => ({
  useSystemHighContrast: () => false,
}));

const ORDER = [
  'neutral',
  'blue',
  'cyan',
  'green',
  'lime',
  'yellow',
  'orange',
  'rose',
  'magenta',
  'violet',
];
const TEXT_CONTRAST = 4.5;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

describe('accent swatches', () => {
  it('lists the ten accents in the order of the settings page', () => {
    expect(Object.keys(agiMobileAccentSwatches)).toEqual(ORDER);
  });

  it.each(ORDER)('gives %s a light and a dark value that are hex colours', (token) => {
    const swatch = agiMobileAccentSwatches[token as keyof typeof agiMobileAccentSwatches];
    expect(swatch.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch.dark).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(ORDER)('keeps the label on a %s fill at 4.5:1 in light and dark', (token) => {
    const accent = accentTokenFrom(token);
    expect(
      contrast(agiMobileColors.light.accentText, getAccentSwatch(accent, false)),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(
      contrast(agiMobileColors.dark.accentText, getAccentSwatch(accent, true)),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it.each(ORDER)('keeps %s readable as text on the page in light and dark', (token) => {
    const accent = accentTokenFrom(token);
    expect(
      contrast(getAccentSwatch(accent, false), agiMobileColors.light.background),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(
      contrast(getAccentSwatch(accent, true), agiMobileColors.dark.background),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('puts the pale accents on a dark label in dark mode', () => {
    for (const token of ['lime', 'yellow'] as const) {
      expect(luminance(getAccentSwatch(token, true))).toBeGreaterThan(
        luminance(agiMobileColors.dark.accentText),
      );
      expect(agiMobileColors.dark.accentText).toBe(agiMobileColors.dark.background);
    }
  });

  it('falls back to neutral for a colour this version does not know', () => {
    expect(accentTokenFrom('chartreuse')).toBe('neutral');
    expect(accentTokenFrom(undefined)).toBe('neutral');
    expect(accentTokenFrom('toString')).toBe('neutral');
    expect(accentTokenFrom('yellow')).toBe('yellow');
  });
});

describe('useTheme accent', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ themeMode: 'light', accentColor: 'neutral' });
    useCloudSettingsStore.setState({ themeMode: 'dark', accentColor: 'neutral' });
  });

  it('keeps the base palette for Neutral', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.teal).toBe(agiMobileColors.light.teal);
    expect(result.current.colors.accentText).toBe(agiMobileColors.light.accentText);
  });

  it('paints the fill and the label that sits on it from the saved accent', () => {
    useLocalSettingsStore.setState({ accentColor: 'yellow' });
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.teal).toBe(getAccentSwatch('yellow', false));
    expect(result.current.colors.terraCotta).toBe(getAccentSwatch('yellow', false));
    expect(
      contrast(result.current.colors.accentText, result.current.colors.teal),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('reads the accent saved for the active mode', () => {
    useLocalSettingsStore.setState({ accentColor: 'lime' });
    useCloudSettingsStore.setState({ accentColor: 'orange' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.colors.teal).toBe(getAccentSwatch('orange', true));
    expect(
      contrast(result.current.colors.accentText, result.current.colors.teal),
    ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('shows Neutral for an unknown stored colour', () => {
    useLocalSettingsStore.setState({ accentColor: 'chartreuse' as never });
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.teal).toBe(agiMobileColors.light.teal);
  });
});
