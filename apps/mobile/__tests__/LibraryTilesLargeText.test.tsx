/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { chooseActionMenuItem } from '@/test-utils/actionMenu';
import { fireEvent, render } from '@testing-library/react-native';

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

let mockImageReady = false;
jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () =>
    mockImageReady
      ? { source: { uri: 'https://example.test/sunrise.png' }, status: 'ready' }
      : { source: null, status: 'authorizing' },
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

jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));

const baseAsset = {
  mimeType: 'application/octet-stream',
  prompt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  sourceLabel: 'From a chat',
  eraseAfter: null,
  model: null,
  conversationId: null,
};

const mockAssets = [
  {
    ...baseAsset,
    id: 'doc-1',
    kind: 'document',
    fileName: 'quarterly-planning-notes-final-version.pdf',
    uri: '/api/library/assets/doc-1',
    byteCount: 2048,
  },
  {
    ...baseAsset,
    id: 'vid-1',
    kind: 'video',
    fileName: 'walkthrough.mp4',
    uri: '/api/library/assets/vid-1',
    byteCount: 4096,
  },
  {
    ...baseAsset,
    id: 'img-1',
    kind: 'image',
    fileName: 'sunrise.png',
    uri: '/api/library/assets/img-1',
    byteCount: 1024,
    prompt: 'A sunrise over the sea',
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
import { HEADER_TEXT_SCALE_LIMIT } from '../src/ui/theme/tokens';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

function flatStyle(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style as never) ?? {};
}

function imageFrame(screen: ReturnType<typeof render>) {
  const card = screen.getByTestId('library-image-card-img-1');
  const [frame] = card.findAll(
    (node) =>
      typeof flatStyle(node).width === 'number' &&
      typeof flatStyle(node).height === 'number' &&
      flatStyle(node).borderColor !== undefined,
  );
  return frame;
}

describe('Library tiles at large text sizes', () => {
  const startingScale = Dimensions.get('window').fontScale;

  afterEach(() => setTextScale(startingScale));

  describe.each([
    ['the default text size', 1],
    ['the largest text size', LARGEST_IOS_TEXT_SCALE],
  ])('at %s', (_name, scale) => {
    beforeEach(() => setTextScale(scale));

    it.each([
      ['document', 'doc-1', 'Document'],
      ['video', 'vid-1', 'Video'],
    ])('keeps everything in a %s tile inside the tile', (kind, id, label) => {
      const screen = render(<LibraryScreen />);

      const tile = screen.getByTestId(`library-${kind}-tile-${id}`);
      expect(flatStyle(tile).overflow).toBe('hidden');
      expect(flatStyle(tile).paddingTop).toBeUndefined();
      expect(flatStyle(tile).padding).toBeUndefined();

      const content = screen.getByTestId(`library-${kind}-tile-content-${id}`);
      expect(flatStyle(content).position).toBeUndefined();
      expect(flatStyle(content).flexShrink).toBe(1);

      expect(screen.getByText(label).props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    });

    it('draws no kind pill or icon on an image tile', () => {
      const screen = render(<LibraryScreen />);

      expect(screen.queryByText('Image')).toBeNull();
      expect(screen.queryByTestId('library-image-kind-row-img-1')).toBeNull();
      const frame = imageFrame(screen);
      expect(
        frame.findAll(
          (node) =>
            flatStyle(node).position === 'absolute' ||
            /\babsolute\b/.test(String(node.props.className)),
        ),
      ).toHaveLength(0);
    });

    it('lets the picture fill the whole image tile', () => {
      mockImageReady = true;
      try {
        const screen = render(<LibraryScreen />);

        const frame = imageFrame(screen);
        const picture = screen.getByLabelText('A sunrise over the sea');
        expect(picture.props.contentFit).toBe('cover');
        expect(flatStyle(picture)).toMatchObject({
          width: flatStyle(frame).width,
          height: flatStyle(frame).height,
        });
        expect(screen.queryByText('Image')).toBeNull();
      } finally {
        mockImageReady = false;
      }
    });

    it.each([
      ['document', 'doc-1'],
      ['video', 'vid-1'],
    ])('draws the file name inside a %s tile only when text is not enlarged', (kind, id) => {
      const screen = render(<LibraryScreen />);

      const name = screen.queryByTestId(`library-${kind}-tile-name-${id}`);
      if (scale > 1) {
        expect(name).toBeNull();
        const fileName = kind === 'document' ? mockAssets[0].fileName : mockAssets[1].fileName;
        expect(screen.getAllByText(fileName)).toHaveLength(1);
        return;
      }
      expect(name).not.toBeNull();
      expect(flatStyle(name!).flexShrink).toBe(1);
      expect(flatStyle(name!).overflow).toBe('hidden');
      const text = name!.findAll((node) => node.type === 'Text')[0];
      expect(text.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(text.props.numberOfLines).toBe(2);
    });

    it('caps the placeholder text inside an image tile', () => {
      const screen = render(<LibraryScreen />);

      const placeholder = screen.getByText('Loading image…');
      expect(placeholder.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(placeholder.props.numberOfLines).toBe(3);
    });

    it('keeps the storage line to two capped lines', () => {
      const screen = render(<LibraryScreen />);

      const storage = screen.getByTestId('library-storage-used');
      expect(storage.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(storage.props.numberOfLines).toBe(2);
    });

    it('lets the selection actions wrap onto a second line', () => {
      const screen = render(<LibraryScreen />);

      fireEvent.press(screen.getByLabelText('Library options'));
      chooseActionMenuItem('Select saved files');

      const row = screen.getByTestId('library-selection-buttons');
      expect(flatStyle(row).flexWrap).toBe('wrap');
    });
  });
});
