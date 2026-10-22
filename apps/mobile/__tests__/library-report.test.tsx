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
  return { useThemeColors: () => actual.lightColors };
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

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'local' }),
  isAccountScopedUiStateOwned: () => true,
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

const mockImageFullScreen = jest.fn();
jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockImageFullScreen(props);
    return null;
  },
}));

const mockReportSheetProps = jest.fn();
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheetProps(props);
    return null;
  },
}));

const mockAssets = [
  {
    id: 'img-1',
    kind: 'image',
    fileName: 'fox.png',
    mimeType: 'image/png',
    uri: '/api/library/assets/img-1',
    byteCount: 10,
    prompt: 'a red fox',
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceLabel: 'Generated',
    eraseAfter: null,
    model: 'image-model',
    conversationId: 'conv-1',
  },
  {
    id: 'upload-1',
    kind: 'image',
    fileName: 'holiday.jpg',
    mimeType: 'image/jpeg',
    uri: '/api/library/assets/upload-1',
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

type AlertButton = { text: string; onPress?: () => void };

describe('Library report', () => {
  beforeEach(() => mockReportSheetProps.mockClear());

  it('reports a generated image with its asset reference', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);

    fireEvent(screen.getByTestId('library-image-card-img-1'), 'longPress');
    const options = alert.mock.calls.at(-1)?.[2] as AlertButton[];
    act(() => options.find((option) => option.text === 'Report')?.onPress?.());

    expect(mockReportSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        target: expect.objectContaining({
          messageId: 'img-1',
          conversationId: 'conv-1',
          contentExcerpt: 'a red fox',
          asset: { kind: 'image', url: expect.stringMatching(/\/api\/library\/assets\/img-1$/) },
        }),
      }),
    );
    alert.mockRestore();
  });

  it('does not offer Report on a photo the user uploaded', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<LibraryScreen />);

    fireEvent(screen.getByTestId('library-image-card-upload-1'), 'longPress');
    const options = alert.mock.calls.at(-1)?.[2] as AlertButton[];

    expect(options.map((option) => option.text)).not.toContain('Report');
    alert.mockRestore();
  });

  it('lets the image viewer report a generated image, but not an upload', () => {
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('library-image-card-img-1'));
    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        reportTarget: expect.objectContaining({ messageId: 'img-1' }),
      }),
    );

    fireEvent.press(screen.getByTestId('library-image-card-upload-1'));
    expect(mockImageFullScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true, reportTarget: undefined }),
    );
  });
});
