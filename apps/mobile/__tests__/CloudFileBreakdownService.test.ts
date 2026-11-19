const mockGet = jest.fn();

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args), post: jest.fn(), put: jest.fn() },
}));

import { fetchCloudFileBreakdown } from '@/services/usage';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';

const page = (extra: Record<string, unknown> = {}) => ({
  items: [],
  has_more: false,
  next_offset: null,
  ...extra,
});

describe('fetchCloudFileBreakdown', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('reads the sizes through the Library reader, one row at a time', async () => {
    mockGet.mockResolvedValue(page({ storage_documents_bytes: 100, storage_images_bytes: 200 }));

    await expect(fetchCloudFileBreakdown()).resolves.toEqual({
      documentsBytes: 100,
      imagesBytes: 200,
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    const path = new URL(String(mockGet.mock.calls[0][0]), 'https://example.test');
    expect(path.pathname).toBe('/api/library');
    expect(path.searchParams.get('limit')).toBe('1');
  });

  it('keeps a size of zero', async () => {
    mockGet.mockResolvedValue(page({ storage_documents_bytes: 0, storage_images_bytes: 0 }));

    await expect(fetchCloudFileBreakdown()).resolves.toEqual({ documentsBytes: 0, imagesBytes: 0 });
  });

  it.each([
    ['a server that does not send the sizes', page()],
    ['only one of the sizes', page({ storage_documents_bytes: 5 })],
    ['only the other size', page({ storage_images_bytes: 5 })],
  ])('says the breakdown is not available for %s', async (_name, body) => {
    mockGet.mockResolvedValue(body);

    await expect(fetchCloudFileBreakdown()).resolves.toBeNull();
  });

  it.each([
    ['a negative size', page({ storage_documents_bytes: -1, storage_images_bytes: 1 })],
    [
      'a size that is not a number',
      page({ storage_documents_bytes: '5', storage_images_bytes: 1 }),
    ],
    ['a body that is not an object', null],
  ])('lets %s reach the caller as an unreadable Library response', async (_name, body) => {
    mockGet.mockResolvedValue(body);

    await expect(fetchCloudFileBreakdown()).rejects.toThrow('unreadable');
  });

  it('lets a failed request reach the caller so it can say Unavailable', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await expect(fetchCloudFileBreakdown()).rejects.toThrow('offline');
  });
});

describe('fetchLibraryPage storage breakdown', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('carries the document and image sizes when the server sends them', async () => {
    mockGet.mockResolvedValue(page({ storage_documents_bytes: 7, storage_images_bytes: 9 }));

    await expect(fetchLibraryPage({ limit: 1 })).resolves.toEqual(
      expect.objectContaining({ storageDocumentsBytes: 7, storageImagesBytes: 9 }),
    );
  });

  it('leaves the sizes out when the server does not send them', async () => {
    mockGet.mockResolvedValue(page());

    const result = await fetchLibraryPage({ limit: 1 });

    expect(result).not.toHaveProperty('storageDocumentsBytes');
    expect(result).not.toHaveProperty('storageImagesBytes');
  });
});
