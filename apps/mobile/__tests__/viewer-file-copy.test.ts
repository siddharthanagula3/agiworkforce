jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getAllKeys: () => [],
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  },
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));

const mockFiles = new Set<string>();
const mockDirectories = new Set<string>();
const mockUnder = (uri: string, prefix: string) => uri === prefix || uri.startsWith(prefix);
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  getInfoAsync: async (uri: string) => ({
    exists:
      mockFiles.has(uri) ||
      mockDirectories.has(uri) ||
      [...mockFiles].some((file) => file.startsWith(uri) && uri.endsWith('/')),
  }),
  makeDirectoryAsync: async (uri: string) => {
    mockDirectories.add(uri);
  },
  writeAsStringAsync: async (uri: string) => {
    mockFiles.add(uri);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    mockFiles.delete(from);
    mockFiles.add(to);
  },
  deleteAsync: async (uri: string) => {
    for (const file of [...mockFiles]) if (mockUnder(file, uri)) mockFiles.delete(file);
    for (const dir of [...mockDirectories]) if (mockUnder(dir, uri)) mockDirectories.delete(dir);
  },
  readDirectoryAsync: async (uri: string) =>
    [...mockFiles]
      .filter((file) => file.startsWith(uri) && !file.slice(uri.length).includes('/'))
      .map((file) => decodeURIComponent(file.slice(uri.length))),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setImageAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

const mockGuardedFetch = jest.fn();
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: async () => ({ Authorization: 'Bearer test-jwt' }),
}));

import {
  downloadGeneratedFile,
  prepareLocalVideoPlayer,
  removeViewerFileCopies,
  viewerFileCopy,
} from '@/services/fileCreation';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { clearAccountScopedArtifactState } from '@/src/features/artifacts/store';

const FILE_URL = 'https://agiworkforce.com/api/files/gf-1';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/pdf;base64,JVBERi0xLjc=';
    this.onload?.();
  }
}

function underDocuments(): string[] {
  return [...mockFiles].filter((file) => file.startsWith('file:///docs/'));
}

function underCache(): string[] {
  return [...mockFiles].filter((file) => file.startsWith('file:///cache/'));
}

describe('copies made to view a file', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDirectories.clear();
    mockGuardedFetch.mockReset();
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => ({}),
    });
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
  });

  it('keeps the copy in the cache for the account and reuses it on the next open', async () => {
    const first = await viewerFileCopy(FILE_URL, 'report.pdf');
    const again = await viewerFileCopy(FILE_URL, 'report.pdf');

    expect(first).toBe('file:///cache/file-views/accounts/user-1/gf-1/report.pdf');
    expect(again).toBe(first);
    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
    expect(underDocuments()).toEqual([]);
  });

  it('removes viewed copies at sign-out and leaves a download the person asked for', async () => {
    await viewerFileCopy(FILE_URL, 'report.pdf');
    const exported = await downloadGeneratedFile(FILE_URL, 'report.pdf');
    expect(exported.startsWith('file:///cache/exports/')).toBe(true);

    invalidateCloudAccount();
    clearAccountScopedArtifactState();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(underCache()).toEqual([exported]);
    expect(underDocuments()).toEqual([]);
  });

  it('removes video previews at sign-out', async () => {
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'video/mp4' },
      blob: async () => ({}),
    });
    const player = await prepareLocalVideoPlayer('https://agiworkforce.com/api/files/gf-2', '#000');
    expect(player.directoryUri).toBe('file:///cache/video-previews/user-1/gf-2/');
    expect(underCache().length).toBeGreaterThan(0);

    invalidateCloudAccount();
    clearAccountScopedArtifactState();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(underCache()).toEqual([]);
  });

  it('is cleared by removing the viewed copies directly, as Clear cache does for the whole cache', async () => {
    await viewerFileCopy(FILE_URL, 'report.pdf');
    await removeViewerFileCopies();
    expect(underCache()).toEqual([]);
  });

  it('does not keep a copy that finished after the account changed', async () => {
    let finishFetch: (value: unknown) => void = () => undefined;
    mockGuardedFetch.mockReturnValue(
      new Promise((resolve) => {
        finishFetch = resolve;
      }),
    );
    const pending = viewerFileCopy(FILE_URL, 'report.pdf');
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateCloudAccount();
    finishFetch({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => ({}),
    });

    await expect(pending).rejects.toThrow('Cloud account changed');
    expect(underCache()).toEqual([]);
  });
});
