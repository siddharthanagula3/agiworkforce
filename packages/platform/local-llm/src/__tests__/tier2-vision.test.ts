/**
 * Tier-2 ExecuTorch vision plumbing (W10 residual, wired 2026-07-16):
 *  - VLM presets load with `capabilities:['vision']` + the model card's
 *    generation config, mirroring react-native-executorch's own exported
 *    preset constants;
 *  - the current turn's image rides `mediaPath` on the user message ONLY when
 *    the loaded model is vision-capable (capability honesty);
 *  - `effectiveTier2VisionIn` reports vision only for an INSTALLED tier-2 VLM
 *    — never from the catalog flag alone (both-tiers honesty rule);
 *  - the LFM2-VL-450M catalog row carries verified artifact fields.
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
import { getModelById } from '../catalog.js';

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

const LFM2_VL_PRESET: ExecutorchPreset = getModelById('lfm2-vl-450m')!.executorchPreset!;

const TEXT_PRESET: ExecutorchPreset = {
  modelName: 'qwen3-4b-quantized',
  modelSource: 'https://example.com/qwen3_4b.pte',
  tokenizerSource: 'https://example.com/tokenizer.json',
  tokenizerConfigSource: 'https://example.com/tokenizer_config.json',
};

describe('tier2 vision: VLM preset loading', () => {
  it('loads the LFM2-VL preset with the vision capability and generation config', async () => {
    await tier2LoadModel(LFM2_VL_PRESET);

    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: 'lfm2.5-vl-450m-quantized',
        capabilities: ['vision'],
      }),
      undefined,
    );
    // Model card sampling settings — mirrors the package's own preset export.
    expect(mockInstance.configure).toHaveBeenCalledWith({
      generationConfig: { temperature: 0.1, minP: 0.15, repetitionPenalty: 1.05 },
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
    await tier2LoadModel(LFM2_VL_PRESET);
    expect(tier2IsVisionReady()).toBe(true);
    tier2Release();
    expect(tier2IsVisionReady()).toBe(false);
  });
});

describe('tier2 vision: image attachment on generate', () => {
  it('attaches the turn image as mediaPath on the user message for a vision model', async () => {
    await tier2Generate(LFM2_VL_PRESET, {
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
    await tier2Generate(LFM2_VL_PRESET, {
      prompt: 'Describe',
      images: ['data:image/png;base64,AAAA', 'file:///tmp/real.png'],
    });

    const messages = mockInstance.generate.mock.calls[0]![0] as Array<{ mediaPath?: string }>;
    expect(messages[messages.length - 1]!.mediaPath).toBe('file:///tmp/real.png');
  });
});

describe('capability honesty: visionIn is install-gated for BOTH tiers', () => {
  it('tier-3 (mmproj): false without the installed projector', () => {
    const qwen = getModelById('qwen3-vl-2b-instruct')!;
    expect(effectiveVisionIn(qwen, { mmprojInstalled: false })).toBe(false);
    expect(effectiveVisionIn(qwen, { mmprojInstalled: true })).toBe(true);
  });

  it('tier-2 (single .pte): false without the installed model', () => {
    const lfm2 = getModelById('lfm2-vl-450m')!;
    expect(effectiveTier2VisionIn(lfm2, { modelInstalled: false })).toBe(false);
    expect(effectiveTier2VisionIn(lfm2, { modelInstalled: true })).toBe(true);
  });

  it('tier-2 effective vision requires a vision catalog row with a preset', () => {
    const lfm2 = getModelById('lfm2-vl-450m')!;
    const noVision: OnDeviceModel = {
      ...lfm2,
      capabilities: { ...lfm2.capabilities, visionIn: false },
    };
    expect(effectiveTier2VisionIn(noVision, { modelInstalled: true })).toBe(false);

    const noPreset: OnDeviceModel = { ...lfm2, executorchPreset: undefined };
    expect(effectiveTier2VisionIn(noPreset, { modelInstalled: true })).toBe(false);
  });
});

describe('LFM2-VL-450M catalog entry (verified artifact fields)', () => {
  it('resolves with the verified checksum, size, and package-mirrored preset', () => {
    const lfm2 = getModelById('lfm2-vl-450m')!;

    // Verified 2026-07-16 against the HF LFS pointer AND x-linked-etag/size
    // (two independent endpoints) for resolve/v0.8.0.
    expect(lfm2.checksum).toBe('c3aeead4499cb1c19de48d4216f3b2e9216b27770d768ea4650dbcaa1a998a9b');
    expect(lfm2.fileSizeBytes).toBe(648_917_376);
    expect(lfm2.format).toBe('pte');

    // Preset mirrors react-native-executorch 0.8.4's LFM2_5_VL_450M_QUANTIZED.
    expect(lfm2.executorchPreset).toEqual({
      modelName: 'lfm2.5-vl-450m-quantized',
      modelSource:
        'https://huggingface.co/software-mansion/react-native-executorch-lfm-2.5/resolve/v0.8.0/lfm2.5-VL-450M/lfm2_5_vl_450m_8da4w_xnnpack.pte',
      tokenizerSource:
        'https://huggingface.co/software-mansion/react-native-executorch-lfm-2.5/resolve/v0.8.0/lfm2.5-VL-450M/tokenizer.json',
      tokenizerConfigSource:
        'https://huggingface.co/software-mansion/react-native-executorch-lfm-2.5/resolve/v0.8.0/lfm2.5-VL-450M/tokenizer_config.json',
    });
    expect(lfm2.downloadUrl).toBe(lfm2.executorchPreset!.modelSource);

    // Nominal vision + VLM runtime metadata; ship gate stays device QA.
    expect(lfm2.capabilities.visionIn).toBe(true);
    expect(lfm2.shipsInV1).toBe(false);
    expect(executorchVlmPresetInfo('lfm2.5-vl-450m-quantized')?.capabilities).toEqual(['vision']);
  });
});
