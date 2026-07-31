/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetLanguage = jest.fn<
  Promise<{ language: string; directionChanged: boolean } | null>,
  [string]
>(async (language) => ({ language, directionChanged: false }));
const mockReadLanguage = jest.fn(async () => 'device');
const mockReloadAppAsync = jest.fn(async () => undefined);

jest.mock('expo', () => ({
  reloadAppAsync: (reason: string) => mockReloadAppAsync(reason),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings:general': 'General',
        'settings:language': 'Language',
        'settings:languageDescription': 'Choose your preferred language',
        'settings:storage': 'Storage',
        'common:search': 'Search',
      })[key] ?? key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

jest.mock('../src/i18n', () => ({
  DEVICE_LANGUAGE_PREFERENCE: 'device',
  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true },
  ],
  getDeviceLanguage: () => 'en',
  readStoredLanguagePreference: () => mockReadLanguage(),
  setLanguage: (code: string) => mockSetLanguage(code),
}));

jest.mock('@agiworkforce/i18n', () => ({
  languageFor: (code: string) =>
    code === 'es' ? { code: 'es', nativeName: 'Español' } : { code: 'en', nativeName: 'English' },
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (
    selector: (state: {
      hapticsEnabled: boolean;
      setHapticsEnabled: jest.Mock;
      isTemporaryChat: boolean;
      setTemporaryChat: jest.Mock;
    }) => unknown,
  ) =>
    selector({
      hapticsEnabled: true,
      setHapticsEnabled: jest.fn(),
      isTemporaryChat: false,
      setTemporaryChat: jest.fn(),
    }),
}));

jest.mock('../src/features/settings/common', () => {
  const RN = require('react-native');
  return {
    SettingsScreenShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        {children}
      </RN.View>
    ),
    SettingsInfo: ({ title, body }: { title: string; body: string }) => (
      <RN.View>
        <RN.Text>{title}</RN.Text>
        <RN.Text>{body}</RN.Text>
      </RN.View>
    ),
    SettingsGroup: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    SettingsRow: ({
      label,
      value,
      onPress,
    }: {
      label: string;
      value?: string;
      onPress?: () => void;
    }) => (
      <RN.Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={value ? `${label}. ${value}` : label}
      >
        <RN.Text>{label}</RN.Text>
        {value ? <RN.Text>{value}</RN.Text> : null}
      </RN.Pressable>
    ),
    SettingsSwitchRow: ({ label }: { label: string }) => <RN.Text>{label}</RN.Text>,
  };
});

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    border: '#333333',
    surfaceElevated: '#191919',
    surfaceOverlay: '#222222',
    textMuted: '#888888',
    textSecondary: '#bbbbbb',
    textPrimary: '#ffffff',
    teal: '#2dd4bf',
  }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    BarChart3: icon,
    Box: icon,
    Check: icon,
    HardDrive: icon,
    Languages: icon,
    MessageSquareDashed: icon,
    Search: icon,
    Smartphone: icon,
    Vibrate: icon,
  };
});

import AppLanguageScreen from '../src/features/settings/app-language';
import GeneralSettingsScreen from '../src/features/settings/general';

describe('Mobile app language settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadLanguage.mockResolvedValue('device');
    mockSetLanguage.mockImplementation(async (language) => ({
      language,
      directionChanged: false,
    }));
    mockReloadAppAsync.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('exposes the active app language from General settings', () => {
    const screen = render(<GeneralSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Language. English'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/app-language');
  });

  it('offers Match device and persists an explicit language choice', async () => {
    const screen = render(<AppLanguageScreen />);

    await waitFor(() => expect(mockReadLanguage).toHaveBeenCalled());
    expect(
      screen.getByLabelText('Match device. English on this device').props.accessibilityState,
    ).toEqual(expect.objectContaining({ checked: true }));

    fireEvent.press(screen.getByLabelText('Español. Spanish · ES'));

    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('es'));
    expect(screen.getByLabelText('Español. Spanish · ES').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it('filters the locale list locally by English or native name', async () => {
    const screen = render(<AppLanguageScreen />);
    await waitFor(() => expect(mockReadLanguage).toHaveBeenCalled());

    fireEvent.changeText(screen.getByLabelText('Search app languages'), 'fran');

    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.queryByText('Español')).toBeNull();
    expect(screen.queryByText('Match device')).toBeNull();
  });

  it('reloads the current bundle when the selected language changes layout direction', async () => {
    mockSetLanguage.mockResolvedValueOnce({ language: 'ar', directionChanged: true });
    const screen = render(<AppLanguageScreen />);
    await waitFor(() => expect(mockReadLanguage).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('العربية. Arabic · AR'));

    await waitFor(() => {
      expect(mockReloadAppAsync).toHaveBeenCalledWith('Apply app language direction');
    });
  });

  it('asks for a manual restart when the current host declines a direction reload', async () => {
    mockSetLanguage.mockResolvedValueOnce({ language: 'ar', directionChanged: true });
    mockReloadAppAsync.mockRejectedValueOnce(new Error('Reload unavailable'));
    const screen = render(<AppLanguageScreen />);
    await waitFor(() => expect(mockReadLanguage).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('العربية. Arabic · AR'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Restart required',
        'Close and reopen AGI Workforce to apply the new layout direction.',
      );
    });
  });
});
