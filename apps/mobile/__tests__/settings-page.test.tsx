import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();
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
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
    back: mockBack,
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
    mockCanGoBack.mockReturnValue(true);
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
    expect(getByText('Shared Links')).toBeTruthy();
    expect(getByText('Account Security')).toBeTruthy();
    expect(getByText('Device Integrations')).toBeTruthy();
    expect(queryByText(/byok/i)).toBeNull();
  });

  it('does not duplicate the Skills catalog or expose an unbuilt Plugins setting', () => {
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

  it('always offers the workspace screen rather than gating it on a local plan guess', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useTierStore.setState({
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
    } as never);

    const freeAccount = render(<SettingsTabScreen />);
    expect(freeAccount.getByText('Workspace')).toBeTruthy();
    freeAccount.unmount();

    useTierStore.setState({
      tier: 'team',
      billingTier: 'team',
      billingStatus: 'active',
    } as never);

    const teamAccount = render(<SettingsTabScreen />);
    expect(teamAccount.getByText('Workspace')).toBeTruthy();
  });

  it('shows cloud rows as sign-in-gated instead of live account controls', () => {
    const { getByText, getAllByText, queryByText } = render(<SettingsTabScreen />);

    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(getByText('Subscription')).toBeTruthy();
    expect(getByText('Connectors')).toBeTruthy();
    expect(getAllByText('Sign in').length).toBeGreaterThan(0);
    expect(queryByText('Log Out')).toBeNull();
    expect(queryByText('Billing')).toBeNull();
  });

  it('shows cloud rows as cloud-gated after invite redemption', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const { getByLabelText, getAllByText, queryByText } = render(<SettingsTabScreen />);

    expect(getByLabelText('Cloud Personalization. Cloud')).toBeTruthy();
    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(queryByText('Sign in')).toBeNull();
  });

  it('does not route to sign-in again after cloud access is unlocked', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Cloud Personalization. Cloud'));

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
    fireEvent.press(getByLabelText('Account Security. Cloud'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/personalization?scope=cloud');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/memory?scope=cloud');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/account-security');
  });

  it('reaches the scope-agnostic Data Controls screen from a single unduplicated row', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    const { getAllByLabelText, getByLabelText } = render(<SettingsTabScreen />);

    expect(getAllByLabelText(/^Data Controls/)).toHaveLength(1);
    fireEvent.press(getByLabelText('Data Controls'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/data-controls');
  });

  it('routes a signed-out cloud row tap to sign-in (public alpha, no invite/waitlist gate)', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Cloud Personalization. Sign in'));
    fireEvent.press(getByLabelText('Shared Links. Sign in'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('opens the existing Shared Links and Device Integrations screens from Settings', () => {
    useAuthStore.setState({ isClerkSignedIn: true });
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Shared Links. Cloud'));
    fireEvent.press(getByLabelText('Device Integrations'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/shared-links');
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/integrations');
  });

  it('routes every signed-out subscription surface to sign-in instead of account data', () => {
    const { getByLabelText, queryAllByLabelText } = render(<SettingsTabScreen />);

    expect(queryAllByLabelText(/^Billing/)).toHaveLength(0);

    fireEvent.press(getByLabelText('Subscription. Sign in'));
    fireEvent.press(getByLabelText('Usage. Sign in'));
    fireEvent.press(getByLabelText('Connectors. Sign in'));

    expect(mockPush).toHaveBeenCalledTimes(3);
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

  it('closes settings back to the screen it was opened from', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Close settings'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes to the chat tab only when there is no history to pop', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText } = render(<SettingsTabScreen />);

    fireEvent.press(getByLabelText('Close settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/(tabs)/chat');
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the close control outside the scrolling list so it cannot scroll away', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    const hostAncestors = (node: ReturnType<typeof getByLabelText>) => {
      const types: string[] = [];
      for (let current = node.parent; current; current = current.parent) {
        if (typeof current.type === 'string') types.push(current.type);
      }
      return types;
    };

    expect(hostAncestors(getByLabelText('Appearance. System'))).toContain('RCTScrollView');
    expect(hostAncestors(getByLabelText('Close settings'))).not.toContain('RCTScrollView');
  });

  it('renders version in About row', () => {
    const { getByText } = render(<SettingsTabScreen />);
    expect(getByText('v2.1.0')).toBeTruthy();
  });
});
