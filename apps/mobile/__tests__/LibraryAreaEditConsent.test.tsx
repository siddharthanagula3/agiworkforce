/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';

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
  useAuthStore: (selector: (state: { clerkUserId: string }) => unknown) =>
    selector({ clerkUserId: 'library-owner' }),
}));

jest.mock('../src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'cloud' }),
  isAccountScopedUiStateOwned: (state: unknown) => state !== null,
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => ({ ownerId: 'library-owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

jest.mock('../src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (uri: string) => ({ source: { uri }, status: 'ready' }),
}));

let mockPreviewProps: {
  visible: boolean;
  onEditArea?: (edit: { prompt: string; sourceBase64: string; maskBase64: string }) => void;
} = { visible: false };
jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: typeof mockPreviewProps) => {
    mockPreviewProps = props;
    return null;
  },
}));

jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
}));

jest.mock('../src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: () => null,
}));

jest.mock('../src/features/library/MediaJobsSection', () => ({
  MediaJobsSection: () => null,
}));

jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));

const mockShowToast = jest.fn();
jest.mock('../src/shared/components/Toast', () => ({
  ...jest.requireActual('../src/shared/components/Toast'),
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

jest.mock('@/lib/v1FeatureFlags', () => {
  const actual = jest.requireActual('@/lib/v1FeatureFlags');
  return { ...actual, FEATURES: { ...actual.FEATURES, imageGen: true } };
});

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: () => mockEnsureCloudSendConsent(),
}));

const mockPost = jest.fn();
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  api: { post: (...args: unknown[]) => mockPost(...args), get: jest.fn(), delete: jest.fn() },
}));

const mockRefresh = jest.fn();
const mockAssets = [
  {
    id: 'image-1',
    kind: 'image',
    fileName: 'poster.png',
    mimeType: 'image/png',
    uri: '/api/files/0190a000-0000-4000-8000-000000000002',
    byteCount: 10,
    prompt: 'A poster',
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceLabel: 'Generated',
    eraseAfter: null,
    model: 'fixture-image-model',
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
    refresh: mockRefresh,
    revalidate: jest.fn(),
    loadMore: jest.fn(),
    removeAsset: jest.fn(),
    restoreAsset: jest.fn(),
    permanentlyDeleteAsset: jest.fn(),
  }),
}));

import { CloudProviderConsentDeclinedError } from '../services/llmGate';
import { LibraryScreen } from '../src/features/library';

const AREA_EDIT = { prompt: 'Add a red door', sourceBase64: 'c291cmNl', maskBase64: 'bWFzaw==' };

describe('editing an area of a Library picture before sharing with AI providers is allowed', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPreviewProps = { visible: false };
    mockEnsureCloudSendConsent.mockResolvedValue(undefined);
    mockPost.mockResolvedValue({ success: true, images: [] });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => alert.mockRestore());

  it('sends nothing, keeps the picture open and shows no failure when the person says Not now', async () => {
    mockEnsureCloudSendConsent.mockRejectedValue(new CloudProviderConsentDeclinedError());
    render(<LibraryScreen initialImageId="image-1" />);
    expect(mockPreviewProps.visible).toBe(true);

    await act(async () => {
      mockPreviewProps.onEditArea?.(AREA_EDIT);
    });

    expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPreviewProps.visible).toBe(true);
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('closes the picture and sends the edit once sharing is allowed', async () => {
    render(<LibraryScreen initialImageId="image-1" />);

    await act(async () => {
      mockPreviewProps.onEditArea?.(AREA_EDIT);
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/media/image/generate',
      expect.objectContaining({
        prompt: AREA_EDIT.prompt,
        operation: 'inpaint',
        source_image: { b64_json: AREA_EDIT.sourceBase64 },
        mask_image: { b64_json: AREA_EDIT.maskBase64 },
      }),
      expect.anything(),
    );
    expect(mockPreviewProps.visible).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});
