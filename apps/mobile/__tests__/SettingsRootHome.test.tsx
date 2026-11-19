import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { AgeGateRecord } from '../src/features/auth/services/ageGate';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockOpenBrowserAsync = jest.fn();
let mockApiUrl = 'https://agiworkforce.com';
let mockAgeRecord: AgeGateRecord | null = null;

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('@/lib/constants', () =>
  Object.defineProperty({ ...jest.requireActual('@/lib/constants') }, 'API_URL', {
    enumerable: true,
    get: () => mockApiUrl,
  }),
);

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null }),
}));

jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return { FEATURES: { ...actual.FEATURES } };
});

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: (
    selector: (state: { status: string; desktopName: string | null }) => unknown,
  ) => selector({ status: 'disconnected', desktopName: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
    back: mockBack,
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.1.0', ios: { buildNumber: '42' } } },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icons: Record<string, jest.Mock> = {};
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        icons[String(name)] ??= jest.fn().mockReturnValue(null);
        return icons[String(name)];
      },
    },
  );
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
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

jest.mock('../src/features/auth/services/ageGate', () => ({
  ...jest.requireActual('../src/features/auth/services/ageGate'),
  readAgeGateRecord: () => mockAgeRecord,
}));

import {
  AccessibilityInfo,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';
import SettingsTabScreen from '../src/features/settings';
import { READING_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';
import { TextScaleBoundary } from '../src/shared/components/TextScaleBoundary';
import { ROW_LABEL_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useAuthStore } from '../src/features/auth/store';
import { useWaitlistStore } from '../src/features/waitlist/store';

const record = (overrides: Partial<AgeGateRecord> = {}): AgeGateRecord => ({
  confirmed: true,
  isMinor: false,
  confirmedAt: '2026-11-01T00:00:00.000Z',
  regionCode: 'DEFAULT',
  threshold: 13,
  ...overrides,
});

function signInToCloud() {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true });
  useWaitlistStore.setState({ cloudUnlocked: true });
}

describe('Settings home header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  it('puts Close on the left, the title in the middle and About AGI on the right', () => {
    const { toJSON } = render(<SettingsTabScreen />);
    const tree = JSON.stringify(toJSON());

    const close = tree.indexOf('"accessibilityLabel":"Close settings"');
    const title = tree.indexOf('"accessibilityRole":"header"');
    const about = tree.indexOf('"accessibilityLabel":"About AGI"');
    expect(close).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(close);
    expect(about).toBeGreaterThan(title);
  });

  it('opens About from the info button without any account or network', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('About AGI'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/about');
  });

  it('draws Close and About AGI as the same 44 point circles', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    for (const label of ['Close settings', 'About AGI']) {
      expect(getByLabelText(label)).toHaveStyle({ width: 44, height: 44, borderRadius: 22 });
    }
  });

  it('keeps Close going back through the history', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Close settings'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Settings home Age', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  it('puts Age after Subscription in the Cloud Account section and opens the screen titled Age', () => {
    mockAgeRecord = record({ threshold: 13 });
    signInToCloud();
    const { getByLabelText, getAllByTestId } = render(<SettingsTabScreen />);

    const order = getAllByTestId(/^settings-row-label-account-/).map((node) => node.props.testID);
    expect(order.indexOf('settings-row-label-account-age')).toBe(
      order.indexOf('settings-row-label-account-subscription') + 1,
    );
    fireEvent.press(getByLabelText('Age. 13 or older'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/settings/parental-controls',
      params: { entry: 'age' },
    });
  });

  it('reads the threshold from the stored record instead of assuming 18', () => {
    mockAgeRecord = record({ threshold: 16 });
    signInToCloud();
    const { getByLabelText, queryByLabelText } = render(<SettingsTabScreen />);

    expect(getByLabelText('Age. 16 or older')).toBeTruthy();
    expect(queryByLabelText(/18 or older/)).toBeNull();
  });

  it('says Under the threshold for a minor and Not set without a record', () => {
    mockAgeRecord = record({ isMinor: true, threshold: 13 });
    signInToCloud();
    const minor = render(<SettingsTabScreen />);
    expect(minor.getByLabelText('Age. Under 13')).toBeTruthy();
    minor.unmount();

    mockAgeRecord = null;
    const unset = render(<SettingsTabScreen />);
    expect(unset.getByLabelText('Age. Not set')).toBeTruthy();
  });

  it('shows the same value on the Parental Controls row in Local, where Account is hidden', () => {
    mockAgeRecord = record({ threshold: 16 });
    const { getByLabelText, queryByText } = render(<SettingsTabScreen />);

    expect(queryByText('Account')).toBeNull();
    fireEvent.press(getByLabelText('Parental Controls. 16 or older'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/parental-controls');
  });

  it('keeps Parental Controls in Device in Cloud as well, beside Age, without repeating the value', () => {
    mockAgeRecord = record({ threshold: 16 });
    signInToCloud();
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Parental Controls'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/parental-controls');
  });
});

