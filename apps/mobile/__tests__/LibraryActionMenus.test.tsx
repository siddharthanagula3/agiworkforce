/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  actionMenuLabels,
  actionMenuRowColor,
  actionMenuTitle,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';

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

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: () => ({ source: null, status: 'ready' }),
}));

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));

const mockReportSheetProps = jest.fn();
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheetProps(props);
    return null;
  },
}));

const mockStageAttachments = jest.fn();
jest.mock('../src/features/chat/composerHandoff', () => ({
  ...jest.requireActual('../src/features/chat/composerHandoff'),
  stageComposerAttachments: (...args: unknown[]) => mockStageAttachments(...args),
}));

const mockEnterMediaMode = jest.fn(() => true);
jest.mock('../src/features/chat/actions/mediaMode', () => ({
  ...jest.requireActual('../src/features/chat/actions/mediaMode'),
  enterMediaMode: (...args: unknown[]) => mockEnterMediaMode(...(args as [])),
  listMediaModels: () => [],
}));

const mockDownload = jest.fn();
const mockShareFile = jest.fn();
jest.mock('../services/fileCreation', () => ({
  ...jest.requireActual('../services/fileCreation'),
  downloadGeneratedFile: (...args: unknown[]) => mockDownload(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
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
];

const mockRemoveAsset = jest.fn();
const mockRestoreAsset = jest.fn();
const mockPermanentlyDeleteAsset = jest.fn();
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
    removeAsset: mockRemoveAsset,
    restoreAsset: mockRestoreAsset,
    permanentlyDeleteAsset: mockPermanentlyDeleteAsset,
  }),
}));

import { LibraryScreen } from '../src/features/library';
import { FileDownloadError } from '../services/fileCreation';

const ITEM_ACTIONS = ['Add to chat', 'Remix', 'Open chat', 'Share', 'Report', 'Delete'];

function lastAlertButtons(alert: jest.SpyInstance): AlertButton[] {
  return (alert.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
}

describe.each(['ios', 'android'] as const)('Library menus on %s', (os) => {
  let alert: jest.SpyInstance;
  let platform: jest.ReplaceProperty<typeof Platform.OS>;

  beforeEach(() => {
    jest.useFakeTimers();
    platform = jest.replaceProperty(Platform, 'OS', os);
    jest.clearAllMocks();
    mockRemoveAsset.mockResolvedValue(undefined);
    mockRestoreAsset.mockResolvedValue(undefined);
    mockPermanentlyDeleteAsset.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue('file:///fox.png');
    mockShareFile.mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    alert.mockRestore();
    platform.restore();
    jest.useRealTimers();
  });

  function openItemMenu() {
    const screen = render(<LibraryScreen />);
    fireEvent(screen.getByTestId('library-image-card-img-1'), 'longPress');
    return screen;
  }

  it('lists every item action in its order in the app sheet, with Delete in the destructive colour', () => {
    openItemMenu();

    expect(alert).not.toHaveBeenCalled();
    expect(actionMenuTitle()).toBe('fox.png');
    expect(actionMenuLabels()).toEqual(ITEM_ACTIONS);
    expect(actionMenuRowColor('Delete')).not.toBe(actionMenuRowColor('Share'));
  });

  it('adds the image to a new chat', () => {
    openItemMenu();
    chooseActionMenuItem('Add to chat');

    expect(mockStageAttachments).toHaveBeenCalledWith('new-chat', [
      expect.objectContaining({ assetId: 'img-1', fileName: 'fox.png' }),
    ]);
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('remixes the image in image mode', () => {
    openItemMenu();
    chooseActionMenuItem('Remix');

    expect(mockEnterMediaMode).toHaveBeenCalledWith('image');
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/chat');
  });

  it('opens the chat the image came from', () => {
    openItemMenu();
    chooseActionMenuItem('Open chat');

    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/conv-1');
  });

  it('shares the downloaded file', async () => {
    openItemMenu();
    chooseActionMenuItem('Share');
    await act(async () => {});

    expect(mockShareFile).toHaveBeenCalledWith('file:///fox.png', expect.anything());
  });

  it('says a file above the download limit is too large instead of asking to try again', async () => {
    mockDownload.mockRejectedValue(new FileDownloadError(413));
    openItemMenu();
    chooseActionMenuItem('Share');
    await act(async () => {});

    expect(mockShareFile).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Could not open this file',
      'This file is too large to open on this device.',
    );
  });

  it('keeps the download copy for a failure with nothing more to say', async () => {
    mockDownload.mockRejectedValue(new Error('disk full'));
    openItemMenu();
    chooseActionMenuItem('Share');
    await act(async () => {});

    expect(alert).toHaveBeenCalledWith(
      'Could not open this file',
      'The file could not be downloaded. Try again.',
    );
  });

  it('opens the report sheet for the image', () => {
    openItemMenu();
    chooseActionMenuItem('Report');

    expect(mockReportSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        target: expect.objectContaining({ messageId: 'img-1' }),
      }),
    );
  });

  it('asks before Delete, names where the file goes, and deletes only on Delete', () => {
    openItemMenu();
    chooseActionMenuItem('Delete');

    expect(alert).toHaveBeenLastCalledWith(
      'Delete from Library?',
      '“fox.png” moves to deleted items.',
      expect.any(Array),
    );
    const buttons = lastAlertButtons(alert);
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete']);
    expect(mockRemoveAsset).not.toHaveBeenCalled();
    act(() => buttons.find((button) => button.text === 'Delete')?.onPress?.());
    expect(mockRemoveAsset).toHaveBeenCalledWith('img-1');
  });

  it('closes on Cancel without running anything', () => {
    openItemMenu();
    cancelActionMenu();

    expect(isActionMenuOpen()).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('offers Select, Sort and Recently deleted, then Restore and Delete permanently there', () => {
    const screen = render(<LibraryScreen />);
    fireEvent.press(screen.getByLabelText('Library options'));

    expect(actionMenuLabels()).toEqual([
      'Select saved files',
      'Sort saved files',
      'Recently deleted',
    ]);
    chooseActionMenuItem('Recently deleted');
    fireEvent(screen.getByTestId('library-image-card-img-1'), 'longPress');

    expect(actionMenuLabels()).toEqual(['Restore', 'Delete permanently']);
    expect(actionMenuRowColor('Delete permanently')).not.toBe(actionMenuRowColor('Restore'));
    chooseActionMenuItem('Delete permanently');
    expect(alert).toHaveBeenLastCalledWith(
      'Delete permanently?',
      '“fox.png” is erased now instead of after 30 days. This cannot be undone.',
      expect.any(Array),
    );
    act(() =>
      lastAlertButtons(alert)
        .find((button) => button.text === 'Delete permanently')
        ?.onPress?.(),
    );
    expect(mockPermanentlyDeleteAsset).toHaveBeenCalledWith('img-1');

    fireEvent(screen.getByTestId('library-image-card-img-1'), 'longPress');
    chooseActionMenuItem('Restore');
    expect(mockRestoreAsset).toHaveBeenCalledWith('img-1');
  });
});
