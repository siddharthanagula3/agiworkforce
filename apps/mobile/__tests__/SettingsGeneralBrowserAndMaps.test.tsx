import React from 'react';
import { Modal, Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'disconnected' }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
  }),
  Redirect: ({ href }: { href: string }) => {
    const RN = jest.requireActual('react-native');
    return <RN.Text testID="redirect">{href}</RN.Text>;
  },
}));

jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return { ...actual, FEATURES: { ...actual.FEATURES } };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings:general': 'General',
        'settings:storage': 'Storage',
        'settings:autoCorrectSpelling': 'Auto-correct spelling',
        'settings:defaultEffort': 'Default effort',
      })[key] ?? key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

jest.mock('../src/i18n', () => ({
  DEVICE_LANGUAGE_PREFERENCE: 'device',
  useLanguagePreferenceStore: (selector: (state: { preference: string }) => unknown) =>
    selector({ preference: 'device' }),
}));

import GeneralSettingsScreen from '../src/features/settings/general';
import MapProviderScreen from '../src/features/settings/general/MapProviderScreen';
import { ActionMenuSheet } from '../src/features/conversation-actions/RenameConversationModal';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { FEATURES } from '@/lib/v1FeatureFlags';

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

function chooseFromBrowserMenu(choice: 'system' | 'in-app') {
  const menu = screen
    .UNSAFE_getAllByType(Modal)
    .find((modal) => modal.props.visible && modal.props.onDismiss);
  fireEvent.press(screen.getByTestId(`conversation-action-browser-${choice}`));
  act(() => menu!.props.onDismiss());
}

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform('ios');
  useLocalSettingsStore.setState({ linkBrowser: 'in-app', mapProvider: 'apple' });
});

afterAll(() => {
  setPlatform(originalOS);
});

const features = FEATURES as { appLanguage: boolean; linkBrowser: boolean };
const shipped = { ...FEATURES };

afterEach(() => {
  features.appLanguage = shipped.appLanguage;
  features.linkBrowser = shipped.linkBrowser;
});

describe('General settings Browser row while chat links ignore the choice', () => {
  it('is not offered and draws no browser menu', () => {
    features.linkBrowser = false;
    render(<GeneralSettingsScreen />);

    expect(screen.queryByLabelText(/^Browser/)).toBeNull();
    expect(screen.UNSAFE_queryAllByType(ActionMenuSheet)).toHaveLength(0);
    expect(screen.getByLabelText('Map provider. Apple Maps')).toBeTruthy();
  });
});

describe('General settings Browser row', () => {
  beforeEach(() => {
    features.linkBrowser = true;
  });

  it('shows In-app browser by default', () => {
    render(<GeneralSettingsScreen />);
    expect(screen.getByLabelText('Browser. In-app browser')).toBeTruthy();
  });

  it('offers Default browser and In-app browser with a check on the current one', () => {
    render(<GeneralSettingsScreen />);
    fireEvent.press(screen.getByLabelText('Browser. In-app browser'));

    const defaultBrowser = screen.getByTestId('conversation-action-browser-system');
    const inAppBrowser = screen.getByTestId('conversation-action-browser-in-app');
    expect(defaultBrowser.props.accessibilityLabel).toBe('Default browser');
    expect(inAppBrowser.props.accessibilityLabel).toBe('In-app browser');
    expect(defaultBrowser).not.toBeSelected();
    expect(inAppBrowser).toBeSelected();
  });

  it('saves Default browser for this device and shows it on the row', () => {
    render(<GeneralSettingsScreen />);
    fireEvent.press(screen.getByLabelText('Browser. In-app browser'));
    chooseFromBrowserMenu('system');

    expect(useLocalSettingsStore.getState().linkBrowser).toBe('system');
    expect(screen.getByLabelText('Browser. Default browser')).toBeTruthy();
  });

  it('saves the choice on Android too', async () => {
    setPlatform('android');
    render(<GeneralSettingsScreen />);
    fireEvent.press(screen.getByLabelText('Browser. In-app browser'));
    fireEvent.press(screen.getByTestId('conversation-action-browser-system'));

    await waitFor(() => expect(useLocalSettingsStore.getState().linkBrowser).toBe('system'));
  });
});

describe('General settings Map provider row', () => {
  it('shows the chosen map app on iOS and opens the Map provider page', () => {
    useLocalSettingsStore.setState({ mapProvider: 'google' });
    render(<GeneralSettingsScreen />);

    fireEvent.press(screen.getByLabelText('Map provider. Google Maps'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/map-provider');
  });

  it('is not offered on Android, where the system chooser picks the app', () => {
    setPlatform('android');
    render(<GeneralSettingsScreen />);

    expect(screen.queryByLabelText(/^Map provider/)).toBeNull();
  });
});

describe('Map provider page', () => {
  it('lists Apple Maps and Google Maps with Apple Maps chosen by default', () => {
    render(<MapProviderScreen />);

    const options = screen.getAllByRole('radio');
    expect(options.map((option) => option.props.accessibilityLabel)).toEqual([
      'Apple Maps',
      'Google Maps',
    ]);
    expect(options.map((option) => option.props.accessibilityState.checked)).toEqual([true, false]);
    expect(screen.getByText('Controls which map app opens places from AGI.')).toBeTruthy();
  });

  it('saves Google Maps and moves the check to it', () => {
    render(<MapProviderScreen />);

    fireEvent.press(screen.getByLabelText('Google Maps'));

    expect(useLocalSettingsStore.getState().mapProvider).toBe('google');
    expect(screen.getByLabelText('Google Maps').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Apple Maps').props.accessibilityState.checked).toBe(false);
  });

  it('sends a link to the page back to General on Android', () => {
    setPlatform('android');
    render(<MapProviderScreen />);

    expect(screen.getByTestId('redirect').props.children).toBe('/(app)/settings/general');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('App language row follows the feature flag', () => {
  it('keeps the App language row out of General while the flag is off', () => {
    features.appLanguage = false;
    render(<GeneralSettingsScreen />);

    expect(screen.queryByLabelText(/^App language/)).toBeNull();
    expect(screen.getByLabelText('Map provider. Apple Maps')).toBeTruthy();
  });

  it('shows App language first, with Match device, when the flag is on', () => {
    features.appLanguage = true;
    features.linkBrowser = true;
    render(<GeneralSettingsScreen />);

    const rows = screen.getAllByRole('button').map((row) => row.props.accessibilityLabel);
    expect(rows[rows.indexOf('App language. Match device') + 1]).toBe('Browser. In-app browser');
    fireEvent.press(screen.getByLabelText('App language. Match device'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/app-language');
  });
});
