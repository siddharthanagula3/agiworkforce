/**
 * Coverage for llama-rn GGUF rows in the model picker + install store:
 *  - the selectability predicate accepts rows with verified GGUF artifacts
 *    (base + mmproj) and still rejects rows without runnable artifacts;
 *  - shipsInV1:false vision rows stay hidden from
 *    the production LOCAL_MODEL_LIST;
 *  - installStore.prepareModel routes preset-less GGUF rows through
 *    services/modelDownload with the mmproj fields and lands on 'ready' with
 *    the same job contract the ExecuTorch path uses.
 */

import type { OnDeviceModel } from '@agiworkforce/types';
import { getModelsForRole } from '@agiworkforce/local-llm';
import {
  isSelectableLocalCatalogModel,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from '../src/features/model-picker/service';
import { useModelInstallStore } from '../src/features/model-picker/installStore';
import { downloadModel } from '@/services/modelDownload';
import { getInstalledModel } from '@/storage/installedModels';
import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn(),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  recordInstalledModel: jest.fn(),
}));

// The multimodal RAM gate (model-picker-ram-gate.test.ts) fails closed on an
// unknown RAM reading; these tests exercise the DOWNLOAD branch, so report a
// vision-capable device.
jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual('@agiworkforce/local-llm'),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: '17.0',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable',
    tier2Available: true,
    tier3Available: true,
  }),
}));

const HEX = 'a'.repeat(64);
const VISION_CATALOG_MODEL = getModelsForRole('premium-vision-pack').find(
  (model) =>
    !model.shipsInV1 &&
    model.format === 'gguf' &&
    model.downloadUrl &&
    model.checksum &&
    model.mmprojUrl &&
    model.mmprojChecksum &&
    model.mmprojSizeBytes,
);

if (!VISION_CATALOG_MODEL) {
  throw new Error('Local catalog has no hidden GGUF vision model with verified artifacts');
}

function ggufRow(overrides: Partial<OnDeviceModel> = {}): OnDeviceModel {
  return {
    id: SYNTHETIC_LOCAL_MODEL_ID,
    displayName: 'Fixture Vision Model',
    family: 'fixture-vision-family',
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
        modelName: 'fixture-executorch-preset',
        modelSource: 'https://e/resolve/m.pte',
        tokenizerSource: 'https://e/resolve/t.json',
        tokenizerConfigSource: 'https://e/resolve/tc.json',
      },
    });
    expect(isSelectableLocalCatalogModel(row)).toBe(true);
  });

  it('keeps the catalog-owned shipsInV1:false vision pack hidden from the production list', () => {
    expect(LOCAL_MODEL_LIST.some((model) => model.id === VISION_CATALOG_MODEL.id)).toBe(false);
  });
});

describe('installStore.prepareModel GGUF branch', () => {
  const visionModelDef: ModelDef = {
    id: VISION_CATALOG_MODEL.id,
    name: VISION_CATALOG_MODEL.displayName,
    provider: 'local',
    providerLabel: 'On device',
    contextWindow: VISION_CATALOG_MODEL.contextWindow,
    maxOutput: 8_192,
    supportsVision: VISION_CATALOG_MODEL.capabilities.visionIn,
    supportsThinking: false,
    tier: 'premium',
    surface: 'local',
    availability: 'download_required',
    runtimeLabel: 'llama.rn',
    detailLabel: 'llama.rn - Vision',
    fileSizeBytes: VISION_CATALOG_MODEL.fileSizeBytes,
    license: VISION_CATALOG_MODEL.license,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
    useModelInstallStore.setState({
      installedModelIds: [],
      readySystemModelIds: [],
      totalRAMMB: 8192,
      jobs: {},
    });
  });

  it('downloads the base + mmproj artifacts via modelDownload and lands ready', async () => {
    (downloadModel as jest.Mock).mockImplementation(async (opts) => {
      opts.onProgress?.(500, 1_000, 0);
      return { id: opts.modelId };
    });

    await useModelInstallStore.getState().prepareModel(visionModelDef);

    expect(downloadModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: VISION_CATALOG_MODEL.id,
        format: VISION_CATALOG_MODEL.format,
        downloadUrl: VISION_CATALOG_MODEL.downloadUrl,
        checksum: VISION_CATALOG_MODEL.checksum,
        mmprojUrl: VISION_CATALOG_MODEL.mmprojUrl,
        mmprojChecksum: VISION_CATALOG_MODEL.mmprojChecksum,
        mmprojSizeBytes: VISION_CATALOG_MODEL.mmprojSizeBytes,
      }),
    );
    const state = useModelInstallStore.getState();
    expect(state.jobs[VISION_CATALOG_MODEL.id]).toEqual({ status: 'ready', progress: 1 });
    expect(state.installedModelIds).toContain(VISION_CATALOG_MODEL.id);
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
    expect(useModelInstallStore.getState().jobs[VISION_CATALOG_MODEL.id]).toEqual({
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
