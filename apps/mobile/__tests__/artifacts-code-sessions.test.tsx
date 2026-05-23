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
  useLocalSearchParams: () => ({ id: 'recent-commits-plan' }),
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

  it('renders the loaded Claude-style artifact grid', () => {
    const { getByText, getByTestId } = render(<ArtifactsGalleryScreen />);

    expect(getByText('Artifacts')).toBeTruthy();
    expect(getByText('Get inspired')).toBeTruthy();
    expect(getByTestId('artifacts-grid')).toBeTruthy();
    expect(getByText('STEM OPT Salary Rules for Startup Founders')).toBeTruthy();
  });

  it('renders the gallery skeleton when loading', () => {
    const { getByTestId, queryByTestId } = render(<ArtifactsGalleryScreen initialLoading />);

    expect(getByTestId('artifacts-skeleton-grid')).toBeTruthy();
    expect(queryByTestId('artifacts-grid')).toBeNull();
  });

  it('opens a preview modal for received artifacts', () => {
    const { getByTestId, getByText } = render(<ArtifactsGalleryScreen />);

    fireEvent.press(getByTestId('artifact-card-stem-opt-salary-rules'));

    expect(getByText('Artifact preview')).toBeTruthy();
    expect(getByTestId('artifact-preview-content')).toBeTruthy();
  });
});

describe('Code Sessions screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  it('renders idle and archived code sessions and navigates to detail', () => {
    const { getByText, getByTestId } = render(<CodeSessionsScreen />);

    expect(getByText('Code')).toBeTruthy();
    expect(getByText('Idle')).toBeTruthy();
    expect(getByText('Archived')).toBeTruthy();

    fireEvent.press(getByTestId('code-session-row-recent-commits-plan'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/code/recent-commits-plan');
  });

  it('renders archived sessions without the idle section', () => {
    const { getByText, queryByText } = render(<ArchivedCodeSessionsScreen />);

    expect(getByText('Archived')).toBeTruthy();
    expect(queryByText('Idle')).toBeNull();
  });

  it('opens the remote environment options from the new-session button', () => {
    const { getByTestId, getByText } = render(<CodeSessionsScreen />);

    fireEvent.press(getByTestId('code-new-session'));

    expect(getByTestId('code-environment-sheet')).toBeTruthy();
    expect(getByText('Use AGI Desktop')).toBeTruthy();
    expect(getByText('Cloud Managed waitlist')).toBeTruthy();
  });

  it('opens the code session mode selector', () => {
    const { getAllByText, getByTestId, getByText } = render(<CodeSessionDetailScreen />);

    expect(getByText('Implement plan from recent commits')).toBeTruthy();
    expect(getByText('Connecting')).toBeTruthy();

    fireEvent.press(getByTestId('code-mode-button'));
    expect(getByTestId('code-mode-sheet')).toBeTruthy();
    expect(getByText('Plan')).toBeTruthy();
    expect(getAllByText('Code').length).toBeGreaterThan(0);
  });

  it('opens the code session more menu', () => {
    const { getByTestId, getByText } = render(<CodeSessionDetailScreen />);

    fireEvent.press(getByTestId('code-more-button'));
    expect(getByTestId('code-more-menu')).toBeTruthy();
    expect(getByText('Copy branch')).toBeTruthy();
    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Archive')).toBeTruthy();
  });
});
