
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';

const mockFiles = new Map<string, Uint8Array>();
const mockRemote = new Map<string, Uint8Array>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn(async (uri: string) => {
    const f = mockFiles.get(uri);
    return f ? { exists: true, size: f.length, isDirectory: false, uri } : { exists: false, uri };
  }),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
  readAsStringAsync: jest.fn(
    async (uri: string, opts?: { encoding?: string; position?: number; length?: number }) => {
      const f = mockFiles.get(uri);
      if (!f) throw new Error(`ENOENT: ${uri}`);
      if (opts?.encoding === 'base64') {
        const start = opts.position ?? 0;
        const len = opts.length ?? f.length;
        return Buffer.from(f.subarray(start, start + len)).toString('base64');
      }
      return Buffer.from(f).toString('utf8');
    },
  ),
  writeAsStringAsync: jest.fn(async (uri: string, content: string) => {
    mockFiles.set(uri, new Uint8Array(Buffer.from(content, 'utf8')));
  }),
  createDownloadResumable: jest.fn((url: string, dest: string) => ({
    downloadAsync: async () => {
      const bytes = mockRemote.get(url);
      if (!bytes) return { status: 404 };
      mockFiles.set(dest, bytes);
      return { status: 200 };
    },
    savable: async () => ({}),
    pauseAsync: async () => undefined,
  })),
}));

jest.mock('../../../packages/platform/local-llm/src/capabilities', () => ({
  detectCapabilities: jest.fn(async () => ({
    totalRAMMB: 6_000,
    osVersion: 'test-os',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable',
    tier2Available: false,
    tier3Available: true,
  })),
  isThermallyThrottled: jest.fn(() => false),
}));

const mockRecords = new Map<string, unknown>();

jest.mock('@/storage/installedModels', () => ({
  insertInstalledModel: jest.fn(async (r: { id: string }) => {
    mockRecords.set(r.id, r);
  }),
  recordInstalledModel: jest.fn(async (r: { id: string }) => {
    mockRecords.set(r.id, r);
  }),
  getInstalledModel: jest.fn(async (id: string) => mockRecords.get(id) ?? null),
  listInstalledModels: jest.fn(async () => [...mockRecords.values()]),
}));

import { downloadModel } from '@/services/modelDownload';
import { runVisionQuery, resolveVisionRoute } from '../src/features/image/services/vision';
import { _setLlamaModuleForTesting, getModelsForRole, tier3Release } from '@agiworkforce/local-llm';
import type { InstalledModel } from '@/storage/types';

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

const baseBytes = new Uint8Array(1024).map((_, i) => (i * 7) % 256);
const mmprojBytes = new Uint8Array(512).map((_, i) => (i * 13) % 256);
const BASE_URL = 'https://models.example/fixture-vision-base.gguf';
const MMPROJ_URL = 'https://models.example/fixture-vision-projector.gguf';
const VISION_CATALOG_MODEL = getModelsForRole('premium-vision-pack').find(
  (model) => model.format === 'gguf' && model.mmprojUrl && model.mmprojChecksum,
);

if (!VISION_CATALOG_MODEL) {
  throw new Error('Local catalog has no GGUF vision model with a projector');
}

describe('gguf vision full chain: install -> select -> multimodal generate', () => {
  beforeAll(() => {
    mockRemote.set(BASE_URL, baseBytes);
    mockRemote.set(MMPROJ_URL, mmprojBytes);
  });

  afterAll(async () => {
    await tier3Release();
    _setLlamaModuleForTesting(null);
  });

  it('runs the entire pipeline against mocked native layers', async () => {
    const progress: number[] = [];
    const record = await downloadModel({
      modelId: VISION_CATALOG_MODEL.id,
      displayName: VISION_CATALOG_MODEL.displayName,
      downloadUrl: BASE_URL,
      checksum: hex(nobleSha256(baseBytes)),
      fileSizeBytes: baseBytes.length,
      runtime: 'local',
      format: 'gguf',
      mmprojUrl: MMPROJ_URL,
      mmprojChecksum: hex(nobleSha256(mmprojBytes)),
      mmprojSizeBytes: mmprojBytes.length,
      wifiOnly: false,
      onProgress: (downloaded, total) => progress.push(downloaded / total),
    });

    const expectedModelPath = `file:///doc/models/${VISION_CATALOG_MODEL.id}/model.gguf`;
    const expectedMmprojPath = `${expectedModelPath}.mmproj.gguf`;
    expect(record.local_path).toBe(expectedModelPath);
    expect(mockFiles.has(expectedModelPath)).toBe(true);
    expect(mockFiles.has(expectedMmprojPath)).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);
    const stored = mockRecords.get(VISION_CATALOG_MODEL.id) as InstalledModel;
    expect(stored.local_path).toBe(expectedModelPath);

    const route = await resolveVisionRoute();
    expect(route).toEqual({
      kind: 'vl-pack',
      modelId: VISION_CATALOG_MODEL.id,
      displayName: VISION_CATALOG_MODEL.displayName,
    });

    const completion = jest.fn(async () => ({ text: 'a tabby cat on a windowsill' }));
    const initMultimodal = jest.fn(async () => true);
    const initLlama = jest.fn(async () => ({
      completion,
      initMultimodal,
      release: jest.fn(async () => undefined),
    }));
    _setLlamaModuleForTesting(initLlama as never);

    const result = await runVisionQuery({
      imageUri: 'file:///tmp/cat.jpg',
      question: 'What animal is this?',
    });

    expect(initLlama).toHaveBeenCalledWith(
      expect.objectContaining({ model: expectedModelPath, ctx_shift: false }),
    );
    expect(initMultimodal).toHaveBeenCalledWith(
      expect.objectContaining({ path: expectedMmprojPath }),
    );
    const sentMessages = (
      completion.mock.calls[0] as unknown as [
        { messages: Array<{ role: string; content: unknown }> },
      ]
    )[0].messages;
    expect(sentMessages[sentMessages.length - 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What animal is this?' },
        { type: 'image_url', image_url: { url: 'file:///tmp/cat.jpg' } },
      ],
    });
    expect(result.route.kind).toBe('vl-pack');
    expect(result.text).toBe('a tabby cat on a windowsill');
  });

  it('rejects a corrupted mmproj artifact and leaves no corrupt file behind', async () => {
    mockFiles.clear();
    mockRecords.clear();
    mockRemote.set(MMPROJ_URL, new Uint8Array(16));

    await expect(
      downloadModel({
        modelId: VISION_CATALOG_MODEL.id,
        displayName: VISION_CATALOG_MODEL.displayName,
        downloadUrl: BASE_URL,
        checksum: hex(nobleSha256(baseBytes)),
        fileSizeBytes: baseBytes.length,
        runtime: 'local',
        format: 'gguf',
        mmprojUrl: MMPROJ_URL,
        mmprojChecksum: hex(nobleSha256(mmprojBytes)),
        mmprojSizeBytes: mmprojBytes.length,
        wifiOnly: false,
      }),
    ).rejects.toMatchObject({ kind: 'checksum_mismatch' });

    const mmprojPath = `file:///doc/models/${VISION_CATALOG_MODEL.id}/model.gguf.mmproj.gguf`;
    expect(mockFiles.has(mmprojPath)).toBe(false);
    expect(mockRecords.has(VISION_CATALOG_MODEL.id)).toBe(false);
  });
});
