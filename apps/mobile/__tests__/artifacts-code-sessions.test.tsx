/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ArtifactsGalleryScreen } from '@/src/features/artifacts';
import { useArtifactStore } from '@/src/features/artifacts/store';
import {
  ArchivedCodeSessionsScreen,
  CodeSessionDetailScreen,
  CodeSessionsScreen,
} from '@/src/features/code-sessions';
import { useAuthStore } from '@/src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

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
  useNavigation: () => ({
    getParent: () => ({ dispatch: mockDispatch }),
    dispatch: mockDispatch,
  }),
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
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-a');
    useAuthStore.setState({
      clerkUserId: 'user-a',
      isClerkLoaded: true,
      isClerkSignedIn: true,
    });
    useArtifactStore.setState({
      artifacts: [],
      cloudArtifacts: [],
      cloudArtifactsOwnerId: null,
    });
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

  it('renders canonical cloud artifacts pulled by the sync engine', () => {
    useArtifactStore.setState({
      cloudArtifacts: [
        {
          id: 'cloud-artifact-1',
          type: 'research',
          title: 'Enterprise adoption brief',
          content: '# Enterprise adoption',
          version: 2,
          createdAt: '2026-07-25T10:00:00.000Z',
          updatedAt: '2026-07-26T10:00:00.000Z',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          metadata: {},
          deletedAt: null,
        },
      ],
      cloudArtifactsOwnerId: 'user-a',
    });

    const { getByText } = render(<ArtifactsGalleryScreen />);

    expect(getByText('Enterprise adoption brief')).toBeTruthy();
  });

  it('honors a cloud tombstone over a locally derived artifact with the same canonical id', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'shared-artifact-1',
          title: 'Stale local artifact',
          kind: 'code',
          language: 'typescript',
          content: 'const stale = true;',
          ageLabel: 'just now',
          sourceLabel: 'Chat',
          accentColor: '#21808d',
          previewLines: ['const stale = true;'],
          provenance: { scope: 'cloud', ownerId: 'user-a' },
        },
        {
          id: 'unrelated-local-artifact',
          title: 'Keep this local artifact',
          kind: 'research',
          content: 'Independent research',
          ageLabel: 'just now',
          sourceLabel: 'Local chat',
          accentColor: '#a855f7',
          previewLines: ['Independent research'],
          provenance: { scope: 'local' },
        },
      ],
      cloudArtifacts: [
        {
          id: 'shared-artifact-1',
          type: 'code',
          title: 'Deleted artifact',
          content: '',
          version: 3,
          createdAt: '2026-07-25T10:00:00.000Z',
          updatedAt: '2026-07-26T10:00:00.000Z',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          metadata: {},
          deletedAt: '2026-07-26T11:00:00.000Z',
        },
      ],
      cloudArtifactsOwnerId: 'user-a',
    });

    const { getByText, queryByText } = render(<ArtifactsGalleryScreen />);

    expect(queryByText('Stale local artifact')).toBeNull();
    expect(getByText('Keep this local artifact')).toBeTruthy();
  });

  it('renders a rehydrated durable generated image in the Artifacts panel', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'generated-image-message-1',
          title: 'Image: Enterprise launch',
          kind: 'image',
          language: 'PNG',
          content: '/api/files/22222222-2222-4222-8222-222222222222',
          ageLabel: 'just now',
          sourceLabel: 'AGI Cloud',
          accentColor: '#da7756',
          previewLines: ['Enterprise launch'],
          provenance: { scope: 'cloud', ownerId: 'user-a' },
        },
      ],
    });

    const { getByText, getByTestId } = render(<ArtifactsGalleryScreen />);

    expect(getByTestId('artifact-card-generated-image-message-1')).toBeTruthy();
    expect(getByText('Image: Enterprise launch')).toBeTruthy();
  });

  it('closes an account-A Cloud preview before account B can see it', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'account-a-artifact',
          title: 'Account A private plan',
          kind: 'document',
          content: 'account-a-private-content',
          ageLabel: 'just now',
          sourceLabel: 'AGI Cloud',
          accentColor: '#21808d',
          previewLines: ['account-a-private-content'],
          provenance: { scope: 'cloud', ownerId: 'user-a' },
        },
      ],
    });
    const screen = render(<ArtifactsGalleryScreen />);

    fireEvent.press(screen.getByTestId('artifact-card-account-a-artifact'));
    expect(screen.getByTestId('artifact-preview-content')).toBeTruthy();

    act(() => {
      activateCloudAccount('user-b');
      useAuthStore.setState({ clerkUserId: 'user-b' });
    });

    expect(screen.queryByTestId('artifact-preview-content')).toBeNull();
  });

  it('preserves a Local preview across Cloud account changes', () => {
    useArtifactStore.setState({
      artifacts: [
        {
          id: 'local-artifact',
          title: 'Device-owned plan',
          kind: 'document',
          content: 'local-device-content',
          ageLabel: 'just now',
          sourceLabel: 'Local chat',
          accentColor: '#21808d',
          previewLines: ['local-device-content'],
          provenance: { scope: 'local' },
        },
      ],
    });
    const screen = render(<ArtifactsGalleryScreen />);

    fireEvent.press(screen.getByTestId('artifact-card-local-artifact'));
    expect(screen.getByTestId('artifact-preview-content')).toBeTruthy();

    act(() => {
      activateCloudAccount('user-b');
      useAuthStore.setState({ clerkUserId: 'user-b' });
    });

    expect(screen.getByTestId('artifact-preview-content')).toBeTruthy();
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
    // Was 'AGI Cloud waitlist'. Managed cloud reached public alpha on
    // 2026-06-27 and the invite gate was removed, so this option no longer
    // offers a waitlist — it states where code sessions actually run.
    expect(getByText('Hosted code environments')).toBeTruthy();
  });

  it('renders session-unavailable state for an unknown session id', () => {
    const { getByTestId, getByText } = render(<CodeSessionDetailScreen />);

    expect(getByTestId('code-session-not-found')).toBeTruthy();
    expect(getByText('Session unavailable')).toBeTruthy();
  });
});
