import { describe, expect, it, vi } from 'vitest';
import type { OnDeviceModel } from '@agiworkforce/types';
import {
  ChecksumMismatchError,
  buildMultimodalMessages,
  effectiveVisionIn,
  ensureMultimodalArtifacts,
  ensureVerifiedArtifact,
  hasRunnableGgufArtifacts,
  isMultimodalModel,
  resolveMultimodalArtifacts,
  type FileSystemDeps,
} from '../multimodal.js';
import { getModelById } from '../catalog.js';

const CHECK = '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae';
const MMPROJ = 'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82';

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
  it('resolves the qwen3-vl-2b base + mmproj artifact pair from the real catalog entry', () => {
    const model = getModelById('qwen3-vl-2b-instruct')!;
    const artifacts = resolveMultimodalArtifacts(model);
    expect(artifacts).not.toBeNull();
    expect(artifacts!.model.checksum).toBe(CHECK);
    expect(artifacts!.mmproj.checksum).toBe(MMPROJ);
    expect(artifacts!.model.sizeBytes).toBe(1_107_409_952);
    expect(artifacts!.mmproj.sizeBytes).toBe(445_053_216);
    expect(isMultimodalModel(model)).toBe(true);
  });

  it('returns null for a text-only model (default qwen3-4b)', () => {
    const model = getModelById('qwen3-4b-instruct-2507')!;
    expect(resolveMultimodalArtifacts(model)).toBeNull();
    expect(isMultimodalModel(model)).toBe(false);
  });

  it('returns null when the mmproj fields are absent even if visionIn is true', () => {
    const base = getModelById('qwen3-vl-2b-instruct')!;
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
    const model = getModelById('qwen3-vl-2b-instruct')!;
    expect(effectiveVisionIn(model, { mmprojInstalled: false })).toBe(false);
    expect(effectiveVisionIn(model, { mmprojInstalled: true })).toBe(true);
  });

  it('is always false for a text-only model regardless of mmproj flag', () => {
    const model = getModelById('qwen3-4b-instruct-2507')!;
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
      .mockResolvedValueOnce('deadbeef') // stale on-disk
      .mockResolvedValueOnce(CHECK); // good after re-download
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
    const model = getModelById('qwen3-vl-2b-instruct')!;
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
      modelPath: '/d/qwen3-vl.gguf',
      mmprojPath: '/d/qwen3-vl.mmproj.gguf',
      deps,
      onProgress: (f) => progress.push(f),
    });

    expect(result).toEqual({
      modelPath: '/d/qwen3-vl.gguf',
      mmprojPath: '/d/qwen3-vl.mmproj.gguf',
    });
    expect(downloadToFile).toHaveBeenCalledTimes(2);
    // progress never decreases and ends at 1.
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
  it('is true for the qwen3-vl entry (verified base + mmproj artifacts)', () => {
    expect(hasRunnableGgufArtifacts(getModelById('qwen3-vl-2b-instruct')!)).toBe(true);
  });

  it('is false for non-gguf catalog rows (default qwen3-4b, ExecuTorch-managed)', () => {
    expect(hasRunnableGgufArtifacts(getModelById('qwen3-4b-instruct-2507')!)).toBe(false);
  });

  it('is false for the gated lfm2-vl row (no verified download url)', () => {
    expect(hasRunnableGgufArtifacts(getModelById('lfm2-vl-1.6b')!)).toBe(false);
  });

  it('is false for a vision gguf row missing its mmproj triple', () => {
    const base = getModelById('qwen3-vl-2b-instruct')!;
    const broken: OnDeviceModel = { ...base, mmprojChecksum: undefined };
    expect(hasRunnableGgufArtifacts(broken)).toBe(false);
  });

  it('is true for a text-only gguf row with just the base triple', () => {
    const base = getModelById('qwen3-vl-2b-instruct')!;
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
