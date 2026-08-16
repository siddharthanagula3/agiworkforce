import { describe, expect, it, vi } from 'vitest';
import type { OnDeviceModel } from '@agiworkforce/types';
import {
  ChecksumMismatchError,
  MULTIMODAL_MIN_RAM_MB,
  buildMultimodalMessages,
  effectiveVisionIn,
  ensureMultimodalArtifacts,
  ensureVerifiedArtifact,
  hasRunnableGgufArtifacts,
  hasSufficientRAMForMultimodal,
  isMultimodalModel,
  resolveMultimodalArtifacts,
  type FileSystemDeps,
} from '../multimodal.js';
import { getDefaultModel } from '../catalog.js';
import { requireExecutorchVisionModel, requireGgufVisionModel } from './catalog-fixtures.js';

const CHECK = requireGgufVisionModel().checksum!;
const MMPROJ = requireGgufVisionModel().mmprojChecksum!;

function makeDeps(overrides: Partial<FileSystemDeps> = {}): FileSystemDeps {
  return {
    fileExists: vi.fn(async () => false),
    sha256OfFile: vi.fn(async () => CHECK),
    downloadToFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('multimodal: resolveMultimodalArtifacts', () => {
  it('resolves the base + projector artifact pair from the catalog vision entry', () => {
    const model = requireGgufVisionModel();
    const artifacts = resolveMultimodalArtifacts(model);
    expect(artifacts).not.toBeNull();
    expect(artifacts!.model.checksum).toBe(CHECK);
    expect(artifacts!.mmproj.checksum).toBe(MMPROJ);
    expect(artifacts!.model.sizeBytes).toBe(model.fileSizeBytes);
    expect(artifacts!.mmproj.sizeBytes).toBe(model.mmprojSizeBytes);
    expect(isMultimodalModel(model)).toBe(true);
  });

  it('returns null for the catalog text-only default', () => {
    const model = getDefaultModel();
    expect(resolveMultimodalArtifacts(model)).toBeNull();
    expect(isMultimodalModel(model)).toBe(false);
  });

  it('returns null when the mmproj fields are absent even if visionIn is true', () => {
    const base = requireGgufVisionModel();
    const noMmproj: OnDeviceModel = {
      ...base,
      mmprojUrl: undefined,
      mmprojChecksum: undefined,
      mmprojSizeBytes: undefined,
    };
    expect(resolveMultimodalArtifacts(noMmproj)).toBeNull();
  });
});

describe('multimodal: effectiveVisionIn (§8 gate)', () => {
  it('is false when the mmproj is not installed, even for a visionIn model', () => {
    const model = requireGgufVisionModel();
    expect(effectiveVisionIn(model, { mmprojInstalled: false })).toBe(false);
    expect(effectiveVisionIn(model, { mmprojInstalled: true })).toBe(true);
  });

  it('is always false for a text-only model regardless of mmproj flag', () => {
    const model = getDefaultModel();
    expect(effectiveVisionIn(model, { mmprojInstalled: true })).toBe(false);
  });
});

describe('multimodal: ensureVerifiedArtifact', () => {
  const artifact = { url: 'https://example/model.gguf', checksum: CHECK, sizeBytes: 10 };

  it('downloads then verifies the checksum on a fresh install', async () => {
    const deps = makeDeps();
    const onProgress = vi.fn();
    await ensureVerifiedArtifact({ artifact, destPath: '/d/model.gguf', deps, onProgress });
    expect(deps.downloadToFile).toHaveBeenCalledWith(
      artifact.url,
      '/d/model.gguf',
      expect.any(Function),
    );
    expect(deps.sha256OfFile).toHaveBeenCalledWith('/d/model.gguf');
  });

  it('skips download when a matching file already exists (idempotent)', async () => {
    const deps = makeDeps({ fileExists: vi.fn(async () => true) });
    await ensureVerifiedArtifact({ artifact, destPath: '/d/model.gguf', deps });
    expect(deps.downloadToFile).not.toHaveBeenCalled();
  });

  it('re-downloads when an existing file has the wrong digest', async () => {
    const sha = vi
      .fn()
      .mockResolvedValueOnce('deadbeef')
      .mockResolvedValueOnce(CHECK);
    const deps = makeDeps({ fileExists: vi.fn(async () => true), sha256OfFile: sha });
    await ensureVerifiedArtifact({ artifact, destPath: '/d/model.gguf', deps });
    expect(deps.deleteFile).toHaveBeenCalledWith('/d/model.gguf');
    expect(deps.downloadToFile).toHaveBeenCalledOnce();
  });

  it('deletes the file and throws on a post-download checksum mismatch', async () => {
    const deps = makeDeps({ sha256OfFile: vi.fn(async () => 'bad00000') });
    await expect(
      ensureVerifiedArtifact({ artifact, destPath: '/d/model.gguf', deps }),
    ).rejects.toBeInstanceOf(ChecksumMismatchError);
    expect(deps.deleteFile).toHaveBeenCalledWith('/d/model.gguf');
  });
});

describe('multimodal: ensureMultimodalArtifacts', () => {
  it('downloads+verifies both files and reports monotonic aggregate progress', async () => {
    const model = requireGgufVisionModel();
    const artifacts = resolveMultimodalArtifacts(model)!;
    const sha256OfFile = vi
      .fn()
      .mockResolvedValueOnce(artifacts.model.checksum)
      .mockResolvedValueOnce(artifacts.mmproj.checksum);
    const downloadToFile = vi.fn(
      async (_url: string, _dest: string, onProgress?: (f: number) => void) => {
        onProgress?.(0.5);
        onProgress?.(1);
      },
    );
    const deps = makeDeps({ sha256OfFile, downloadToFile });
    const progress: number[] = [];

    const result = await ensureMultimodalArtifacts({
      artifacts,
      modelPath: '/d/fixture-vision-model.gguf',
      mmprojPath: '/d/fixture-vision-projector.gguf',
      deps,
      onProgress: (f) => progress.push(f),
    });

    expect(result).toEqual({
      modelPath: '/d/fixture-vision-model.gguf',
      mmprojPath: '/d/fixture-vision-projector.gguf',
    });
    expect(downloadToFile).toHaveBeenCalledTimes(2);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
    expect(progress[progress.length - 1]).toBe(1);
  });
});

describe('multimodal: buildMultimodalMessages', () => {
  it('keeps a plain-string user turn when there are no images', () => {
    const messages = buildMultimodalMessages({
      systemPrompt: 'sys',
      messages: [{ role: 'assistant', content: 'prev' }],
      prompt: 'hello',
    });
    expect(messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'assistant', content: 'prev' },
      { role: 'user', content: 'hello' },
    ]);
  });

  it('emits a text+image_url content array for each attached image', () => {
    const messages = buildMultimodalMessages({
      prompt: 'describe',
      images: ['file:///a.jpg', 'data:image/png;base64,AAAA'],
    });
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          { type: 'image_url', image_url: { url: 'file:///a.jpg' } },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]);
  });
});