describe('Settings home Security and login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  it('renames the Account Security row and keeps its route, value and sign-in redirect', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText, queryByText } = render(<SettingsTabScreen />);

    expect(queryByText('Account Security')).toBeNull();
    fireEvent.press(getByLabelText('Security and login. Sign in'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-account-security' },
    });
  });

  it('opens the account security screen once signed in', () => {
    signInToCloud();
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Security and login'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/account-security');
  });
});

describe('Settings home rows at large text sizes', () => {
  const startingScale = Dimensions.get('window').fontScale;
  const { ChevronRight } = jest.requireMock('lucide-react-native') as Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  afterEach(() => setTextScale(startingScale));

  function renderAt(scale: number) {
    setTextScale(scale);
    return render(
      <TextScaleBoundary>
        <SettingsTabScreen />
      </TextScaleBoundary>,
    );
  }

  const chevronsIn = (node: ReturnType<ReturnType<typeof render>['getByLabelText']>) =>
    node.findAll((child) => child.type === ChevronRight);

  it('keeps the row name on one line beside its value at the default size', () => {
    const screen = renderAt(1);

    const label = screen.getByTestId('settings-row-label-account-security');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.maxFontSizeMultiplier).toBeUndefined();
    expect(screen.queryByTestId('settings-row-text-account-security')).toBeNull();
    expect(chevronsIn(screen.getByLabelText('Security and login. Sign in'))).toHaveLength(1);
  });

  it('puts the value under a whole row name at the largest size and keeps the chevron', () => {
    const screen = renderAt(LARGEST_IOS_TEXT_SCALE);

    for (const key of ['account-security', 'device-integrations', 'personalization']) {
      const label = screen.getByTestId(`settings-row-label-${key}`);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
      expect(
        within(screen.getByTestId(`settings-row-text-${key}`)).getByTestId(label.props.testID),
      ).toBe(label);
    }
    const detail = screen.getByTestId('settings-row-detail-account-security');
    expect(within(detail).getByText('Sign in')).toBeTruthy();
    expect(chevronsIn(screen.getByLabelText('Security and login. Sign in'))).toHaveLength(1);
    expect(chevronsIn(screen.getByLabelText('Device Integrations'))).toHaveLength(1);
  });
});

