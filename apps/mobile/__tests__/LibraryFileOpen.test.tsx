/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { actionMenuLabels, chooseActionMenuItem } from '@/test-utils/actionMenu';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
  useRouter: () => ({ push: mockPush }),
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
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
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
  useChatAppModeStore: (selector: (state: { appMode: 'cloud' }) => unknown) =>
    selector({ appMode: 'cloud' }),
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
  captureAccountScopedUiState: () => ({ scope: 'cloud' }),
  isAccountScopedUiStateOwned: () => mockAccountOwned,
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
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

jest.mock('../src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: () => null,
}));

const mockDocumentView = jest.fn();
jest.mock('../src/features/chat/components/artifact-viewers/DocumentFileView', () => ({
  DocumentFileView: (props: Record<string, unknown>) => {
    const RN = require('react-native');
    mockDocumentView(props);
    return <RN.View testID="document-file-view" />;
  },
}));

const mockDownload = jest.fn();
const mockShareFile = jest.fn();
jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: (...args: unknown[]) => mockDownload(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

const mockAssets = [
  {
    id: 'doc-1',
    kind: 'document',
    fileName: 'notes.pdf',
    mimeType: 'application/pdf',
    uri: '/api/library/assets/doc-1',
    byteCount: 2048,
    prompt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceLabel: 'From a chat',
    eraseAfter: null,
    model: null,
    conversationId: 'conv-1',
  },
  {
    id: 'doc-2',
    kind: 'document',
    fileName: 'upload.zip',
    mimeType: 'application/zip',
    uri: '/api/library/assets/doc-2',
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
    downloadUsedBytes: null,
    downloadLimitBytes: null,
    refresh: jest.fn(),
    revalidate: jest.fn(),
    loadMore: jest.fn(),
    removeAsset: jest.fn(),
    restoreAsset: jest.fn(),
    permanentlyDeleteAsset: jest.fn(),
  }),
}));

import { API_URL } from '../lib/constants';
import { LibraryScreen } from '../src/features/library';

const assetUrl = (id: string) => `${API_URL.replace(/\/+$/, '')}/api/library/assets/${id}`;

describe('Library files open in the app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountOwned = true;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => jest.mocked(Alert.alert).mockRestore());

  it('opens a PDF in the file viewer instead of the share sheet', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-1'));

    expect(screen.getByTestId('file-viewer-screen')).toBeTruthy();
    expect(screen.getByTestId('document-file-view')).toBeTruthy();
    expect(mockDocumentView.mock.calls.at(-1)?.[0]).toMatchObject({
      source: {
        origin: 'file',
        title: 'notes.pdf',
        fileName: 'notes.pdf',
        mimeType: 'application/pdf',
        url: assetUrl('doc-1'),
        byteCount: 2048,
      },
    });
    expect(screen.getByText('2 KB')).toBeTruthy();
    expect(mockShareFile).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('shares the opened file under its own name from the viewer header', async () => {
    mockDownload.mockResolvedValue('file:///library/notes.pdf');
    mockShareFile.mockResolvedValue(undefined);
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-1'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Share notes.pdf'));
    });

    expect(mockDownload).toHaveBeenCalledWith(assetUrl('doc-1'), 'notes.pdf');
    expect(mockShareFile).toHaveBeenCalledTimes(1);
    expect(mockShareFile).toHaveBeenCalledWith('file:///library/notes.pdf', {
      isCurrent: expect.any(Function),
    });
    const { isCurrent } = mockShareFile.mock.calls[0]?.[1] as { isCurrent: () => boolean };
    expect(isCurrent()).toBe(true);
    mockAccountOwned = false;
    expect(isCurrent()).toBe(false);
  });

  it('offers Share for a file the app cannot draw', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-2'));

    expect(screen.getByTestId('file-viewer-unsupported')).toBeTruthy();
    expect(screen.getByText('Preview isn’t available for this file type.')).toBeTruthy();
    expect(mockDocumentView).not.toHaveBeenCalled();
  });

  it('closes the viewer from its close control', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-1'));
    fireEvent.press(screen.getAllByLabelText('Close file')[0]!);

    expect(screen.queryByTestId('file-viewer-screen')).toBeNull();
  });

  it('opens the chat a file came from', () => {
    const screen = render(<LibraryScreen />);

    fireEvent(screen.getByTestId('library-document-card-doc-1'), 'longPress');
    expect(actionMenuLabels()).toContain('Open chat');
    chooseActionMenuItem('Open chat');

    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
  });

  it('opens the source chat from the open viewer, closing the viewer first', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-1'));
    fireEvent.press(screen.getByTestId('file-viewer-open-chat'));

    expect(screen.queryByTestId('file-viewer-screen')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
  });

  it('shows no Open chat in the viewer for a file that came from no chat', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-document-card-doc-2'));

    expect(screen.getByTestId('file-viewer-screen')).toBeTruthy();
    expect(screen.queryByTestId('file-viewer-open-chat')).toBeNull();
  });

  it('offers no Open chat for a file that came from no chat', () => {
    const screen = render(<LibraryScreen />);

    fireEvent(screen.getByTestId('library-document-card-doc-2'), 'longPress');

    expect(actionMenuLabels()).toContain('Share');
    expect(actionMenuLabels()).not.toContain('Open chat');
  });
});
