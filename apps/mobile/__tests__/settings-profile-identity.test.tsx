/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * PAR-M43 / PAR-M44 — settings identity header and the Log Out row.
 *
 * M43: the signed-in account's photo was never rendered on Settings or Profile
 * (only on the Account screen), and the trailing element of the header was a
 * decorative `UserRound` glyph sitting in the slot users read as an affordance.
 * M44: Log Out was the 10th row of the "Cloud" section, gated on the `clerkUser`
 * object (null during Clerk's loading window, so the row flickered), and drew a
 * chevron although it opens a confirm Alert.
 */
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSetProfileImage = jest.fn(async () => ({ id: 'img_1' }));
const mockLaunchImageLibraryAsync = jest.fn();

const mockClerkState: {
  user: null | {
    imageUrl?: string | null;
    fullName?: string | null;
    firstName?: string | null;
    username?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
    setProfileImage?: typeof mockSetProfileImage;
  };
  isLoaded: boolean;
} = { user: null, isLoaded: true };

jest.mock('@clerk/expo', () => ({
  useUser: () => mockClerkState,
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
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

// testID-carrying icons so a subtree can be asserted to contain no glyph.
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => {
    const Icon = (props: Record<string, unknown>) => <RN.View {...props} testID={`icon-${name}`} />;
    Icon.displayName = `Icon(${name})`;
    return Icon;
  };
  const cache = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === '__esModule') return true;
        if (!cache.has(name)) cache.set(name, factory(name));
        return cache.get(name);
      },
    },
  );
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
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
import ProfileScreen from '../app/(app)/profile';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useTierStore } from '../src/features/billing/store';
import { useWaitlistStore } from '../src/features/waitlist/store';

const blankPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default' as const,
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function signInWithPhoto(imageUrl: string | null) {
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true });
  useWaitlistStore.setState({ cloudUnlocked: true });
  mockClerkState.user = {
    imageUrl,
    fullName: 'Ada Lovelace',
    firstName: 'Ada',
    username: null,
    primaryEmailAddress: { emailAddress: 'ada@example.com' },
    setProfileImage: mockSetProfileImage,
  };
  mockClerkState.isLoaded = true;
}

describe('PAR-M43 — profile photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkState.user = null;
    mockClerkState.isLoaded = true;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
    useWaitlistStore.setState({ cloudUnlocked: false });
    useLocalSettingsStore.setState({ personalization: blankPersonalization });
    useCloudSettingsStore.setState({
      personalization: blankPersonalization,
      settingsUpdatedAt: null,
    });
    useTierStore.setState({ tier: 'free', billingTier: 'free', billingStatus: 'none' } as never);
  });

  it('renders the Clerk photo in the settings header when the account has one', () => {
    signInWithPhoto('https://img.clerk.example/ada.jpg');

    const { getByTestId } = render(<SettingsTabScreen />);

    expect(getByTestId('settings-profile-avatar').props.source).toEqual({
      uri: 'https://img.clerk.example/ada.jpg',
    });
  });

  it('falls back to the initial when the account has no photo', () => {
    signInWithPhoto(null);

    const { getByTestId } = render(<SettingsTabScreen />);

    const avatar = within(getByTestId('settings-profile-avatar'));
    expect(avatar.getByText('A')).toBeTruthy();
  });

  it('renders the same photo on the Profile screen instead of a grey letter tile', () => {
    signInWithPhoto('https://img.clerk.example/ada.jpg');

    const { getByTestId } = render(<ProfileScreen />);

    expect(getByTestId('profile-avatar').props.source).toEqual({
      uri: 'https://img.clerk.example/ada.jpg',
    });
  });

  it('drops the decorative trailing glyph from the settings header', () => {
    signInWithPhoto(null);

    const { getByLabelText } = render(<SettingsTabScreen />);

    // The header used to end in a static `UserRound` in the slot users read as
    // "tap here". The card now holds only the avatar, the name and the subtitle.
    const header = within(getByLabelText('Edit profile'));
    expect(header.queryByTestId('icon-UserRound')).toBeNull();
    expect(header.getByText('Ada Lovelace')).toBeTruthy();
  });

  it('offers a photo badge that writes the picked image to the Clerk account', async () => {
    signInWithPhoto(null);
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/pick.jpg', base64: 'QUJD', mimeType: 'image/png' }],
    });

    const { getByLabelText } = render(<SettingsTabScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Change profile photo'));
    });

    await waitFor(() => expect(mockSetProfileImage).toHaveBeenCalledTimes(1));
    expect(mockSetProfileImage).toHaveBeenCalledWith({
      file: 'data:image/png;base64,QUJD',
    });
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true, allowsMultipleSelection: false }),
    );
  });

  it('writes nothing when the picker is cancelled', async () => {
    signInWithPhoto(null);
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    const { getByLabelText } = render(<SettingsTabScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Change profile photo'));
    });

    expect(mockSetProfileImage).not.toHaveBeenCalled();
  });

  it('hides the badge in Local mode, where no account owns the photo', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkSignedIn: true });
    mockClerkState.user = { imageUrl: null, setProfileImage: mockSetProfileImage };

    const { queryByLabelText, getByTestId } = render(<SettingsTabScreen />);

    expect(queryByLabelText('Change profile photo')).toBeNull();
    expect(getByTestId('settings-profile-avatar')).toBeTruthy();
  });

  it('hides the badge for a signed-out Cloud session', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: false });
    mockClerkState.user = null;

    const { queryByLabelText } = render(<SettingsTabScreen />);

    expect(queryByLabelText('Change profile photo')).toBeNull();
  });
});

