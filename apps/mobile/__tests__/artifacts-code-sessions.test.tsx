/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Share } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ArtifactsGalleryScreen } from '@/src/features/artifacts';
import {
  ArchivedCodeSessionsScreen,
  CodeSessionDetailScreen,
  CodeSessionsScreen,
} from '@/src/features/code-sessions';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockMarkWaitlistJoined = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: jest.fn().mockReturnValue(true),
  }),
  useNavigation: () => ({
    getParent: () => ({ dispatch: mockDispatch }),
    dispatch: mockDispatch,
  }),
  useLocalSearchParams: () => ({ id: 'nonexistent-session' }),
}));

jest.mock('@react-navigation/native', () => ({
  DrawerActions: {
    openDrawer: jest.fn(() => ({ type: 'OPEN_DRAWER' })),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');

  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    terraCotta: '#da7756',
    teal: '#21808d',
    warmPeach: '#f3b99d',
    background: '#20211f',
    surfaceBase: '#20211f',
    surfaceElevated: '#171817',
    surfaceOverlay: '#242424',
    surfaceHover: '#30312f',
    textPrimary: '#f4f1ea',
    textSecondary: 'rgba(244, 241, 234, 0.75)',
    textMuted: 'rgba(244, 241, 234, 0.5)',
    border: 'rgba(255,255,255,0.12)',
    borderLight: 'rgba(255,255,255,0.06)',
    charcoal900: '#1f2121',
    charcoal800: '#2a2c2c',
    charcoal700: '#363838',
    agentThinking: '#a855f7',
    agentActive: '#3b82f6',
    agentSuccess: '#10b981',
    agentError: '#ef4444',
    agentWarning: '#f59e0b',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
  }),
}));

jest.mock('@/src/features/waitlist', () => {
  return {
    joinWaitlist: jest.fn().mockResolvedValue({ rank: 0 }),
    useWaitlistStore: (
      selector: (state: { markJoined: typeof mockMarkWaitlistJoined }) => unknown,
    ) => selector({ markJoined: mockMarkWaitlistJoined }),
  };
});

jest.mock('@/src/features/cloud-bridge', () => {
  const { View } = require('react-native');

  return {
    InviteCodeModal: ({ open }: { open: boolean }) =>
      open ? <View testID="invite-code-modal" /> : null,
  };
});

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

describe('Artifacts gallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  it('renders the artifact grid with empty state when store is empty', () => {
    const { getByText, getByTestId } = render(<ArtifactsGalleryScreen />);

    expect(getByText('Artifacts')).toBeTruthy();
    expect(getByTestId('artifacts-grid')).toBeTruthy();
    expect(getByTestId('artifacts-empty-state')).toBeTruthy();
    expect(getByText('No artifacts yet')).toBeTruthy();
  });

  it('renders the gallery skeleton when loading', () => {
    const { getByTestId, queryByTestId } = render(<ArtifactsGalleryScreen initialLoading />);

    expect(getByTestId('artifacts-skeleton-grid')).toBeTruthy();
    expect(queryByTestId('artifacts-grid')).toBeNull();
  });
});

describe('Code Sessions screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  it('renders the empty state when there are no code sessions', () => {
    const { getByText, getByTestId } = render(<CodeSessionsScreen />);

    expect(getByText('Code')).toBeTruthy();
    expect(getByTestId('code-sessions-empty-state')).toBeTruthy();
    expect(getByText('No code sessions yet')).toBeTruthy();
  });

  it('renders archived screen with empty state', () => {
    const { getByTestId } = render(<ArchivedCodeSessionsScreen />);

    expect(getByTestId('code-sessions-empty-state')).toBeTruthy();
  });

  it('opens the remote environment options from the new-session button', () => {
    const { getByTestId, getByText } = render(<CodeSessionsScreen />);

    fireEvent.press(getByTestId('code-new-session'));

    expect(getByTestId('code-environment-sheet')).toBeTruthy();
    expect(getByText('Use AGI Desktop')).toBeTruthy();
    expect(getByText('Cloud Managed waitlist')).toBeTruthy();
  });

  it('renders session-unavailable state for an unknown session id', () => {
    const { getByTestId, getByText } = render(<CodeSessionDetailScreen />);

    expect(getByTestId('code-session-not-found')).toBeTruthy();
    expect(getByText('Session unavailable')).toBeTruthy();
  });
});
