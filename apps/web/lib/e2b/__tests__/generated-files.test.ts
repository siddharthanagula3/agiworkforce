/**
 * Unit tests for the E2B generated-file harvest (lib/e2b/generated-files.ts):
 * baseline snapshot → turn-end diff → persist → wire descriptors. Media layer
 * and executor are mocked; the harvest itself is exercised for the behaviors
 * that guard real user outcomes (only new/changed files, caps, best-effort).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { E2BExecutor, SandboxFileEntry } from '../types';

vi.mock('server-only', () => ({}));

const { mockStoreMedia, mockInsertMediaAsset, mockIsConfigured } = vi.hoisted(() => ({
  mockStoreMedia: vi.fn(),
  mockInsertMediaAsset: vi.fn(),
  mockIsConfigured: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/media-storage', () => ({
  storeMedia: (...args: unknown[]) => mockStoreMedia(...args),
  deleteStoredMedia: vi.fn(),
  isGeneratedMediaStorageConfigured: () => mockIsConfigured(),
}));

vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: (...args: unknown[]) => mockInsertMediaAsset(...args),
}));

import { snapshotSandboxFiles, harvestGeneratedFiles } from '../generated-files';

function makeExecutor(tree: Record<string, SandboxFileEntry[]>): E2BExecutor {
  return {
    runCode: vi.fn(),
    writeFile: vi.fn(),
    createFolder: vi.fn(),
    dispose: vi.fn(),
    listFiles: vi.fn(async (path: string) => tree[path] ?? []),
    readFileBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
}

const file = (path: string, byteSize: number): SandboxFileEntry => ({
  path,
  name: path.split('/').pop()!,
  isDir: false,
  byteSize,
});

const dir = (path: string): SandboxFileEntry => ({
  path,
  name: path.split('/').pop()!,
  isDir: true,
  byteSize: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockStoreMedia.mockImplementation(async (p: { data: Buffer }) => ({
    url: 'private-media/file/owner/f',
    pathname: 'private-media/file/owner/f',
    byteSize: p.data.byteLength,
  }));
  mockInsertMediaAsset.mockResolvedValue('asset-1');
});

describe('snapshotSandboxFiles + harvestGeneratedFiles', () => {
  it('emits only files created after the baseline, with durable URLs', async () => {
    const before = { '/home/user': [file('/home/user/old.txt', 10)] };
    const executor = makeExecutor(before);
    const baseline = await snapshotSandboxFiles(executor);

    const after = {
      '/home/user': [file('/home/user/old.txt', 10), file('/home/user/report.pdf', 2048)],
    };
    (executor.listFiles as ReturnType<typeof vi.fn>).mockImplementation(
      async (path: string) => (after as Record<string, SandboxFileEntry[]>)[path] ?? [],
    );

    const { files, failedCount } = await harvestGeneratedFiles({
      executor,
      baseline,
      userId: 'u1',
      organizationId: null,
    });

    expect(failedCount).toBe(0);
    expect(files).toHaveLength(1);
    // The wire uri is the SAME-ORIGIN authenticated serve route, not the raw
    // R2 URL — the renderer gates only accept same-origin sources.
    expect(files[0]).toMatchObject({
      file_name: 'report.pdf',
      mime_type: 'application/pdf',
      kind: 'pdf',
      uri: '/api/files/asset-1',
      id: 'asset-1',
    });
    expect(files[0]!.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('re-emits a baseline file whose size changed (model overwrote it)', async () => {
    const executor = makeExecutor({ '/home/user': [file('/home/user/data.csv', 10)] });
    const baseline = await snapshotSandboxFiles(executor);
    (executor.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      file('/home/user/data.csv', 999),
    ]);

    const { files } = await harvestGeneratedFiles({
      executor,
      baseline,
      userId: 'u1',
      organizationId: null,
    });
    expect(files.map((f) => f.file_name)).toEqual(['data.csv']);
  });

  it('walks subdirectories but skips hidden and package dirs', async () => {
    const executor = makeExecutor({
      '/home/user': [dir('/home/user/out'), dir('/home/user/node_modules')],
      '/home/user/out': [file('/home/user/out/chart.png', 100)],
      '/home/user/node_modules': [file('/home/user/node_modules/x.js', 5)],
    });

    const { files } = await harvestGeneratedFiles({
      executor,
      baseline: new Map(),
      userId: 'u1',
      organizationId: null,
    });
    expect(files.map((f) => f.file_name)).toEqual(['chart.png']);
    expect(files[0]!.kind).toBe('image');
  });

  it('counts changed files as failed when media storage is unconfigured (honest note, never silence)', async () => {
    mockIsConfigured.mockReturnValue(false);
    const executor = makeExecutor({ '/home/user': [file('/home/user/a.txt', 5)] });
    expect(
      await harvestGeneratedFiles({
        executor,
        baseline: new Map(),
        userId: 'u1',
        organizationId: null,
      }),
    ).toEqual({ files: [], failedCount: 1 });
  });

  it('returns failedCount 0 when storage is unconfigured but nothing changed', async () => {
    mockIsConfigured.mockReturnValue(false);
    const executor = makeExecutor({ '/home/user': [file('/home/user/a.txt', 5)] });
    const baseline = await snapshotSandboxFiles(executor);
    expect(
      await harvestGeneratedFiles({ executor, baseline, userId: 'u1', organizationId: null }),
    ).toEqual({ files: [], failedCount: 0 });
  });

  it('skips a file whose read fails and still persists the rest', async () => {
    const executor = makeExecutor({
      '/home/user': [file('/home/user/bad.txt', 5), file('/home/user/good.txt', 6)],
    });
    (executor.readFileBytes as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Uint8Array([7]));

    const { files, failedCount } = await harvestGeneratedFiles({
      executor,
      baseline: new Map(),
      userId: 'u1',
      organizationId: null,
    });
    expect(files).toHaveLength(1);
    expect(files[0]!.file_name).toBe('good.txt');
    // The unreadable file is COUNTED so the tool loop can surface an honest note.
    expect(failedCount).toBe(1);
  });
});
