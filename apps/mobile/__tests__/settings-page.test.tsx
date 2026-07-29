import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockClerkState: {
  user: null | {
    fullName?: string | null;
    firstName?: string | null;
    username?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
  };
} = { user: null };

jest.mock('@clerk/expo', () => ({
  useUser: () => mockClerkState,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '2.1.0',
      ios: { buildNumber: '42' },
    },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Proxy, not a hand-listed map: a screen adding one more lucide icon should not
// blow up unrelated assertions with "Cannot read properties of undefined".
jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === '__esModule' ? true : icon),
    },
  );
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
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

import SettingsTabScreen from '../app/(app)/(tabs)/settings';
import { useSettingsStore } from '../stores/settingsStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useTierStore } from '../src/features/billing/store';
import { useAuthStore } from '../src/features/auth/store';

describe('Settings page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkState.user = null;
    useSettingsStore.setState({ themeMode: 'system', accentColor: 'neutral' });
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
    useTierStore.setState({
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      grantedCapabilities: [],
    } as never);
    useWaitlistStore.setState({
      joined: false,
      email: undefined,
      country: undefined,
      rank: undefined,
      joinedAt: undefined,
      cloudUnlocked: false,
      inviteId: undefined,
      inviteCode: undefined,
      cloudUnlockedAt: undefined,
    });
  });

  it('renders the new settings information architecture', () => {
    const { getByText, getAllByText, queryByText } = render(<SettingsTabScreen />);

    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Device')).toBeTruthy();
    expect(getByText('Local Mode')).toBeTruthy();
    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(getByText('Personalization')).toBeTruthy();
    expect(getByText('Memory')).toBeTruthy();
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Accent Color')).toBeTruthy();
    expect(getByText('General')).toBeTruthy();
    expect(getByText('Capabilities')).toBeTruthy();
    expect(getByText('Safety & Security')).toBeTruthy();
    expect(getByText('Data Controls')).toBeTruthy();
    expect(getByText('Parental Controls')).toBeTruthy();
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('has no dead-end settings entries — unbuilt Skills/Plugins removed (MOB-6)', () => {
    // MOB-6: Skills and Plugins were stub entries whose screens were never built
    // (they only opened a cloud gate — a dead-end). They are removed until a real
    // mobile management surface exists, so the settings nav has no dead-ends.
    const { queryByText } = render(<SettingsTabScreen />);
    expect(queryByText('Skills')).toBeNull();
    expect(queryByText('Plugins')).toBeNull();
    expect(queryByText('Restore purchases')).toBeNull();
  });

  it('does not use local personalization as the Cloud settings identity', () => {
    useSettingsStore.setState({
      personalization: {
        fullName: 'Siddhartha Local',
        nickname: 'Sid',
        occupation: 'Founder',
        instructions: '',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
    });
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText, queryByText } = render(<SettingsTabScreen />);

    expect(getByText('AGI Cloud')).toBeTruthy();
    expect(getByText('Sign in required')).toBeTruthy();
    expect(queryByText('Sid')).toBeNull();
    expect(queryByText('Founder')).toBeNull();
    expect(getByText('Cloud Personalization')).toBeTruthy();
    expect(getByText('Cloud Memory')).toBeTruthy();
  });

  it('shows Clerk name/email on the first Cloud render without waiting for a reload', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    mockClerkState.user = {
      fullName: 'Ada Lovelace',
      firstName: 'Ada',
      primaryEmailAddress: { emailAddress: 'ada@example.com' },
    };

    const { getAllByText, getByText } = render(<SettingsTabScreen />);

    expect(getByText('Ada Lovelace')).toBeTruthy();
    expect(getAllByText('ada@example.com').length).toBeGreaterThan(0);
    expect(getByText('Log Out')).toBeTruthy();
  });

  it('gives Team and Enterprise accounts a visible web administration handoff', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useTierStore.setState({
      tier: 'team',
      billingTier: 'team',
      billingStatus: 'active',
    } as never);

    const { getByLabelText } = render(<SettingsTabScreen />);

    expect(getByLabelText('Workspace administration. Web')).toBeTruthy();
  });

  it('shows cloud rows as sign-in-gated instead of live account controls', () => {
    const { getByText, getAllByText, queryByText } = render(<SettingsTabScreen />);

    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(getByText('Billing')).toBeTruthy();
    expect(getByText('Connectors')).toBeTruthy();
    // (Skills/Plugins rows removed in MOB-6 — they were unbuilt dead-ends.)
    expect(getAllByText('Sign in').length).toBeGreaterThan(0);
    expect(queryByText('Log Out')).toBeNull();
  });

  it('shows cloud rows as cloud-gated after invite redemption', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const { getByLabelText, getAllByText } = render(<SettingsTabScreen />);

    expect(getByLabelText('Cloud Data Controls. Cloud')).toBeTruthy();
    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
  });

  it('does not route to sign-in again after cloud access is unlocked', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Cloud Data Controls. Cloud'));

    expect(mockPush).not.toHaveBeenCalledWith('/(auth)/login');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('routes unlocked Cloud rows to their real screens instead of a dead-end alert', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Cloud Personalization. Cloud'));
    fireEvent.press(getByLabelText('Cloud Memory. Cloud'));
    fireEvent.press(getByLabelText('Cloud Data Controls. Cloud'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/personalization?scope=cloud');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/memory?scope=cloud');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/data-controls');
  });

  it('routes a signed-out cloud row tap to sign-in (public alpha, no invite/waitlist gate)', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Cloud Data Controls. Sign in'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('routes every signed-out subscription surface to sign-in instead of account data', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Subscription. Sign in'));
    fireEvent.press(getByLabelText('Billing. Sign in'));
    fireEvent.press(getByLabelText('Usage. Sign in'));
    fireEvent.press(getByLabelText('Connectors. Sign in'));

    expect(mockPush).toHaveBeenCalledTimes(4);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('navigates to real local settings routes', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Appearance. System'));
    fireEvent.press(getByLabelText('Capabilities'));
    fireEvent.press(getByLabelText('Data Controls'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/appearance');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/capabilities');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/data-controls');
  });

  it('closes settings back to chat', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Close settings'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('renders version in About row', () => {
    const { getByText } = render(<SettingsTabScreen />);
    expect(getByText('v2.1.0')).toBeTruthy();
  });
});