describe('Settings home search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  const search = (screen: ReturnType<typeof render>, query: string) =>
    fireEvent.changeText(screen.getByLabelText('Search settings'), query);

  it('has a Search settings field at the top of the list', () => {
    const screen = render(<SettingsTabScreen />);

    expect(screen.getByPlaceholderText('Search settings')).toBeTruthy();
  });

  it('lists one row per page with the Settings section it sits in as the subtitle', () => {
    const screen = render(<SettingsTabScreen />);

    search(screen, 'voice');

    expect(screen.getAllByLabelText(/^Voice\. /)).toHaveLength(1);
    expect(screen.getByLabelText('Voice. Device')).toBeTruthy();
    expect(screen.getByLabelText('Voice language. Device')).toBeTruthy();
    expect(screen.queryByText('Support')).toBeNull();
  });

  it('opens the page a result names', () => {
    const screen = render(<SettingsTabScreen />);

    search(screen, 'dark mode');
    fireEvent.press(screen.getByLabelText('Appearance. Device'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/appearance');
  });

  it.each([
    ['dictation', 'Voice. Device'],
    ['read aloud', 'Voice. Device'],
    ['haptics', 'General. Device'],
    ['theme', 'Appearance. Device'],
    ['memory', 'Memory. Assistant'],
    ['delete account', 'Data controls. Assistant'],
    ['age', 'Parental controls. Device'],
    ['permissions', 'Permissions. Device'],
    ['safety', 'Safety & Security. Device'],
    ['accent', 'Accent Color. Device'],
    ['quick access', 'Quick Access. Device'],
    ['help center', 'Help Center. Support'],
    ['export diagnostics', 'Export Diagnostics. Support'],
  ])('finds the page for "%s"', (query, label) => {
    const screen = render(<SettingsTabScreen />);

    search(screen, query);

    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('finds every row drawn on Settings home by its own name, in Local and in Cloud', () => {
    const modes: Array<[string, () => void]> = [
      ['Local', () => undefined],
      [
        'Cloud signed out',
        () => {
          useChatAppModeStore.setState({ appMode: 'cloud' });
          useWaitlistStore.setState({ cloudUnlocked: true });
        },
      ],
      ['Cloud signed in', signInToCloud],
    ];
    for (const [mode, arrange] of modes) {
      arrange();
      const screen = render(<SettingsTabScreen />);
      const labels = screen
        .getAllByTestId(/^settings-row-label-/)
        .filter((node) => node.props.testID !== 'settings-row-label-logout')
        .map((node) => String(node.props.children));
      expect(labels.length).toBeGreaterThan(10);
      for (const label of labels) {
        search(screen, label);
        expect({ mode, label, found: screen.queryByText(/^No settings match/) === null }).toEqual({
          mode,
          label,
          found: true,
        });
      }
      screen.unmount();
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
    }
  });

  it('opens a row that has no page of its own the way the row does', () => {
    signInToCloud();
    const screen = render(<SettingsTabScreen />);

    search(screen, 'email');
    fireEvent.press(screen.getByLabelText('Email. Account'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-account');
  });

  it('does not list a page twice when a row and a destination share its route', () => {
    signInToCloud();
    const screen = render(<SettingsTabScreen />);

    search(screen, 'security');

    expect(screen.getAllByLabelText(/^Security and login\./)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Safety & Security\./)).toHaveLength(1);
  });

  it('never offers Log Out as a search result', () => {
    signInToCloud();
    const screen = render(<SettingsTabScreen />);

    search(screen, 'log out');

    expect(screen.queryByLabelText(/^Log Out/)).toBeNull();
  });

  it('puts the page named age before pages that only contain the letters', () => {
    const screen = render(<SettingsTabScreen />);

    search(screen, 'age');

    const labels = screen
      .getAllByRole('button')
      .map((node) => node.props.accessibilityLabel as string | undefined)
      .filter((label): label is string => label !== undefined && label.endsWith('. Device'));
    expect(labels[0]).toBe('Parental controls. Device');
    expect(labels).toContain('General. Device');
  });

  it('says Checking on a Cloud result while the sign-in state loads', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false });
    const screen = render(<SettingsTabScreen />);

    search(screen, 'password');

    expect(screen.getByLabelText('Security and login. Account. Checking…')).toBeTruthy();
  });

  it('keeps the field and its text usable at the largest text sizes', () => {
    const screen = render(<SettingsTabScreen />);
    const input = screen.getByLabelText('Search settings');

    expect(input.props.maxFontSizeMultiplier).toBe(2);
    expect(JSON.stringify(screen.toJSON())).not.toContain('"height":44,"borderRadius":14');
  });

  it('announces an empty result on iOS, where a live region is not read', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      const screen = render(<SettingsTabScreen />);
      search(screen, 'voice');
      expect(announce).not.toHaveBeenCalled();

      search(screen, 'zzqx');
      expect(announce).toHaveBeenCalledWith('No settings match "zzqx"');

      search(screen, 'zzqxy');
      expect(announce).toHaveBeenCalledTimes(1);
    } finally {
      Platform.OS = original;
      announce.mockRestore();
    }
  });

  it('says nothing matched, in the words the person typed', () => {
    const screen = render(<SettingsTabScreen />);

    search(screen, '  zzqx ');

    expect(screen.getByText('No settings match "zzqx"')).toBeTruthy();
    expect(screen.queryByText('Device')).toBeNull();
  });

  it('restores the normal list when the field is cleared', () => {
    const screen = render(<SettingsTabScreen />);
    search(screen, 'voice');
    expect(screen.queryByText('Support')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear settings search'));

    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByLabelText('Search settings').props.value).toBe('');
    expect(screen.queryByLabelText('Clear settings search')).toBeNull();
  });

  it('never offers a page that needs Cloud while the app is in Local', () => {
    const screen = render(<SettingsTabScreen />);

    search(screen, 'password');

    expect(screen.getByText('No settings match "password"')).toBeTruthy();
    expect(screen.queryByLabelText(/^Security and login/)).toBeNull();
  });

  it('offers Cloud pages in Cloud and sends a signed-out tap to sign-in first', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const screen = render(<SettingsTabScreen />);

    search(screen, 'password');
    fireEvent.press(screen.getByLabelText('Security and login. Account. Sign in'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-account-security' },
    });
  });

  it('opens a Cloud page directly once signed in', () => {
    signInToCloud();
    const screen = render(<SettingsTabScreen />);

    search(screen, 'password');
    fireEvent.press(screen.getByLabelText('Security and login. Account'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/account-security');
  });

  it('leads a search for plan to the Subscription page and names no price', () => {
    signInToCloud();
    const screen = render(<SettingsTabScreen />);

    search(screen, 'plan');

    expect(screen.getByLabelText('Subscription. Account')).toBeTruthy();
    expect(screen.queryByText(/\$|price|upgrade|buy|purchase/i)).toBeNull();
  });
});

