/**
 * Theme preference tests — C10 (post mode-split)
 *
 * Covers:
 *   - localSettingsStore: themeMode defaults to 'system' and cycles correctly
 *   - lib/theme getColors: dark mode returns dark palette
 *   - lib/theme getColors: light mode returns light palette
 *   - lib/theme getColors: system follows systemScheme
 *   - lib/theme getColors: system falls back to dark when systemScheme is null
 */

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { act } from '@testing-library/react-native';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { getColors, colors, lightColors } from '../src/ui/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useLocalSettingsStore.setState({ themeMode: 'system' });
}

// ---------------------------------------------------------------------------
// localSettingsStore — themeMode
// ---------------------------------------------------------------------------

describe('settingsStore themeMode', () => {
  beforeEach(resetStore);

  it('defaults to system', () => {
    expect(useLocalSettingsStore.getState().themeMode).toBe('system');
  });

  it('setThemeMode switches to light', () => {
    act(() => {
      useLocalSettingsStore.getState().setThemeMode('light');
    });
    expect(useLocalSettingsStore.getState().themeMode).toBe('light');
  });

  it('setThemeMode switches to system', () => {
    act(() => {
      useLocalSettingsStore.getState().setThemeMode('system');
    });
    expect(useLocalSettingsStore.getState().themeMode).toBe('system');
  });

  it('round-trips through all three modes without corruption', () => {
    const { setThemeMode } = useLocalSettingsStore.getState();
    act(() => setThemeMode('light'));
    expect(useLocalSettingsStore.getState().themeMode).toBe('light');
    act(() => setThemeMode('system'));
    expect(useLocalSettingsStore.getState().themeMode).toBe('system');
    act(() => setThemeMode('dark'));
    expect(useLocalSettingsStore.getState().themeMode).toBe('dark');
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
