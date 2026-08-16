import {
  getCapabilities,
  getDefaultModel,
  getModelsForRole,
  MULTIMODAL_MIN_RAM_MB,
} from '@agiworkforce/local-llm';
import {
  useModelInstallStore,
  MULTIMODAL_RAM_LOCK_REASON,
} from '../src/features/model-picker/installStore';
import type { ModelDef } from '../src/features/model-picker/service';
import { downloadModel } from '@/services/modelDownload';

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn().mockResolvedValue(null),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  recordInstalledModel: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual('@agiworkforce/local-llm'),
  getCapabilities: jest.fn(),
}));

const mockGetCapabilities = getCapabilities as jest.MockedFunction<typeof getCapabilities>;
const VISION_CATALOG_MODEL = getModelsForRole('premium-vision-pack').find(
  (model) => !model.shipsInV1 && model.format === 'gguf' && model.capabilities.visionIn,
);
const DEFAULT_CATALOG_MODEL = getDefaultModel();

if (!VISION_CATALOG_MODEL) {
  throw new Error('Local catalog has no hidden tier-3 vision model');
}

function capsWithRam(totalRAMMB: number) {
  return {
    totalRAMMB,
    osVersion: '17.0',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable' as const,
    tier2Available: totalRAMMB >= 3500,
    tier3Available: true as const,
  };
}

function visionModelDef(): ModelDef {
  return {
    id: VISION_CATALOG_MODEL.id,
    name: VISION_CATALOG_MODEL.displayName,
    provider: 'local',
    providerLabel: 'On device',
    contextWindow: VISION_CATALOG_MODEL.contextWindow,
    maxOutput: 8192,
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
}

function textDefaultDef(): ModelDef {
  return {
    ...visionModelDef(),
    id: DEFAULT_CATALOG_MODEL.id,
    name: DEFAULT_CATALOG_MODEL.displayName,
    contextWindow: DEFAULT_CATALOG_MODEL.contextWindow,
    supportsVision: DEFAULT_CATALOG_MODEL.capabilities.visionIn,
    fileSizeBytes: DEFAULT_CATALOG_MODEL.fileSizeBytes,
    license: DEFAULT_CATALOG_MODEL.license,
    executorchPreset: DEFAULT_CATALOG_MODEL.executorchPreset,
  };
}

function resetStore(): void {
  useModelInstallStore.setState({
    installedModelIds: [],
    readySystemModelIds: [],
    totalRAMMB: null,
    jobs: {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('multimodal RAM gate (>=3.5GB) in the model picker install store', () => {
  it('locks the tier-3 vision pack with an honest reason below the floor', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(2048));
    await useModelInstallStore.getState().hydrateInstalledModels();

    const status = useModelInstallStore.getState().statusForModel(visionModelDef());
    expect(status.status).toBe('locked');
    expect(status.error).toBe(MULTIMODAL_RAM_LOCK_REASON);
  });

  it('does not RAM-lock the vision pack at or above the floor', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(MULTIMODAL_MIN_RAM_MB));
    await useModelInstallStore.getState().hydrateInstalledModels();

    const status = useModelInstallStore.getState().statusForModel(visionModelDef());
    expect(status.status).toBe('download_required');
    expect(status.error).toBeUndefined();
  });

  it('fails closed while RAM is unknown (no capability answer yet)', () => {
    const status = useModelInstallStore.getState().statusForModel(visionModelDef());
    expect(status.status).toBe('locked');
    expect(status.error).toBe(MULTIMODAL_RAM_LOCK_REASON);
  });

  it('never RAM-locks non-multimodal rows, even below the floor', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(2048));
    await useModelInstallStore.getState().hydrateInstalledModels();

    const status = useModelInstallStore.getState().statusForModel(textDefaultDef());
    expect(status.status).toBe('download_required');
  });

  it('prepareModel hard-refuses a below-floor multimodal install (no download starts)', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(2048));

    await expect(useModelInstallStore.getState().prepareModel(visionModelDef())).rejects.toThrow(
      MULTIMODAL_RAM_LOCK_REASON,
    );
    expect(downloadModel).not.toHaveBeenCalled();

    const job = useModelInstallStore.getState().jobs[VISION_CATALOG_MODEL.id];
    expect(job?.status).toBe('locked');
    expect(job?.error).toBe(MULTIMODAL_RAM_LOCK_REASON);
  });

  it('prepareModel allows the multimodal install at the floor (authoritative re-check)', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(8192));

    await useModelInstallStore.getState().prepareModel(visionModelDef());

    expect(downloadModel).toHaveBeenCalledTimes(1);
    expect(useModelInstallStore.getState().jobs[VISION_CATALOG_MODEL.id]?.status).toBe('ready');
  });
});
