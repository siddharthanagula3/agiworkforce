/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFocus = (() => {
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    get: () => focused,
    set: (next: boolean) => {
      focused = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useNavigation: () => ({ openDrawer: jest.fn(), navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    const focused = React.useSyncExternalStore(mockFocus.subscribe, mockFocus.get);
    React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
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

jest.mock('../src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (state: { conversations: never[]; messages: object }) => unknown) =>
    selector({ conversations: [], messages: {} }),
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
    selector({ clerkUserId: 'user-1' }),
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
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({ ReportSheet: () => null }));
jest.mock('../src/features/chat/components/VideoPlayerModal', () => ({
  VideoPlayerModal: () => null,
}));
jest.mock('../src/features/library/MediaJobsSection', () => ({ MediaJobsSection: () => null }));
jest.mock('../src/features/library/LibraryFeaturePromoSheet', () => ({
  LibraryFeaturePromoSheet: () => null,
}));

jest.mock('../services/fileCreation', () => ({
  prepareLocalVideoPlayer: jest.fn(),
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));

jest.mock('../src/features/library/libraryClient', () => ({
  fetchLibraryPage: jest.fn(),
  deleteLibraryAsset: jest.fn(),
  restoreLibraryAsset: jest.fn(),
  permanentlyDeleteLibraryAsset: jest.fn(),
  LIBRARY_PAGE_SIZE: 24,
}));

import { fetchLibraryPage } from '../src/features/library/libraryClient';
import { LibraryScreen } from '../src/features/library';

const mockFetch = fetchLibraryPage as jest.Mock;

function asset(id: string, fileName: string, kind: 'image' | 'document') {
  return {
    id,
    kind,
    fileName,
    mimeType: kind === 'image' ? 'image/png' : 'text/plain',
    uri: `/api/library/assets/${id}`,
    byteCount: 1024,
    prompt: null,
    createdAt: '2026-11-14T00:00:00.000Z',
    sourceLabel: 'Upload',
    eraseAfter: null,
    model: null,
    conversationId: null,
  };
}

function page(assets: ReturnType<typeof asset>[], extra: Record<string, number> = {}) {
  return { assets, hasMore: false, nextOffset: null, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.set(true);
});

describe('the Library list stays current', () => {
  it('shows a spinner, never the empty state, until the first load has finished', async () => {
    let finish: ((value: unknown) => void) | undefined;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const screen = render(<LibraryScreen />);

    expect(screen.queryByTestId('library-empty-state')).toBeNull();
    expect(screen.getByTestId('library-loading')).toBeTruthy();

    await act(async () => {
      finish?.(page([asset('a1', 'first.txt', 'document')]));
    });

    expect(screen.queryByTestId('library-loading')).toBeNull();
    expect(screen.getByTestId('library-document-card-a1')).toBeTruthy();
  });

  it('keeps the spinner up while a newly chosen filter loads its first page', async () => {
    mockFetch.mockResolvedValueOnce(page([asset('a1', 'first.txt', 'document')]));
    const screen = render(<LibraryScreen />);
    await waitFor(() => expect(screen.getByTestId('library-document-card-a1')).toBeTruthy());

    mockFetch.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.press(screen.getByLabelText('Uploads filter'));

    expect(screen.queryByTestId('library-empty-state')).toBeNull();
    expect(screen.getByTestId('library-loading')).toBeTruthy();
  });

  it('fetches again when the screen regains focus, without a spinner, and shows the new file', async () => {
    mockFetch.mockResolvedValueOnce(page([asset('a1', 'first.txt', 'document')]));
    const screen = render(<LibraryScreen />);
    await waitFor(() => expect(screen.getByTestId('library-document-card-a1')).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(1);

    act(() => mockFocus.set(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce(
      page([asset('a2', 'newest.txt', 'document'), asset('a1', 'first.txt', 'document')], {
        storageUsedBytes: 16_000_000,
        storageLimitBytes: 1_073_741_824,
      }),
    );
    act(() => mockFocus.set(true));

    expect(screen.queryByTestId('library-loading')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('library-document-card-a2')).toBeTruthy());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('library-storage-used')).toHaveTextContent(
      '15.3 MB of 1 GB file storage used',
    );
  });

  it('keeps the list it has when the refresh on focus fails', async () => {
    mockFetch.mockResolvedValueOnce(page([asset('a1', 'first.txt', 'document')]));
    const screen = render(<LibraryScreen />);
    await waitFor(() => expect(screen.getByTestId('library-document-card-a1')).toBeTruthy());

    act(() => mockFocus.set(false));
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    act(() => mockFocus.set(true));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('library-document-card-a1')).toBeTruthy();
    expect(screen.queryByTestId('library-error')).toBeNull();
  });

  it('asks the server again on pull down', async () => {
    mockFetch.mockResolvedValueOnce(page([asset('a1', 'first.txt', 'document')]));
    const screen = render(<LibraryScreen />);
    await waitFor(() => expect(screen.getByTestId('library-document-card-a1')).toBeTruthy());

    mockFetch.mockResolvedValueOnce(
      page([asset('a2', 'newest.png', 'image'), asset('a1', 'first.txt', 'document')]),
    );
    await act(async () => {
      screen.getByTestId('library-grid').props.refreshControl.props.onRefresh();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('library-image-card-a2')).toBeTruthy());
  });
});

describe('the Library filter', () => {
  it('opens on All again after the screen was left on another filter', async () => {
    mockFetch.mockResolvedValue(
      page([asset('a1', 'first.txt', 'document'), asset('a2', 'photo.png', 'image')]),
    );
    const screen = render(<LibraryScreen />);
    await waitFor(() => expect(screen.getByTestId('library-document-card-a1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Documents filter'));
    expect(screen.getByLabelText('Documents filter').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId('library-image-card-a2')).toBeNull();

    act(() => mockFocus.set(false));
    act(() => mockFocus.set(true));

    await waitFor(() =>
      expect(screen.getByLabelText('All filter').props.accessibilityState.selected).toBe(true),
    );
    expect(screen.getByLabelText('Documents filter').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('library-image-card-a2')).toBeTruthy();
  });
});

describe('the Library meters', () => {
  it('shows the month of downloads beside the storage meter when the server sends a limit', async () => {
    mockFetch.mockResolvedValueOnce(
      page([asset('a1', 'first.txt', 'document')], {
        storageUsedBytes: 16_000_000,
        storageLimitBytes: 1_073_741_824,
        downloadUsedBytes: 5_242_880,
        downloadLimitBytes: 2_147_483_648,
      }),
    );

    const screen = render(<LibraryScreen />);

    await waitFor(() => expect(screen.getByTestId('library-downloads-used')).toBeTruthy());
    expect(screen.getByTestId('library-downloads-used')).toHaveTextContent(
      '5 MB of 2 GB file downloads used this month',
    );
    expect(screen.getByTestId('library-storage-used')).toBeTruthy();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });

  it('shows no download line when the server sends none', async () => {
    mockFetch.mockResolvedValueOnce(
      page([asset('a1', 'first.txt', 'document')], {
        storageUsedBytes: 16_000_000,
        storageLimitBytes: 1_073_741_824,
      }),
    );

    const screen = render(<LibraryScreen />);

    await waitFor(() => expect(screen.getByTestId('library-storage-used')).toBeTruthy());
    expect(screen.queryByTestId('library-downloads-used')).toBeNull();
  });
});
