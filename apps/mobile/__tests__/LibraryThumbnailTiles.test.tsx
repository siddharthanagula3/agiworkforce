/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { chooseActionMenuItem } from '@/test-utils/actionMenu';
import { act, fireEvent, render, within } from '@testing-library/react-native';

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

const mockAccountOwned = true;
jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'cloud' }),
  isAccountScopedUiStateOwned: () => mockAccountOwned,
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));

const mockRequestedUris: string[] = [];
jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (uri: string) => {
    mockRequestedUris.push(uri);
    return { source: { uri }, status: 'ready' };
  },
}));

const mockPreviewUrls: (string | null)[] = [];
jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: ({ imageUrl }: { imageUrl: string | null }) => {
    mockPreviewUrls.push(imageUrl);
    return null;
  },
}));

jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));

jest.mock('../src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: () => null,
}));

jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));

const baseAsset = {
  kind: 'image',
  mimeType: 'image/png',
  createdAt: '2026-10-01T00:00:00.000Z',
  sourceLabel: 'From a chat',
  eraseAfter: null,
  model: null,
  conversationId: null,
  byteCount: 1024,
};

const mockAssets = [
  {
    ...baseAsset,
    id: 'with-thumbnail',
    fileName: 'sunrise.png',
    prompt: 'A sunrise over the sea',
    uri: '/api/files/with-thumbnail',
    thumbnailUri: '/api/files/with-thumbnail/thumbnail',
  },
  {
    ...baseAsset,
    id: 'without-thumbnail',
    fileName: 'harbour.png',
    prompt: 'A harbour at night',
    uri: '/api/files/without-thumbnail',
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
    storageUsedBytes: 5 * 1024 * 1024,
    storageLimitBytes: 100 * 1024 * 1024,
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

import { LibraryScreen } from '../src/features/library';
import { TextScaleBoundary } from '../src/shared/components/TextScaleBoundary';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

describe('Library image tiles draw the thumbnail', () => {
  beforeEach(() => {
    mockRequestedUris.length = 0;
    mockPreviewUrls.length = 0;
  });

  it('asks for the thumbnail and never the full file while a thumbnail loads', () => {
    const screen = render(<LibraryScreen />);

    expect(screen.getByLabelText('A sunrise over the sea').props.source.uri).toBe(
      '/api/files/with-thumbnail/thumbnail',
    );
    expect(mockRequestedUris).not.toContain('/api/files/with-thumbnail');
  });

  it('draws the full file once when the thumbnail fails to load', () => {
    const screen = render(<LibraryScreen />);

    fireEvent(screen.getByLabelText('A sunrise over the sea'), 'error');

    expect(screen.getByLabelText('A sunrise over the sea').props.source.uri).toBe(
      '/api/files/with-thumbnail',
    );
    mockRequestedUris.length = 0;
    fireEvent(screen.getByLabelText('A sunrise over the sea'), 'error');
    expect(screen.queryByLabelText('A sunrise over the sea')).toBeNull();
    expect(
      within(screen.getByTestId('library-image-card-with-thumbnail')).getByText(
        'Image unavailable',
      ),
    ).toBeTruthy();
    expect(mockRequestedUris.every((uri) => uri === '/api/files/with-thumbnail')).toBe(true);
  });

  it('draws the full file for a picture the server sent no thumbnail for', () => {
    const screen = render(<LibraryScreen />);

    const picture = screen.getByLabelText('A harbour at night');
    expect(picture.props.source.uri).toBe('/api/files/without-thumbnail');
    fireEvent(picture, 'error');
    expect(screen.queryByLabelText('A harbour at night')).toBeNull();
    const card = screen.getByTestId('library-image-card-without-thumbnail');
    const unavailable = within(card).getByText('Image unavailable');
    expect(unavailable.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    expect(
      within(screen.getByTestId('library-image-card-with-thumbnail')).queryByText(
        'Image unavailable',
      ),
    ).toBeNull();
  });

  it('opens the picture from the full file, not the thumbnail', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-image-card-with-thumbnail'));

    expect(mockPreviewUrls[mockPreviewUrls.length - 1]).toBe('/api/files/with-thumbnail');
  });
});

describe('Library grid at large text sizes', () => {
  const PHONE_WIDTH = 393;
  const startingWindow = Dimensions.get('window');

  afterEach(() => {
    act(() => {
      Dimensions.set({ window: startingWindow, screen: startingWindow });
    });
  });

  const tileWidthAt = (scale: number) => {
    act(() => {
      const window = { ...startingWindow, width: PHONE_WIDTH };
      Dimensions.set({ window, screen: window });
    });
    setTextScale(scale);
    const screen = render(
      <TextScaleBoundary>
        <LibraryScreen />
      </TextScaleBoundary>,
    );
    const card = screen.getByTestId('library-image-card-with-thumbnail');
    const width = StyleSheet.flatten(card.props.style).width as number;
    screen.unmount();
    return width;
  };

  it('keeps two tiles a row on a phone at the default size', () => {
    expect(tileWidthAt(1)).toBeLessThan(PHONE_WIDTH / 2);
  });

  it('gives each tile the whole row on a phone at the largest size', () => {
    const twoColumns = tileWidthAt(1);
    const largest = tileWidthAt(LARGEST_IOS_TEXT_SCALE);

    expect(largest).toBeGreaterThan(PHONE_WIDTH / 2);
    expect(largest).toBeGreaterThan(twoColumns * 2);
  });
});
