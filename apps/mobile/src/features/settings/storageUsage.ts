import { getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';

const CACHE_SIZE_MAX_DEPTH = 8;
const CACHE_SIZE_MAX_ENTRIES = 10_000;

type StorageFileInfo = { exists: false } | { exists: true; isDirectory: boolean; size?: number };

export type StorageUsageAdapter = {
  getInfoAsync(uri: string): Promise<StorageFileInfo>;
  readDirectoryAsync(uri: string): Promise<string[]>;
};

const expoStorageUsageAdapter: StorageUsageAdapter = {
  getInfoAsync,
  readDirectoryAsync,
};

function safeByteSize(size: number | undefined): number {
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0;
}

function isSafeChildName(name: string): boolean {
  return name !== '.' && name !== '..' && !name.includes('/');
}

async function getDirectorySizeBytesInner(
  uri: string,
  adapter: StorageUsageAdapter,
  state: { entries: number; visited: Set<string> },
  depth: number,
): Promise<number> {
  if (
    state.entries >= CACHE_SIZE_MAX_ENTRIES ||
    depth > CACHE_SIZE_MAX_DEPTH ||
    state.visited.has(uri)
  ) {
    return 0;
  }

  state.entries += 1;
  state.visited.add(uri);

  const info = await adapter.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) return safeByteSize(info.size);

  let childNames: string[];
  try {
    childNames = await adapter.readDirectoryAsync(uri);
  } catch {
    return safeByteSize(info.size);
  }

  let total = 0;
  const base = uri.endsWith('/') ? uri : `${uri}/`;
  for (const childName of childNames) {
    if (!isSafeChildName(childName)) continue;
    total += await getDirectorySizeBytesInner(`${base}${childName}`, adapter, state, depth + 1);
    if (state.entries >= CACHE_SIZE_MAX_ENTRIES) break;
  }

  return total;
}

export async function getDirectorySizeBytes(
  uri: string,
  adapter: StorageUsageAdapter = expoStorageUsageAdapter,
): Promise<number> {
  return getDirectorySizeBytesInner(uri, adapter, { entries: 0, visited: new Set() }, 0);
}
