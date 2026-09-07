import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNeonDbMock, listMock, getEntryMock, findDirectoryEntryMock } = vi.hoisted(() => ({
  getNeonDbMock: vi.fn(),
  listMock: vi.fn(),
  getEntryMock: vi.fn(),
  findDirectoryEntryMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: getNeonDbMock }));
vi.mock('@/lib/services/plugin-registry-service', () => ({
  listPluginRegistryEntries: listMock,
  getPluginRegistryEntry: getEntryMock,
}));
vi.mock('./directory/catalog', () => ({ findDirectoryEntry: findDirectoryEntryMock }));

import { loadPluginCatalog, loadPluginEntry } from './registry-source';

const ENTRY = { id: 'github-automation', name: 'GitHub Automation' };

beforeEach(() => {
  vi.clearAllMocks();
  getNeonDbMock.mockReturnValue({ query: vi.fn() });
  findDirectoryEntryMock.mockResolvedValue(null);
});

describe('loadPluginCatalog', () => {
  it('returns the live catalogue', async () => {
    listMock.mockResolvedValue({ entries: [ENTRY], total: 1 });
    await expect(loadPluginCatalog()).resolves.toEqual({ status: 'ok', entries: [ENTRY] });
  });

  it('distinguishes an empty catalogue from an outage', async () => {
    listMock.mockResolvedValue({ entries: [], total: 0 });
    await expect(loadPluginCatalog()).resolves.toEqual({ status: 'ok', entries: [] });
  });

  it('reports unavailable instead of an empty list when the read throws', async () => {
    listMock.mockRejectedValue(new Error('ECONNREFUSED postgres://user:secret@host'));
    await expect(loadPluginCatalog()).resolves.toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when the database client cannot even be built', async () => {
    getNeonDbMock.mockImplementation(() => {
      throw new Error('DATABASE_URL missing');
    });
    await expect(loadPluginCatalog()).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('loadPluginEntry', () => {
  it('returns the entry and manifest', async () => {
    getEntryMock.mockResolvedValue({ entry: ENTRY, manifest: null });
    await expect(loadPluginEntry('github-automation')).resolves.toEqual({
      status: 'ok',
      entry: ENTRY,
      manifest: null,
    });
  });

  it('reports missing only when neither the registry nor the directory has the id', async () => {
    getEntryMock.mockResolvedValue(null);
    await expect(loadPluginEntry('nope')).resolves.toEqual({ status: 'missing' });
  });

  it('falls back to the directory for an id the registry does not publish', async () => {
    const directoryEntry = {
      id: 'frontend-design',
      name: 'Frontend Design',
      slug: 'frontend-design',
    };
    getEntryMock.mockResolvedValue(null);
    findDirectoryEntryMock.mockResolvedValue(directoryEntry);

    await expect(loadPluginEntry('frontend-design')).resolves.toEqual({
      status: 'ok',
      entry: directoryEntry,
      manifest: null,
    });
  });

  it('prefers the registry row and never asks the directory when one exists', async () => {
    getEntryMock.mockResolvedValue({ entry: ENTRY, manifest: null });
    await loadPluginEntry('github-automation');
    expect(findDirectoryEntryMock).not.toHaveBeenCalled();
  });

  it('reports unavailable when the directory read itself throws', async () => {
    getEntryMock.mockResolvedValue(null);
    findDirectoryEntryMock.mockRejectedValue(new Error('snapshot store down'));
    await expect(loadPluginEntry('superpowers')).resolves.toEqual({ status: 'unavailable' });
  });

  it('never reports a missing entry when the registry is merely down', async () => {
    getEntryMock.mockRejectedValue(new Error('down'));
    await expect(loadPluginEntry('github-automation')).resolves.toEqual({ status: 'unavailable' });
  });
});
