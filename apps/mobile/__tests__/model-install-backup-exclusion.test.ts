import { tier2LoadModel } from '@agiworkforce/local-llm';
import { excludeModelFilesFromBackup } from '@/services/modelDownload';
import { getInstalledModel, recordInstalledModel } from '@/storage/installedModels';
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
    excludeModelFilesFromBackup: jest.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  jest.clearAllMocks();
  (getInstalledModel as jest.Mock).mockResolvedValue(null);
  useModelInstallStore.setState({
    installedModelIds: [],
    readySystemModelIds: [],
    totalRAMMB: 8192,
    allowCellularDownloads: true,
    jobs: {},
  });
});

describe('model files outside the GGUF download path stay out of backups', () => {
  it('marks the files of models downloaded by an earlier build when installed models load', async () => {
    await useModelInstallStore.getState().hydrateInstalledModels();
    expect(excludeModelFilesFromBackup).toHaveBeenCalled();
  });

  it('marks an ExecuTorch download once its files are saved, before recording it as installed', async () => {
    await useModelInstallStore.getState().prepareModel(PRESET_MODEL);

    const loadOrder = (tier2LoadModel as jest.Mock).mock.invocationCallOrder[0]!;
    const recordOrder = (recordInstalledModel as jest.Mock).mock.invocationCallOrder[0]!;
    const exclusionOrder = (excludeModelFilesFromBackup as jest.Mock).mock.invocationCallOrder[0]!;
    expect(exclusionOrder).toBeGreaterThan(loadOrder);
    expect(exclusionOrder).toBeLessThan(recordOrder);
  });
});