describe('multimodal: hasRunnableGgufArtifacts (picker installability predicate)', () => {
  it('is true for the catalog GGUF vision entry with verified artifacts', () => {
    expect(hasRunnableGgufArtifacts(requireGgufVisionModel())).toBe(true);
  });

  it('is false for the non-GGUF catalog default', () => {
    expect(hasRunnableGgufArtifacts(getDefaultModel())).toBe(false);
  });

  it('is false for the gated ExecuTorch vision row', () => {
    expect(hasRunnableGgufArtifacts(requireExecutorchVisionModel())).toBe(false);
  });

  it('is false for a vision gguf row missing its mmproj triple', () => {
    const base = requireGgufVisionModel();
    const broken: OnDeviceModel = { ...base, mmprojChecksum: undefined };
    expect(hasRunnableGgufArtifacts(broken)).toBe(false);
  });

  it('is true for a text-only gguf row with just the base triple', () => {
    const base = requireGgufVisionModel();
    const textOnly: OnDeviceModel = {
      ...base,
      capabilities: { ...base.capabilities, visionIn: false },
      mmprojUrl: undefined,
      mmprojChecksum: undefined,
      mmprojSizeBytes: undefined,
    };
    expect(hasRunnableGgufArtifacts(textOnly)).toBe(true);
  });
});

describe('multimodal: hasSufficientRAMForMultimodal (restructure §8 RAM gate)', () => {
  it('is false below the 3.5GB floor', () => {
    expect(hasSufficientRAMForMultimodal(0)).toBe(false);
    expect(hasSufficientRAMForMultimodal(2048)).toBe(false);
    expect(hasSufficientRAMForMultimodal(MULTIMODAL_MIN_RAM_MB - 1)).toBe(false);
  });

  it('is true at and above the 3.5GB floor', () => {
    expect(hasSufficientRAMForMultimodal(MULTIMODAL_MIN_RAM_MB)).toBe(true);
    expect(hasSufficientRAMForMultimodal(6144)).toBe(true);
  });

  it('the exported floor is exactly 3500MB (~3.5GB)', () => {
    expect(MULTIMODAL_MIN_RAM_MB).toBe(3500);
  });

  it('fails closed on an unknown (zero) RAM reading', () => {
    expect(hasSufficientRAMForMultimodal(0)).toBe(false);
  });
});
