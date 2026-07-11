/**
 * Coverage for llama-rn GGUF rows in the model picker + install store:
 *  - the selectability predicate accepts rows with verified GGUF artifacts
 *    (base + mmproj) and still rejects rows without runnable artifacts;
 *  - shipsInV1:false rows (the current qwen3-vl vision pack) stay hidden from
 *    the production LOCAL_MODEL_LIST;
 *  - installStore.prepareModel routes preset-less GGUF rows through
 *    services/modelDownload with the mmproj fields and lands on 'ready' with
 *    the same job contract the ExecuTorch path uses.
 */

import type { OnDeviceModel } from '@agiworkforce/types';
import {
  isSelectableLocalCatalogModel,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from '../src/features/model-picker/service';
import { useModelInstallStore } from '../src/features/model-picker/installStore';
import { downloadModel } from '@/services/modelDownload';
import { getInstalledModel } from '@/storage/installedModels';

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn(),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  recordInstalledModel: jest.fn(),
}));

const HEX = 'a'.repeat(64);

function ggufRow(overrides: Partial<OnDeviceModel> = {}): OnDeviceModel {
  return {
    id: 'hypothetical-vl',
    displayName: 'Hypothetical VL',
    family: 'qwen3-vl',
    paramCountB: 2,
    fileSizeBytes: 1_000,
    supportedRuntimes: ['llama-rn'],
    contextWindow: 32_768,
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Apache-2.0',
    role: 'premium-vision-pack',
    shipsInV1: true,
    downloadUrl: 'https://example.com/model.gguf',
    checksum: HEX,
    format: 'gguf',
    mmprojUrl: 'https://example.com/mmproj.gguf',
    mmprojChecksum: HEX,
    mmprojSizeBytes: 500,
    ...overrides,
  };
}

describe('picker selectability for llama-rn GGUF rows', () => {
  it('accepts a hypothetical shipsInV1 llama-rn row with verified artifacts', () => {
    expect(isSelectableLocalCatalogModel(ggufRow())).toBe(true);
  });

  it('rejects a llama-rn row without a verified checksum', () => {
    expect(isSelectableLocalCatalogModel(ggufRow({ checksum: undefined }))).toBe(false);
  });

  it('rejects a vision llama-rn row missing its mmproj artifact', () => {
    expect(
      isSelectableLocalCatalogModel(
        ggufRow({ mmprojUrl: undefined, mmprojChecksum: undefined, mmprojSizeBytes: undefined }),
      ),
    ).toBe(false);
  });

  it('still accepts ExecuTorch preset rows (existing behavior unchanged)', () => {
    const row = ggufRow({
      format: undefined,
      downloadUrl: undefined,
      checksum: undefined,
      supportedRuntimes: ['executorch'],
      executorchPreset: {
        modelName: 'x',
        modelSource: 'https://e/resolve/m.pte',
        tokenizerSource: 'https://e/resolve/t.json',
        tokenizerConfigSource: 'https://e/resolve/tc.json',
      },
    });
    expect(isSelectableLocalCatalogModel(row)).toBe(true);
  });

  it('keeps the shipsInV1:false qwen3-vl pack hidden from the production list', () => {
    expect(LOCAL_MODEL_LIST.some((m) => m.id === 'qwen3-vl-2b-instruct')).toBe(false);
  });
});

describe('installStore.prepareModel GGUF branch', () => {
  const visionModelDef: ModelDef = {
    id: 'qwen3-vl-2b-instruct',
    name: 'AGI Vision Pack',
    provider: 'local',
    providerLabel: 'On device',
    contextWindow: 262_144,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    tier: 'premium',
    surface: 'local',
    availability: 'download_required',
    runtimeLabel: 'llama.rn',
    detailLabel: 'llama.rn - 1.0 GB - Vision',
    fileSizeBytes: 1_107_409_952,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
    useModelInstallStore.setState({ installedModelIds: [], readySystemModelIds: [], jobs: {} });
  });

  it('downloads the base + mmproj artifacts via modelDownload and lands ready', async () => {
    (downloadModel as jest.Mock).mockImplementation(async (opts) => {
      opts.onProgress?.(500, 1_000, 0);
      return { id: opts.modelId };
    });

    await useModelInstallStore.getState().prepareModel(visionModelDef);

    expect(downloadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'qwen3-vl-2b-instruct',
        format: 'gguf',
        downloadUrl: expect.stringContaining('Qwen3VL-2B-Instruct-Q4_K_M.gguf'),
        checksum: '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae',
        mmprojUrl: expect.stringContaining('mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf'),
        mmprojChecksum: 'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82',
        mmprojSizeBytes: 445_053_216,
      }),
    );
    const state = useModelInstallStore.getState();
    expect(state.jobs['qwen3-vl-2b-instruct']).toEqual({ status: 'ready', progress: 1 });
    expect(state.installedModelIds).toContain('qwen3-vl-2b-instruct');
  });

  it('surfaces download failures as failed jobs (same contract as ExecuTorch path)', async () => {
    (downloadModel as jest.Mock).mockRejectedValue(new Error('checksum mismatch'));

    // The RAW error still propagates to the caller (for logging/diagnostics)…
    await expect(useModelInstallStore.getState().prepareModel(visionModelDef)).rejects.toThrow(
      'checksum mismatch',
    );
    // …but the failed JOB carries a generic user-safe message by design — the
    // store deliberately never surfaces internal driver errors (e.g. sqlite
    // execAsync failures) to the UI (see installStore prepareModel catch).
    expect(useModelInstallStore.getState().jobs['qwen3-vl-2b-instruct']).toEqual({
      status: 'failed',
      progress: 0,
      error: 'Unable to prepare the model. Please try again.',
    });
  });

  it('reports download_required (not unavailable) for gguf-installable rows', () => {
    const job = useModelInstallStore.getState().statusForModel(visionModelDef);
    expect(job.status).toBe('download_required');
  });
});
