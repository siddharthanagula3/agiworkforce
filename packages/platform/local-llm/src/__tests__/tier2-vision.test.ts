/**
 * Tier-2 ExecuTorch vision plumbing (W10 residual, wired 2026-07-16):
 *  - VLM presets load with `capabilities:['vision']` + the model card's
 *    generation config, mirroring react-native-executorch's own exported
 *    preset constants;
 *  - the current turn's image rides `mediaPath` on the user message ONLY when
 *    the loaded model is vision-capable (capability honesty);
 *  - `effectiveTier2VisionIn` reports vision only for an INSTALLED tier-2 VLM
 *    — never from the catalog flag alone (both-tiers honesty rule);
 *  - the catalog-selected tier-2 vision row carries verified artifact fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutorchPreset, OnDeviceModel } from '@agiworkforce/types';
import {
  tier2Generate,
  tier2LoadModel,
  tier2Release,
  tier2IsVisionReady,
  executorchVlmPresetInfo,
  _setLLMModuleForTesting,
} from '../tier2.js';
import { effectiveTier2VisionIn, effectiveVisionIn } from '../multimodal.js';
import { getDefaultModel } from '../catalog.js';
import { requireExecutorchVisionModel, requireGgufVisionModel } from './catalog-fixtures.js';

const makeInstance = () => ({
  generate: vi.fn().mockResolvedValue('described the image'),
  setTokenCallback: vi.fn(),
  configure: vi.fn(),
  interrupt: vi.fn(),
  delete: vi.fn(),
});

let mockInstance = makeInstance();
const mockFromModelName = vi.fn().mockImplementation(() => Promise.resolve(mockInstance));

beforeEach(() => {
  vi.clearAllMocks();
  mockInstance = makeInstance();
  mockFromModelName.mockImplementation(() => Promise.resolve(mockInstance));
  _setLLMModuleForTesting({ fromModelName: mockFromModelName });
  tier2Release();
});

const VISION_MODEL = requireExecutorchVisionModel();
const VISION_PRESET: ExecutorchPreset = VISION_MODEL.executorchPreset!;
const TEXT_PRESET: ExecutorchPreset = getDefaultModel().executorchPreset!;

describe('tier2 vision: VLM preset loading', () => {
  it('loads the catalog VLM preset with its vision capability and generation config', async () => {
    await tier2LoadModel(VISION_PRESET);

    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: VISION_PRESET.modelName,
        capabilities: ['vision'],
      }),
      undefined,
    );
    // Model card sampling settings — mirrors the package's own preset export.
    expect(mockInstance.configure).toHaveBeenCalledWith({
      generationConfig: VISION_PRESET.generationConfig,
    });
    expect(tier2IsVisionReady()).toBe(true);
  });

  it('loads text-only presets without capabilities (byte-for-byte unchanged)', async () => {
    await tier2LoadModel(TEXT_PRESET);

    const namedSources = mockFromModelName.mock.calls[0]![0] as Record<string, unknown>;
    expect('capabilities' in namedSources).toBe(false);
    expect(mockInstance.configure).not.toHaveBeenCalled();
    expect(tier2IsVisionReady()).toBe(false);
  });

  it('is not vision-ready before any load, and resets on release', async () => {
    expect(tier2IsVisionReady()).toBe(false);
    await tier2LoadModel(VISION_PRESET);
    expect(tier2IsVisionReady()).toBe(true);
    tier2Release();
    expect(tier2IsVisionReady()).toBe(false);
  });
});

describe('tier2 vision: image attachment on generate', () => {
  it('attaches the turn image as mediaPath on the user message for a vision model', async () => {
    await tier2Generate(VISION_PRESET, {
      prompt: 'What is in this photo?',
      images: ['file:///tmp/photo.jpg'],
    });

    const messages = mockInstance.generate.mock.calls[0]![0] as Array<{
      role: string;
      content: string;
      mediaPath?: string;
    }>;
    const userMessage = messages[messages.length - 1]!;
    expect(userMessage.role).toBe('user');
    expect(userMessage.mediaPath).toBe('file:///tmp/photo.jpg');
  });

  it('ignores images on a text-only model (no mediaPath ever)', async () => {
    await tier2Generate(TEXT_PRESET, {
      prompt: 'What is in this photo?',
      images: ['file:///tmp/photo.jpg'],
    });

    const messages = mockInstance.generate.mock.calls[0]![0] as Array<{ mediaPath?: string }>;
    expect(messages.every((m) => m.mediaPath === undefined)).toBe(true);
  });

  it('skips data: URLs (ExecuTorch takes file paths only, unlike llama.rn)', async () => {
    await tier2Generate(VISION_PRESET, {
      prompt: 'Describe',
      images: ['data:image/png;base64,AAAA', 'file:///tmp/real.png'],
    });

    const messages = mockInstance.generate.mock.calls[0]![0] as Array<{ mediaPath?: string }>;
    expect(messages[messages.length - 1]!.mediaPath).toBe('file:///tmp/real.png');
  });
});

describe('capability honesty: visionIn is install-gated for BOTH tiers', () => {
  it('tier-3 (mmproj): false without the installed projector', () => {
    const visionModel = requireGgufVisionModel();
    expect(effectiveVisionIn(visionModel, { mmprojInstalled: false })).toBe(false);
    expect(effectiveVisionIn(visionModel, { mmprojInstalled: true })).toBe(true);
  });

  it('tier-2 (single .pte): false without the installed model', () => {
    expect(effectiveTier2VisionIn(VISION_MODEL, { modelInstalled: false })).toBe(false);
    expect(effectiveTier2VisionIn(VISION_MODEL, { modelInstalled: true })).toBe(true);
  });

  it('tier-2 effective vision requires a vision catalog row with a preset', () => {
    const noVision: OnDeviceModel = {
      ...VISION_MODEL,
      capabilities: { ...VISION_MODEL.capabilities, visionIn: false },
    };
    expect(effectiveTier2VisionIn(noVision, { modelInstalled: true })).toBe(false);

    const noPreset: OnDeviceModel = { ...VISION_MODEL, executorchPreset: undefined };
    expect(effectiveTier2VisionIn(noPreset, { modelInstalled: true })).toBe(false);
  });
});

describe('catalog tier-2 vision entry (verified artifact fields)', () => {
  it('resolves with the verified checksum, size, and package-mirrored preset', () => {
    const model = requireExecutorchVisionModel();

    // Verified 2026-07-16 against the HF LFS pointer AND x-linked-etag/size
    // (two independent endpoints) for resolve/v0.8.0.
    expect(model.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(model.fileSizeBytes).toBeGreaterThan(0);
    expect(model.format).toBe('pte');

    // Preset mirrors the catalog-owned react-native-executorch export.
    expect(model.executorchPreset).toMatchObject({
      capabilities: ['vision'],
      generationConfig: expect.any(Object),
    });
    expect(new URL(model.executorchPreset!.modelSource).protocol).toBe('https:');
    expect(model.downloadUrl).toBe(model.executorchPreset!.modelSource);

    // Nominal vision + VLM runtime metadata; ship gate stays device QA.
    expect(model.capabilities.visionIn).toBe(true);
    expect(model.shipsInV1).toBe(false);
    expect(executorchVlmPresetInfo(model.executorchPreset!.modelName)?.capabilities).toEqual([
      'vision',
    ]);
  });
});
