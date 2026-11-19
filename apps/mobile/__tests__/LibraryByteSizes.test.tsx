/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

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

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'cloud' }),
  isAccountScopedUiStateOwned: () => true,
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

jest.mock('../src/features/chat/components/artifact-viewers/DocumentFileView', () => ({
  DocumentFileView: () => null,
}));

jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));

const mockFile = (id: string, fileName: string, byteCount: number | null) => ({
  id,
  kind: 'document',
  fileName,
  mimeType: 'application/zip',
  uri: `/api/library/assets/${id}`,
  byteCount,
  prompt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  sourceLabel: 'Uploaded',
  eraseAfter: null,
  model: null,
  conversationId: null,
});

const mockAssets = [
  mockFile('tiny', 'tiny.zip', 30),
  mockFile('edge', 'edge.zip', 1_048_575),
  mockFile('big', 'big.zip', 15 * 1024 * 1024),
  mockFile('none', 'none.zip', null),
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
    storageUsedBytes: 16_040_000,
    storageLimitBytes: 1024 * 1024 * 1024,
    downloadUsedBytes: 5 * 1024 * 1024,
    downloadLimitBytes: 2 * 1024 * 1024 * 1024,
    refresh: jest.fn(),
    revalidate: jest.fn(),
    loadMore: jest.fn(),
    removeAsset: jest.fn(),
    restoreAsset: jest.fn(),
    permanentlyDeleteAsset: jest.fn(),
  }),
}));

import { formatAttachmentSize } from '../src/features/chat/utils/attachmentSize';
import { LibraryScreen } from '../src/features/library';

describe('Library byte counts', () => {
  it('prints every file size with the formatter the viewer header uses', () => {
    const screen = render(<LibraryScreen />);

    expect(screen.getByText('30 B · Uploaded')).toBeTruthy();
    expect(screen.getByText('1 MB · Uploaded')).toBeTruthy();
    expect(screen.getByText('15 MB · Uploaded')).toBeTruthy();
    expect(screen.getByText('Saved to your account · Uploaded')).toBeTruthy();
  });

  it('prints the storage and download meters with the same formatter', () => {
    const screen = render(<LibraryScreen />);

    expect(screen.getByTestId('library-storage-used')).toHaveTextContent(
      `${formatAttachmentSize(16_040_000)} of 1 GB file storage used`,
    );
    expect(screen.getByTestId('library-storage-used')).toHaveTextContent(
      '15.3 MB of 1 GB file storage used',
    );
    expect(screen.getByTestId('library-downloads-used')).toHaveTextContent(
      '5 MB of 2 GB file downloads used this month',
    );
  });
});
