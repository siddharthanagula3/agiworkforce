import { act, renderHook, waitFor } from '@testing-library/react-native';

let mockOwnerId: string | null = 'account-a';

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  rehydrateWhenMmkvReady: jest.fn(),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: string | null }) => unknown) =>
    selector({ clerkUserId: mockOwnerId }),
}));

jest.mock('../src/features/library/libraryClient', () => ({
  fetchLibraryPage: jest.fn(),
  deleteLibraryAsset: jest.fn(),
  LIBRARY_PAGE_SIZE: 24,
}));

import { deleteLibraryAsset, fetchLibraryPage } from '../src/features/library/libraryClient';
import { useLibraryAssets } from '../src/features/library/useLibraryAssets';
import { useLibraryCacheStore } from '../src/features/library/libraryCacheStore';

const mockFetchLibraryPage = fetchLibraryPage as jest.Mock;
const mockDeleteLibraryAsset = deleteLibraryAsset as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockOwnerId = 'account-a';
  useLibraryCacheStore.getState().clearLibraryCache();
});

describe('Library recovery copy', () => {
  it('does not display raw API diagnostics after an initial load failure', async () => {
    mockFetchLibraryPage.mockRejectedValueOnce(new Error('internal file bucket credentials'));

    const { result } = renderHook(() => useLibraryAssets(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('The Library could not be reached. Pull to try again.');
    expect(result.current.assets).toEqual([]);
  });

  it('retains an account-owned cached page with safe retry guidance', async () => {
    useLibraryCacheStore.getState().rememberLibraryPage('account-a', [{ id: 'asset-a' }] as never);
    mockFetchLibraryPage.mockRejectedValueOnce(new Error('internal query and account token'));

    const { result } = renderHook(() => useLibraryAssets(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assets).toEqual([{ id: 'asset-a' }]);
    expect(result.current.showingCachedPage).toBe(true);
    expect(result.current.error).toBe('The Library could not be reached. Pull to try again.');
  });

  it('uses the server cursor after a sparse page instead of the displayed item count', async () => {
    mockFetchLibraryPage
      .mockResolvedValueOnce({
        assets: [{ id: 'asset-a' }],
        hasMore: true,
        nextOffset: 24,
      })
      .mockResolvedValueOnce({
        assets: [{ id: 'asset-b' }],
        hasMore: false,
        nextOffset: null,
      });

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.assets).toHaveLength(2));

    expect(mockFetchLibraryPage).toHaveBeenNthCalledWith(2, {
      offset: 24,
      limit: 24,
      search: '',
      sort: 'modified',
    });
  });

  it('refetches from the first page when the saved-file sort changes', async () => {
    mockFetchLibraryPage.mockResolvedValue({ assets: [], hasMore: false, nextOffset: null });

    const { result, rerender } = renderHook(
      ({ sort }: { sort: 'modified' | 'name' }) => useLibraryAssets('', sort),
      { initialProps: { sort: 'modified' as 'modified' | 'name' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ sort: 'name' });
    await waitFor(() =>
      expect(mockFetchLibraryPage).toHaveBeenLastCalledWith({
        offset: 0,
        search: '',
        sort: 'name',
      }),
    );
  });

  it('hides an old account page immediately and ignores its late response', async () => {
    let finishFirstPage: ((page: unknown) => void) | undefined;
    mockFetchLibraryPage
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstPage = resolve;
          }),
      )
      .mockResolvedValueOnce({
        assets: [{ id: 'account-b-asset' }],
        hasMore: false,
        nextOffset: null,
      });

    const { result, rerender } = renderHook(() => useLibraryAssets(''));
    mockOwnerId = 'account-b';
    rerender({});
    expect(result.current.assets).toEqual([]);

    await waitFor(() => expect(result.current.assets).toEqual([{ id: 'account-b-asset' }]));
    await act(async () => {
      finishFirstPage?.({
        assets: [{ id: 'account-a-asset' }],
        hasMore: false,
        nextOffset: null,
      });
    });
    expect(result.current.assets).toEqual([{ id: 'account-b-asset' }]);
  });

  it('does not keep presenting the last quota after a refresh fails', async () => {
    mockFetchLibraryPage
      .mockResolvedValueOnce({
        assets: [],
        hasMore: false,
        nextOffset: null,
        storageUsedBytes: 10,
        storageLimitBytes: 100,
      })
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.storageUsedBytes).toBe(10));
    expect(result.current.storageLimitBytes).toBe(100);

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.storageUsedBytes).toBeNull();
    expect(result.current.storageLimitBytes).toBeNull();
  });

  it('does not show the previous account quota to the next account', async () => {
    mockFetchLibraryPage
      .mockResolvedValueOnce({
        assets: [],
        hasMore: false,
        nextOffset: null,
        storageUsedBytes: 10,
        storageLimitBytes: 100,
      })
      .mockImplementationOnce(() => new Promise(() => undefined));

    const { result, rerender } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.storageUsedBytes).toBe(10));

    mockOwnerId = 'account-b';
    rerender({});
    expect(result.current.storageUsedBytes).toBeNull();
    expect(result.current.storageLimitBytes).toBeNull();
  });

  it('removes a successfully deleted file from the offline page', async () => {
    mockFetchLibraryPage.mockResolvedValue({
      assets: [{ id: 'asset-a' }],
      hasMore: false,
      nextOffset: null,
    });
    mockDeleteLibraryAsset.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    await act(async () => result.current.removeAsset('asset-a'));

    expect(result.current.assets).toEqual([]);
    expect(useLibraryCacheStore.getState().readLibraryPage('account-a')).toBeNull();
  });

  it('keeps a file and its offline cache when deletion fails', async () => {
    mockFetchLibraryPage.mockResolvedValue({
      assets: [{ id: 'asset-a' }],
      hasMore: false,
      nextOffset: null,
    });
    mockDeleteLibraryAsset.mockRejectedValue(new Error('The file could not be deleted.'));

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    await expect(result.current.removeAsset('asset-a')).rejects.toThrow(/could not be deleted/i);

    expect(result.current.assets).toHaveLength(1);
    expect(useLibraryCacheStore.getState().readLibraryPage('account-a')).toHaveLength(1);
  });

  it('rebases the continuation offset after a loaded file is removed', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) => ({ id: `asset-${index}` }));
    mockFetchLibraryPage
      .mockResolvedValueOnce({ assets: firstPage, hasMore: true, nextOffset: 24 })
      .mockResolvedValueOnce({ assets: [{ id: 'asset-24' }], hasMore: false, nextOffset: null });
    mockDeleteLibraryAsset.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.assets).toHaveLength(24));
    await act(async () => result.current.removeAsset('asset-3'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.assets).toHaveLength(24));

    expect(mockFetchLibraryPage).toHaveBeenNthCalledWith(2, {
      offset: 23,
      limit: 24,
      search: '',
      sort: 'modified',
    });
    expect(result.current.assets.map((asset) => asset.id)).toContain('asset-24');
  });

  it('discards a continuation page requested before a removal shifted the result set', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) => ({ id: `asset-${index}` }));
    let finishSecondPage: ((page: unknown) => void) | undefined;
    mockFetchLibraryPage
      .mockResolvedValueOnce({ assets: firstPage, hasMore: true, nextOffset: 24 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecondPage = resolve;
          }),
      )
      .mockResolvedValueOnce({ assets: [{ id: 'asset-24' }], hasMore: false, nextOffset: null });
    mockDeleteLibraryAsset.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLibraryAssets(''));
    await waitFor(() => expect(result.current.assets).toHaveLength(24));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));
    await act(async () => result.current.removeAsset('asset-3'));
    await act(async () => {
      finishSecondPage?.({ assets: [{ id: 'asset-25' }], hasMore: true, nextOffset: 48 });
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.assets.map((asset) => asset.id)).not.toContain('asset-25');
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.assets.map((asset) => asset.id)).toContain('asset-24'),
    );
    expect(mockFetchLibraryPage).toHaveBeenNthCalledWith(3, {
      offset: 23,
      limit: 24,
      search: '',
      sort: 'modified',
    });
  });
});