describe('Settings home Help Center', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  afterEach(() => {
    mockApiUrl = 'https://agiworkforce.com';
  });

  it('opens help on the web origin the app is configured for, marked as the phone app', async () => {
    mockApiUrl = 'https://staging.agiworkforce.com';
    const screen = render(<SettingsTabScreen />);

    fireEvent.press(screen.getByText('Help Center'));

    await waitFor(() => expect(mockOpenBrowserAsync).toHaveBeenCalledTimes(1));
    const opened = new URL(String(mockOpenBrowserAsync.mock.calls[0]?.[0]));
    expect(opened.origin).toBe('https://staging.agiworkforce.com');
    expect(opened.pathname).toBe('/help');
    expect(opened.searchParams.getAll(EMBEDDED_PAGE_PARAM)).toEqual([EMBEDDED_PAGE_PARAM_VALUE]);
  });

  it('says the link could not open when the origin is not one the app may open', async () => {
    mockApiUrl = 'http://localhost:3000';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<SettingsTabScreen />);

    fireEvent.press(screen.getByText('Help Center'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Error',
        'Could not open the link. Please try again.',
        undefined,
        { cancelable: true },
      ),
    );
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('Settings home on a tablet', () => {
  const startingWindow = Dimensions.get('window');
  const startingScreen = Dimensions.get('screen');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgeRecord = null;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
  });

  afterEach(() => {
    act(() => {
      Dimensions.set({ window: startingWindow, screen: startingScreen });
    });
  });

  it.each([402, 820, 1032, 1376])('holds the list in a 720 point column at %i points', (width) => {
    act(() => {
      Dimensions.set({
        window: { ...startingWindow, width, height: 1376 },
        screen: { ...startingScreen, width, height: 1376 },
      });
    });
    const { UNSAFE_getByType } = render(<SettingsTabScreen />);

    const content = StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle);

    expect(content).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 16,
    });
  });
});
