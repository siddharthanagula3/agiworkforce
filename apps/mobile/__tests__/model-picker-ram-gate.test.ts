/**
 * Tier-3 multimodal RAM gate wiring (W10 residual, wired 2026-07-16):
 * a device below the 3.5 GB floor must see an HONEST DISABLED state for the
 * Qwen3-VL-2B tier-3 path — locked with a reason, never a download button —
 * and prepareModel must hard-refuse even if the UI raced hydration. Unknown
 * RAM fails closed, matching the package gate's default-deny posture.
 */
import type { OnDeviceModel } from '@agiworkforce/types';
import { getCapabilities, MULTIMODAL_MIN_RAM_MB } from '@agiworkforce/local-llm';
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

/** ModelDef for the REAL tier-3 multimodal catalog row (qwen3-vl-2b). */
function qwenVisionDef(): ModelDef {
  return {
    id: 'qwen3-vl-2b-instruct',
    name: 'AGI Vision Pack',
    provider: 'local',
    providerLabel: 'On device',
    contextWindow: 262_144,
    maxOutput: 8192,
    supportsVision: true,
    supportsThinking: false,
    tier: 'premium',
    surface: 'local',
    availability: 'download_required',
    runtimeLabel: 'llama.rn',
    detailLabel: 'llama.rn - 1.0 GB - Vision',
    fileSizeBytes: 1_107_409_952,
    license: 'Apache-2.0',
  };
}

/** ModelDef for a REAL text-only executorch catalog row (the default model). */
function textDefaultDef(): ModelDef {
  return {
    ...qwenVisionDef(),
    id: 'qwen3-4b-instruct-2507',
    name: 'AGI Standard',
    supportsVision: false,
    fileSizeBytes: 2_147_483_648,
    executorchPreset: {
      modelName: 'qwen3-4b-quantized',
      modelSource: 'https://example.com/model.pte',
      tokenizerSource: 'https://example.com/tokenizer.json',
      tokenizerConfigSource: 'https://example.com/tokenizer_config.json',
    },
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

    const status = useModelInstallStore.getState().statusForModel(qwenVisionDef());
    expect(status.status).toBe('locked');
    expect(status.error).toBe(MULTIMODAL_RAM_LOCK_REASON);
  });

  it('does not RAM-lock the vision pack at or above the floor', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(MULTIMODAL_MIN_RAM_MB));
    await useModelInstallStore.getState().hydrateInstalledModels();

    const status = useModelInstallStore.getState().statusForModel(qwenVisionDef());
    expect(status.status).toBe('download_required');
    expect(status.error).toBeUndefined();
  });

  it('fails closed while RAM is unknown (no capability answer yet)', () => {
    // No hydrate — totalRAMMB is still null.
    const status = useModelInstallStore.getState().statusForModel(qwenVisionDef());
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

    await expect(useModelInstallStore.getState().prepareModel(qwenVisionDef())).rejects.toThrow(
      MULTIMODAL_RAM_LOCK_REASON,
    );
    expect(downloadModel).not.toHaveBeenCalled();

    const job = useModelInstallStore.getState().jobs['qwen3-vl-2b-instruct'];
    expect(job?.status).toBe('locked');
    expect(job?.error).toBe(MULTIMODAL_RAM_LOCK_REASON);
  });

  it('prepareModel allows the multimodal install at the floor (authoritative re-check)', async () => {
    mockGetCapabilities.mockResolvedValue(capsWithRam(8192));

    await useModelInstallStore.getState().prepareModel(qwenVisionDef());

    expect(downloadModel).toHaveBeenCalledTimes(1);
    expect(useModelInstallStore.getState().jobs['qwen3-vl-2b-instruct']?.status).toBe('ready');
  });
});
