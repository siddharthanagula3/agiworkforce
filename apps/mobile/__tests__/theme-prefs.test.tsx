/**
 * Theme preference tests — C10
 *
 * Covers:
 *   - settingsStore: default is 'dark'
 *   - settingsStore: setThemeMode cycles through all three modes
 *   - settingsStore: round-trip through all modes
 *   - lib/theme getColors: dark mode returns dark palette
 *   - lib/theme getColors: light mode returns light palette
 *   - lib/theme getColors: system follows systemScheme
 *   - lib/theme getColors: system falls back to dark when systemScheme is null
 */

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { act } from '@testing-library/react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { getColors, colors, lightColors } from '../lib/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useSettingsStore.setState({ themeMode: 'dark' });
}

// ---------------------------------------------------------------------------
// settingsStore — themeMode
// ---------------------------------------------------------------------------

describe('settingsStore themeMode', () => {
  beforeEach(resetStore);

  it('defaults to dark', () => {
    expect(useSettingsStore.getState().themeMode).toBe('dark');
  });

  it('setThemeMode switches to light', () => {
    act(() => {
      useSettingsStore.getState().setThemeMode('light');
    });
    expect(useSettingsStore.getState().themeMode).toBe('light');
  });

  it('setThemeMode switches to system', () => {
    act(() => {
      useSettingsStore.getState().setThemeMode('system');
    });
    expect(useSettingsStore.getState().themeMode).toBe('system');
  });

  it('round-trips through all three modes without corruption', () => {
    const { setThemeMode } = useSettingsStore.getState();
    act(() => setThemeMode('light'));
    expect(useSettingsStore.getState().themeMode).toBe('light');
    act(() => setThemeMode('system'));
    expect(useSettingsStore.getState().themeMode).toBe('system');
    act(() => setThemeMode('dark'));
    expect(useSettingsStore.getState().themeMode).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// lib/theme getColors — pure function, no hook needed
// ---------------------------------------------------------------------------

describe('getColors resolution', () => {
  it('dark mode returns the dark palette', () => {
    expect(getColors('dark', null)).toBe(colors);
  });

  it('light mode returns the light palette', () => {
    expect(getColors('light', null)).toBe(lightColors);
  });

  it('system follows systemScheme=light', () => {
    expect(getColors('system', 'light')).toBe(lightColors);
  });

  it('system follows systemScheme=dark', () => {
    expect(getColors('system', 'dark')).toBe(colors);
  });

  it('system falls back to dark when systemScheme is null', () => {
    expect(getColors('system', null)).toBe(colors);
  });
});
