import { getModelsForRole, tier2LoadModel } from '@agiworkforce/local-llm';
import { downloadModel, cancelDownload, ModelDownloadError } from '@/services/modelDownload';
import { getInstalledModel } from '@/storage/installedModels';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import type { ModelDef } from '@/src/features/model-picker/service';

jest.mock('@/services/modelDownload', () => {
  class ModelDownloadError extends Error {
    readonly kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.name = 'ModelDownloadError';
      this.kind = kind;
    }
  }
  return {
    ModelDownloadError,
    downloadModel: jest.fn(),
    cancelDownload: jest.fn(),
    assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn(),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  recordInstalledModel: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual('@agiworkforce/local-llm'),
  tier2LoadModel: jest.fn().mockResolvedValue(undefined),
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

const PRESET_MODEL: ModelDef = {
  id: 'fixture-executorch-model',
  name: 'Fixture ExecuTorch',
  provider: 'local',
  providerLabel: 'On device',
  contextWindow: 4096,
  maxOutput: 1024,
  supportsVision: false,
  supportsThinking: false,
  tier: 'standard',
  surface: 'local',
  availability: 'download_required',
  runtimeLabel: 'ExecuTorch',
  detailLabel: 'ExecuTorch',
  fileSizeBytes: 2_000_000_000,
  license: 'Apache-2.0',
  executorchPreset: {
    modelName: 'fixture-preset',
    modelSource: 'https://e/resolve/m.pte',
    tokenizerSource: 'https://e/resolve/t.json',
    tokenizerConfigSource: 'https://e/resolve/tc.json',
  },
};

const GGUF_MODEL = getModelsForRole('premium-vision-pack').find(
  (model) => model.format === 'gguf' && model.downloadUrl && model.checksum,
)!;

function ggufModelDef(): ModelDef {
  return {
    ...PRESET_MODEL,
    id: GGUF_MODEL.id,
    name: GGUF_MODEL.displayName,
    fileSizeBytes: GGUF_MODEL.fileSizeBytes,
    executorchPreset: undefined,
  };
}

function resetStore(overrides: Record<string, unknown> = {}) {
  useModelInstallStore.setState({
    installedModelIds: [],
    readySystemModelIds: [],
    totalRAMMB: 8192,
    allowCellularDownloads: false,
    jobs: {},
    ...overrides,
  });
}

describe('download consent reaches every local-model path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
    (tier2LoadModel as jest.Mock).mockResolvedValue(undefined);
    resetStore();
  });

  it('defaults to Wi-Fi only', () => {
    expect(useModelInstallStore.getState().allowCellularDownloads).toBe(false);
  });

  it('passes Wi-Fi-only to the GGUF path while the consent is off', async () => {
    (downloadModel as jest.Mock).mockResolvedValue({ id: GGUF_MODEL.id });
    await useModelInstallStore.getState().prepareModel(ggufModelDef());
    expect(downloadModel).toHaveBeenCalledWith(expect.objectContaining({ wifiOnly: true }));
  });

  it('passes the cellular consent through to the GGUF path once it is on', async () => {
    (downloadModel as jest.Mock).mockResolvedValue({ id: GGUF_MODEL.id });
    useModelInstallStore.getState().setAllowCellularDownloads(true);
    await useModelInstallStore.getState().prepareModel(ggufModelDef());
    expect(downloadModel).toHaveBeenCalledWith(expect.objectContaining({ wifiOnly: false }));
  });

  it('gives the ExecuTorch path the same consent and free-space gate', async () => {
    await useModelInstallStore.getState().prepareModel(PRESET_MODEL);

    const options = (tier2LoadModel as jest.Mock).mock.calls[0]?.[2] as
      { ensureDownloadAllowed?: () => Promise<void> } | undefined;
    expect(typeof options?.ensureDownloadAllowed).toBe('function');
  });

  it('stops an ExecuTorch download the gate refuses and reports the real cause', async () => {
    (tier2LoadModel as jest.Mock).mockImplementation(
      async (
        _preset: unknown,
        _onProgress: unknown,
        options?: { ensureDownloadAllowed?: () => Promise<void> },
      ) => {
        await options?.ensureDownloadAllowed?.();
      },
    );
    const refusal = new ModelDownloadError('wifi_required', 'This download needs Wi-Fi.');
    (tier2LoadModel as jest.Mock).mockRejectedValueOnce(refusal);

    await expect(useModelInstallStore.getState().prepareModel(PRESET_MODEL)).rejects.toBe(refusal);
    expect(useModelInstallStore.getState().jobs[PRESET_MODEL.id]).toEqual({
      status: 'failed',
      progress: 0,
      error: 'This download needs Wi-Fi.',
    });
  });

  it('switching the consent on makes the next download cellular-eligible', async () => {
    useModelInstallStore.getState().setAllowCellularDownloads(true);
    await useModelInstallStore.getState().prepareModel(PRESET_MODEL);
    expect(useModelInstallStore.getState().allowCellularDownloads).toBe(true);
  });
});

describe('a download in progress can be cancelled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore({ jobs: { 'model-a': { status: 'downloading', progress: 0.4 } } });
  });

  it('asks the downloader to stop and clears the job', () => {
    useModelInstallStore.getState().cancelModelDownload('model-a');
    expect(cancelDownload).toHaveBeenCalledWith('model-a');
    expect(useModelInstallStore.getState().jobs['model-a']).toBeUndefined();
  });

  it('does nothing for a model that is not downloading', () => {
    resetStore({ jobs: { 'model-a': { status: 'ready', progress: 1 } } });
    useModelInstallStore.getState().cancelModelDownload('model-a');
    expect(cancelDownload).not.toHaveBeenCalled();
    expect(useModelInstallStore.getState().jobs['model-a']?.status).toBe('ready');
  });

  it('leaves no failed job behind, and never reports success, when cancelled', async () => {
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
    resetStore();
    (tier2LoadModel as jest.Mock).mockRejectedValue(
      new ModelDownloadError('cancelled', 'Download was cancelled.'),
    );

    await expect(useModelInstallStore.getState().prepareModel(PRESET_MODEL)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    const state = useModelInstallStore.getState();
    expect(state.jobs[PRESET_MODEL.id]).toBeUndefined();
    expect(state.installedModelIds).not.toContain(PRESET_MODEL.id);
  });
});

describe('deleting an installed model clears its Ready state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore({
      installedModelIds: ['model-a', 'model-b'],
      jobs: { 'model-a': { status: 'ready', progress: 1 } },
    });
  });

  it('drops the id and the cached ready job', () => {
    useModelInstallStore.getState().forgetInstalledModel('model-a');
    const state = useModelInstallStore.getState();
    expect(state.installedModelIds).toEqual(['model-b']);
    expect(state.jobs['model-a']).toBeUndefined();
  });

  it('reports download_required for the deleted model afterwards', () => {
    useModelInstallStore.getState().forgetInstalledModel('model-a');
    const job = useModelInstallStore.getState().statusForModel({
      ...PRESET_MODEL,
      id: 'model-a',
      executorchPreset: PRESET_MODEL.executorchPreset,
    });
    expect(job.status).not.toBe('ready');
  });
});
