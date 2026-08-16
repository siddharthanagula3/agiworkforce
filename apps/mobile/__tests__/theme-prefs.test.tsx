

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

import { act } from '@testing-library/react-native';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import {
  getColors,
  colors,
  highContrastColors,
  highContrastLightColors,
  lightColors,
} from '../src/ui/theme';

function resetStore() {
  useLocalSettingsStore.setState({ themeMode: 'system' });
}

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

  it('uses the dark high-contrast palette when dark mode is active', () => {
    expect(getColors('dark', null, true)).toBe(highContrastColors);
    expect(highContrastColors.textSecondary).toBe('#ffffff');
    expect(highContrastColors.border).toBe('#ffffff');
  });

  it('uses the light high-contrast palette when light mode is active', () => {
    expect(getColors('system', 'light', true)).toBe(highContrastLightColors);
    expect(highContrastLightColors.textSecondary).toBe('#000000');
    expect(highContrastLightColors.border).toBe('#000000');
  });
});
