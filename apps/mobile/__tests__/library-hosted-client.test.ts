import type { LibraryItem } from '@agiworkforce/cloud-contracts';

import livePage from './__fixtures__/hosted-library-page.json';

jest.mock('@/services/api', () => ({ api: { get: jest.fn(), delete: jest.fn() } }));

import { api } from '@/services/api';
import {
  deleteLibraryAsset,
  fetchLibraryPage,
  libraryAssetKind,
  libraryListPath,
  mapLibraryItem,
} from '@/src/features/library/libraryClient';
import { useLibraryCacheStore } from '@/src/features/library/libraryCacheStore';

const mockApi = api as unknown as { get: jest.Mock; delete: jest.Mock };

function item(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: 'asset-1',
    file_name: 'render.png',
    mime_type: 'image/png',
    kind: 'image',
    byte_count: 2048,
    uri: '/api/files/asset-1',
    surface: 'file',
    previewable: true,
    origin: 'generated',
    source_surface: 'web',
    provider: null,
    model: null,
    prompt: 'a cobalt circle',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useLibraryCacheStore.getState().clearLibraryCache();
});

describe('library client mapping', () => {
  it('asks the hosted route for a page, not the local transcript', () => {
    expect(libraryListPath({ offset: 24, limit: 24, search: '  deck  ' })).toBe(
      '/api/library?q=deck&limit=24&offset=24&sort=modified',
    );
  });

  it('keeps every media kind the route returns', () => {
    expect(libraryAssetKind(item({}))).toBe('image');
    expect(libraryAssetKind(item({ kind: 'video', mime_type: 'video/mp4' }))).toBe('video');
    expect(libraryAssetKind(item({ kind: 'file', mime_type: 'application/pdf' }))).toBe('document');
  });

  it('maps a row onto the fields the cells render', () => {
    const asset = mapLibraryItem(
      item({ kind: 'file', mime_type: 'application/pdf', file_name: 'brief.pdf', model: 'sol-1' }),
    );
    expect(asset).toEqual({
      id: 'asset-1',
      kind: 'document',
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      uri: '/api/files/asset-1',
      byteCount: 2048,
      prompt: 'a cobalt circle',
      createdAt: '2026-09-01T00:00:00.000Z',
      sourceLabel: 'sol-1',
    });
  });

  it('reads the page and its cursor from the hosted response', async () => {
    mockApi.get.mockResolvedValue({
      items: [item({}), item({ id: 'asset-2', kind: 'video', mime_type: 'video/mp4' })],
      has_more: true,
      next_offset: 24,
    });

    const page = await fetchLibraryPage({ offset: 0 });

    expect(mockApi.get).toHaveBeenCalledWith('/api/library?limit=24&offset=0&sort=modified');
    expect(page.assets.map((asset) => asset.kind)).toEqual(['image', 'video']);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(24);
  });

  it('refuses a response that does not match the library contract', async () => {
    mockApi.get.mockResolvedValue({
      items: [{ id: 'asset-1' }],
      has_more: false,
      next_offset: null,
    });
    await expect(fetchLibraryPage({})).rejects.toThrow(/unreadable/i);
  });

  it('deletes through the hosted media route the web app uses', async () => {
    mockApi.delete.mockResolvedValue({ success: true });
    await deleteLibraryAsset('asset 1');
    expect(mockApi.delete).toHaveBeenCalledWith('/api/media?id=asset%201');
  });
});

describe('offline cache boundary', () => {
  it('never hands the cached page to a signed-out reader', () => {
    const store = useLibraryCacheStore.getState();
    store.rememberLibraryPage('user_1', [mapLibraryItem(item({}))]);
    expect(useLibraryCacheStore.getState().readLibraryPage(null)).toBeNull();
  });

  it('never hands one account the page cached for another', () => {
    const store = useLibraryCacheStore.getState();
    store.rememberLibraryPage('user_1', [mapLibraryItem(item({}))]);
    expect(useLibraryCacheStore.getState().readLibraryPage('user_2')).toBeNull();
    expect(useLibraryCacheStore.getState().readLibraryPage('user_1')).toHaveLength(1);
  });
});

describe('a live page from the hosted library route', () => {
  it('keeps the video, image and document rows the old local scan dropped', async () => {
    mockApi.get.mockResolvedValue(livePage);

    const result = await fetchLibraryPage({ offset: 0 });

    expect(result.assets.filter((asset) => asset.kind === 'video')).toHaveLength(1);
    expect(result.assets.filter((asset) => asset.kind === 'image').length).toBeGreaterThan(0);
    expect(result.assets.filter((asset) => asset.kind === 'document').length).toBeGreaterThan(0);
    expect(result.assets.map((asset) => asset.fileName)).toContain('summary.pdf');
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(24);
  });
});
