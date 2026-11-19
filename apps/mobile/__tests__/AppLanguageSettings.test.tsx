import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReloadAppAsync = jest.fn(async (_reason: string) => undefined);
const mockSetLanguage = jest.fn<
  Promise<{ language: string; directionChanged: boolean } | null>,
  [string]
>();
const mockPreference = { value: 'device' };
const mockListeners = new Set<() => void>();

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  reloadAppAsync: (reason: string) => mockReloadAppAsync(reason),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    border: 'border',
    textPrimary: 'primary',
    textSecondary: 'secondary',
    textMuted: 'muted',
    teal: 'teal',
    agentError: 'error',
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('@agiworkforce/i18n');
  return {
    DEVICE_LANGUAGE_PREFERENCE: 'device',
    SELECTABLE_LANGUAGES: actual.SELECTABLE_LANGUAGES,
    getDeviceLanguage: () => 'es',
    setLanguage: (code: string) => mockSetLanguage(code),
    useLanguagePreferenceStore: (selector: (state: { preference: string }) => unknown) => {
      const React = jest.requireActual('react') as typeof import('react');
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        mockListeners.add(force);
        return () => {
          mockListeners.delete(force);
        };
      }, []);
      return selector({ preference: mockPreference.value });
    },
  };
});

jest.mock('../src/features/settings/Common', () => {
  const RN = jest.requireActual('react-native');
  return {
    SettingsScreenShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <RN.View>
        <RN.Text accessibilityRole="header">{title}</RN.Text>
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
  };
});

import AppLanguageScreen from '../src/features/settings/general/AppLanguageScreen';

function applyPreference(code: string) {
  mockPreference.value = code;
  mockListeners.forEach((listener) => listener());
}

describe('App language settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreference.value = 'device';
    mockSetLanguage.mockImplementation(async (code) => {
      applyPreference(code);
      return { language: code === 'device' ? 'es' : code, directionChanged: false };
    });
  });

  it('offers Match device and exactly the selectable languages, with Match device chosen', () => {
    render(<AppLanguageScreen />);

    const options = screen.getAllByRole('radio');
    expect(options.map((o) => o.props.accessibilityLabel)).toEqual([
      'Match device. Español on this device',
      'English. English',
      'Español. Spanish',
    ]);
    expect(options[0].props.accessibilityState.checked).toBe(true);
    expect(options[1].props.accessibilityState.checked).toBe(false);
    expect(screen.getByText(/Voice language is set in Voice/)).toBeTruthy();
  });

  it('applies a chosen language and shows it as selected', async () => {
    render(<AppLanguageScreen />);

    fireEvent.press(screen.getByLabelText('Español. Spanish'));

    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('es'));
    await waitFor(() =>
      expect(screen.getByLabelText('Español. Spanish').props.accessibilityState.checked).toBe(true),
    );
  });

  it('returns to the device language from Match device', async () => {
    mockPreference.value = 'en';
    render(<AppLanguageScreen />);

    fireEvent.press(screen.getByLabelText('Match device. Español on this device'));

    await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith('device'));
  });

  it('does nothing when the current choice is pressed again', () => {
    render(<AppLanguageScreen />);

    fireEvent.press(screen.getByLabelText('Match device. Español on this device'));

    expect(mockSetLanguage).not.toHaveBeenCalled();
  });

  it('reloads the app when the layout direction changes', async () => {
    mockSetLanguage.mockResolvedValue({ language: 'es', directionChanged: true });
    render(<AppLanguageScreen />);

    fireEvent.press(screen.getByLabelText('Español. Spanish'));

    await waitFor(() =>
      expect(mockReloadAppAsync).toHaveBeenCalledWith('Apply app language direction'),
    );
  });

  it('asks for a restart when the reload fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockReloadAppAsync.mockRejectedValueOnce(new Error('no reload'));
    mockSetLanguage.mockResolvedValue({ language: 'es', directionChanged: true });
    render(<AppLanguageScreen />);

    fireEvent.press(screen.getByLabelText('Español. Spanish'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Restart required', expect.any(String)));
    alert.mockRestore();
  });

  it('shows an error when the change fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSetLanguage.mockRejectedValue(new Error('boom'));
    render(<AppLanguageScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Español. Spanish'));
    });

    expect(await screen.findByText('Could not change the language. Try again.')).toBeTruthy();
    warn.mockRestore();
  });
});
