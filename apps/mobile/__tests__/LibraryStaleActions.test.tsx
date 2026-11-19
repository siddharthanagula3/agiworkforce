/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: Record<string, unknown>) => <RN.View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return {
    useThemeColors: () => actual.lightColors,
    useTheme: () => ({ colors: actual.lightColors, isDark: false }),
  };
});

jest.mock('../src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (state: { conversations: never[]; messages: object }) => unknown) =>
    selector({ conversations: [], messages: {} }),
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: (
    selector: (state: { conversations: never[]; messages: object }) => unknown,
  ) => selector({ conversations: [], messages: {} }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (state: { appMode: 'local' }) => unknown) =>
    selector({ appMode: 'local' }),
}));

jest.mock('../src/features/artifacts/store', () => ({
  useArtifactStore: (
    selector: (state: {
      artifacts: never[];
      cloudArtifacts: never[];
      cloudArtifactsOwnerId: null;
    }) => unknown,
  ) => selector({ artifacts: [], cloudArtifacts: [], cloudArtifactsOwnerId: null }),
  mergeMobileArtifactsForGallery: () => [],
  accentColorForKind: () => '#fff',
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: null }) => unknown) =>
    selector({ clerkUserId: null }),
}));

let mockAccountOwned = true;
jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'local' }),
  isAccountScopedUiStateOwned: () => mockAccountOwned,
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));

jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));

const mockPrepareVideo = jest.fn();
const mockDownload = jest.fn();
const mockShareFile = jest.fn();
jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: (...args: unknown[]) => mockPrepareVideo(...args),
  downloadGeneratedFile: (...args: unknown[]) => mockDownload(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

const mockVideoModal = jest.fn();
jest.mock('../src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: (props: Record<string, unknown>) => {
    mockVideoModal(props);
    return null;
  },
}));

const mockAssets = [
  {
    id: 'video-1',
    kind: 'video',
    fileName: 'clip.mp4',
    mimeType: 'video/mp4',
    uri: '/api/library/assets/video-1',
    byteCount: 10,
    prompt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceLabel: 'Uploaded',
    eraseAfter: null,
    model: null,
    conversationId: null,
  },
  {
    id: 'doc-1',
    kind: 'document',
    fileName: 'notes.pdf',
    mimeType: 'application/pdf',
    uri: '/api/library/assets/doc-1',
    byteCount: 10,
    prompt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceLabel: 'Uploaded',
    eraseAfter: null,
    model: null,
    conversationId: null,
  },
];

jest.mock('../src/features/library/useLibraryAssets', () => ({
  useLibraryAssets: () => ({
    assets: mockAssets,
    loading: false,
    refreshing: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    showingCachedPage: false,
    signedOut: false,
    storageUsedBytes: null,
    storageLimitBytes: null,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    removeAsset: jest.fn(),
    restoreAsset: jest.fn(),
    permanentlyDeleteAsset: jest.fn(),
  }),
}));

import { LibraryScreen } from '../src/features/library';

const lastVideoModalProps = () => mockVideoModal.mock.calls.at(-1)?.[0] as { visible: boolean };

describe('Library continuations after the account changes', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountOwned = true;
    alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => alert.mockRestore());

  it('opens the prepared video while the account is unchanged', async () => {
    mockPrepareVideo.mockResolvedValue({ uri: 'file:///clip.html' });
    const screen = render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('library-video-card-video-1'));
    });

    expect(lastVideoModalProps().visible).toBe(true);
  });

  it('drops a video prepared for an account that is no longer current', async () => {
    let finish: ((player: unknown) => void) | undefined;
    mockPrepareVideo.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-video-card-video-1'));
    mockAccountOwned = false;
    await act(async () => {
      finish?.({ uri: 'file:///clip.html' });
    });

    expect(lastVideoModalProps().visible).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('stays silent when a video preparation fails after the account changed', async () => {
    let fail: ((error: Error) => void) | undefined;
    mockPrepareVideo.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-video-card-video-1'));
    mockAccountOwned = false;
    await act(async () => {
      fail?.(new Error('offline'));
    });

    expect(alert).not.toHaveBeenCalled();
  });

  it('asks the share step to stand down once the account is no longer current', async () => {
    mockDownload.mockResolvedValue('file:///notes.pdf');
    mockShareFile.mockResolvedValue(undefined);
    const screen = render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('library-document-card-doc-1'));
    });

    const options = mockShareFile.mock.calls[0]?.[1] as { isCurrent: () => boolean };
    expect(options.isCurrent()).toBe(true);
    mockAccountOwned = false;
    expect(options.isCurrent()).toBe(false);
  });

  it('stays silent when a document download fails after the account changed', async () => {
    let fail: ((error: Error) => void) | undefined;
    mockDownload.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-1'));
    mockAccountOwned = false;
    await act(async () => {
      fail?.(new Error('offline'));
    });

    expect(alert).not.toHaveBeenCalled();
  });
});