describe('PAR-M44 — Log Out placement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkState.user = null;
    mockClerkState.isLoaded = true;
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useLocalSettingsStore.setState({ personalization: blankPersonalization });
    useCloudSettingsStore.setState({
      personalization: blankPersonalization,
      settingsUpdatedAt: null,
    });
    useTierStore.setState({ tier: 'free', billingTier: 'free', billingStatus: 'none' } as never);
  });

  it('is the last row on the screen, after the Support section', () => {
    const { getAllByRole } = render(<SettingsTabScreen />);

    const labels = getAllByRole('button')
      .map((node) => node.props.accessibilityLabel)
      .filter((label): label is string => typeof label === 'string');

    expect(labels[labels.length - 1]).toBe('Log Out');
    expect(labels.indexOf('Log Out')).toBeGreaterThan(labels.indexOf('About. v2.1.0'));
    // It must no longer sit inside the Cloud section, i.e. above Connectors.
    expect(labels.indexOf('Log Out')).toBeGreaterThan(labels.indexOf('Connectors. Cloud'));
  });

  it('renders no chevron on the danger row', () => {
    const { getByLabelText } = render(<SettingsTabScreen />);

    const logout = within(getByLabelText('Log Out'));
    expect(logout.queryByTestId('icon-ChevronRight')).toBeNull();
    expect(logout.getByTestId('icon-LogOut')).toBeTruthy();
    // The positive control: a navigating row in the same list still has one.
    const about = within(getByLabelText('About. v2.1.0'));
    expect(about.getByTestId('icon-ChevronRight')).toBeTruthy();
  });

  it('stays put through the Clerk loading window instead of flickering', () => {
    // Clerk resolves `isClerkSignedIn` before the `user` object is populated.
    // Gating on the object made the row appear, vanish and reappear.
    mockClerkState.user = null;
    mockClerkState.isLoaded = false;

    const { getByLabelText, rerender } = render(<SettingsTabScreen />);
    expect(getByLabelText('Log Out')).toBeTruthy();

    mockClerkState.user = {
      imageUrl: null,
      fullName: 'Ada Lovelace',
      primaryEmailAddress: { emailAddress: 'ada@example.com' },
      setProfileImage: mockSetProfileImage,
    };
    mockClerkState.isLoaded = true;
    rerender(<SettingsTabScreen />);

    expect(getByLabelText('Log Out')).toBeTruthy();
  });

  it('is absent for a signed-out session', () => {
    useAuthStore.setState({ isClerkSignedIn: false });

    const { queryByLabelText } = render(<SettingsTabScreen />);

    expect(queryByLabelText('Log Out')).toBeNull();
  });
});
