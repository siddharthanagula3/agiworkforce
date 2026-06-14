import {
  getDirectorySizeBytes,
  type StorageUsageAdapter,
} from '@/src/features/settings/storageUsage';

function createAdapter(
  entries: Record<
    string,
    | { exists: false }
    | { exists: true; isDirectory: true; children: string[]; size?: number; throwOnRead?: boolean }
    | { exists: true; isDirectory: false; size?: number }
  >,
): StorageUsageAdapter {
  return {
    async getInfoAsync(uri) {
      const entry = entries[uri];
      if (!entry) return { exists: false };
      if (!entry.exists) return entry;
      return { exists: true, isDirectory: entry.isDirectory, size: entry.size };
    },
    async readDirectoryAsync(uri) {
      const entry = entries[uri];
      if (!entry?.exists || !entry.isDirectory) throw new Error(`Not a directory: ${uri}`);
      if (entry.throwOnRead) throw new Error(`Cannot read directory: ${uri}`);
      return entry.children;
    },
  };
}

describe('storage usage helpers', () => {
  it('recursively sums nested cache file sizes instead of using directory entry size', async () => {
    const adapter = createAdapter({
      'file:///cache/': { exists: true, isDirectory: true, size: 4, children: ['a.tmp', 'nested'] },
      'file:///cache/a.tmp': { exists: true, isDirectory: false, size: 512 },
      'file:///cache/nested': { exists: true, isDirectory: true, size: 4, children: ['b.tmp'] },
      'file:///cache/nested/b.tmp': { exists: true, isDirectory: false, size: 2048 },
    });

    await expect(getDirectorySizeBytes('file:///cache/', adapter)).resolves.toBe(2560);
  });

  it('ignores path traversal child names from a directory listing', async () => {
    const adapter = createAdapter({
      'file:///cache/': {
        exists: true,
        isDirectory: true,
        children: ['safe.tmp', '../outside.tmp', 'nested/escape.tmp', '.'],
      },
      'file:///cache/safe.tmp': { exists: true, isDirectory: false, size: 100 },
      'file:///outside.tmp': { exists: true, isDirectory: false, size: 900 },
      'file:///cache/nested/escape.tmp': { exists: true, isDirectory: false, size: 900 },
    });

    await expect(getDirectorySizeBytes('file:///cache/', adapter)).resolves.toBe(100);
  });

  it('returns zero for missing directories and files without a usable byte size', async () => {
    const adapter = createAdapter({
      'file:///cache/': { exists: true, isDirectory: true, children: ['missing.tmp'] },
      'file:///cache/missing.tmp': { exists: true, isDirectory: false },
    });

    await expect(getDirectorySizeBytes('file:///unknown/', adapter)).resolves.toBe(0);
    await expect(getDirectorySizeBytes('file:///cache/', adapter)).resolves.toBe(0);
  });
});
