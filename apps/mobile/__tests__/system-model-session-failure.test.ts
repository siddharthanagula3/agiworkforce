/* eslint-disable @typescript-eslint/no-require-imports */
import { NativeModules } from 'react-native';
import { act } from '@testing-library/react-native';
import type { DeviceCapabilities } from '@agiworkforce/local-llm';
import type { InstalledModel } from '@/storage/types';
import { listInstalledModels } from '@/storage/installedModels';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import {
  recordLocalModelTurnFailure,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import {
  AUTO_MODES,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  platformSystemModelId,
  systemModelState,
  useSystemModelSession,
} from '@/src/features/model-picker/systemModelAvailability';

jest.mock('@/services/modelDownload', () => ({
  assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
  cancelDownload: jest.fn(),
  downloadModel: jest.fn(),
  excludeModelFilesFromBackup: jest.fn().mockResolvedValue(undefined),
  ModelDownloadError: class ModelDownloadError extends Error {},
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn().mockResolvedValue(null),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/executorchModels', () => ({
  cancelExecutorchPresetDownload: jest.fn().mockResolvedValue(undefined),
  deleteExecutorchPresetFiles: jest.fn().mockResolvedValue(undefined),
  liveInstalledModels: jest.fn(async (installed: unknown[]) => installed),
  releaseExecutorchPreset: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    getCapabilities: jest.fn(() => actual.detectCapabilities()),
    refreshCapabilities: jest.fn(() => actual.refreshCapabilities()),
  };
});

const nativeSystemModel = { getCapabilities: jest.fn() };

function nativeReports(status: string): void {
  nativeSystemModel.getCapabilities.mockResolvedValue({
    tier: 1,
    available: status === 'available',
    status,
    thermalThrottled: false,
    totalRAMMB: 8192,
    osVersion: 'test',
    runtimeName: 'foundation_models',
  });
}

const SYSTEM_MODEL = LOCAL_MODEL_LIST.find((model) => (model.fileSizeBytes ?? 0) <= 0)!;
const LITE_MODEL = LOCAL_MODEL_LIST.find(
  (model) => model.tier === 'economy' && (model.fileSizeBytes ?? 0) > 0,
)!;
const AUTO_BALANCED = AUTO_MODES.find((mode) => mode.tier === 'balanced')!;

function installedRecord(model: ModelDef): InstalledModel {
  return {
    id: model.id,
    display_name: model.name,
    runtime: 'local',
    format: 'pte',
    size_bytes: model.fileSizeBytes ?? 0,
    sha256: null,
    local_path: null,
    installed_at: 1,
    last_used_at: null,
    capabilities: '{}',
  };
}

async function hydrate(): Promise<void> {
  await act(async () => {
    await useModelInstallStore.getState().hydrateInstalledModels();
  });
}

async function replyFails(modelId: string, error: Error): Promise<void> {
  await act(async () => {
    await recordLocalModelTurnFailure(modelId, error);
  });
}

function capabilities(overrides: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    totalRAMMB: 8192,
    osVersion: 'test',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable',
    tier2Available: true,
    tier3Available: true,
    ...overrides,
  };
}

beforeAll(() => {
  Object.assign(NativeModules, { AGIFoundationModels: nativeSystemModel });
});

beforeEach(() => {
  nativeReports('available');
  jest.mocked(listInstalledModels).mockResolvedValue([]);
  useSystemModelSession.setState({ failedModelIds: [], unreadySinceFailureIds: [] });
  useChatAppModeStore.getState().setAppMode('local');
  useModelInstallStore.setState({
    installedModelIds: [],
    readySystemModelIds: [],
    systemModelStates: {},
    totalRAMMB: null,
    jobs: {},
  });
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    newChatModels: { local: null, cloud: null },
    conversationModelShown: false,
    recentModels: [],
  });
});

describe('the Android system model states', () => {
  const aicoreModelId = platformSystemModelId('android')!;

  it('is ready only when AICore reports it available', () => {
    expect(
      systemModelState(
        aicoreModelId,
        capabilities({ tier1Available: true, tier1Runtime: 'aicore', tier1Status: 'available' }),
        null,
      ),
    ).toBe('ready');
  });

  it.each([
    ['downloadable', 'preparing'],
    ['downloading', 'preparing'],
    ['unavailable', 'not_eligible'],
  ] as const)('reads AICore %s as %s', (tier1Status, state) => {
    expect(systemModelState(aicoreModelId, capabilities({ tier1Status }), null)).toBe(state);
  });

  it('never reads the iOS system model as ready from an AICore answer', () => {
    expect(
      systemModelState(
        platformSystemModelId('ios')!,
        capabilities({ tier1Available: true, tier1Runtime: 'aicore', tier1Status: 'available' }),
        null,
      ),
    ).toBe('not_eligible');
  });
});

describe('a system model whose first reply failed', () => {
  it('stops Auto from choosing it again in this session', async () => {
    await hydrate();
    await expect(resolveLocalModelRef(AUTO_BALANCED.id)).resolves.toEqual(
      expect.objectContaining({ modelId: SYSTEM_MODEL.id }),
    );

    await replyFails(SYSTEM_MODEL.id, new Error('APPLE_INTELLIGENCE_FAILED'));

    await expect(resolveLocalModelRef(AUTO_BALANCED.id)).rejects.toThrow(/not downloaded/);
    jest.mocked(listInstalledModels).mockResolvedValue([installedRecord(LITE_MODEL)]);
    await hydrate();
    await expect(resolveLocalModelRef(AUTO_BALANCED.id)).resolves.toEqual(
      expect.objectContaining({ modelId: LITE_MODEL.id }),
    );
  });

  it('is shown as unusable with its reason and stops being the new chat default', async () => {
    await hydrate();
    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);

    await replyFails(SYSTEM_MODEL.id, new Error('APPLE_INTELLIGENCE_FAILED'));

    const install = useModelInstallStore.getState();
    expect(install.readySystemModelIds).toEqual([]);
    expect(install.statusForModel(SYSTEM_MODEL)).toEqual({
      status: 'unavailable',
      progress: 0,
      error: 'Could not answer on this device. Choose another model.',
    });
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);

    await hydrate();
    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([]);
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('moves the next new chat to a downloaded model without changing the open conversation', async () => {
    jest.mocked(listInstalledModels).mockResolvedValue([installedRecord(LITE_MODEL)]);
    await hydrate();
    act(() => useModelStore.getState().setModel(SYSTEM_MODEL.id));
    act(() => useModelStore.setState({ conversationModelShown: true }));

    await replyFails(SYSTEM_MODEL.id, new Error('APPLE_INTELLIGENCE_FAILED'));

    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
    expect(useModelStore.getState().newChatModels.local).toBe(LITE_MODEL.id);
  });

  it.each([
    'APPLE_INTELLIGENCE_REFUSED',
    'APPLE_INTELLIGENCE_CONTEXT_EXCEEDED',
    'APPLE_INTELLIGENCE_RATE_LIMITED',
    'APPLE_INTELLIGENCE_UNSUPPORTED_LANGUAGE',
    'Device is thermally throttled, inference paused.',
    'Cannot read properties of undefined',
  ])('keeps it after %s while the device still reports it available', async (code) => {
    await hydrate();

    await replyFails(SYSTEM_MODEL.id, new Error(code));

    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([SYSTEM_MODEL.id]);
    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
  });

  it('ignores a failed downloaded model', async () => {
    jest.mocked(listInstalledModels).mockResolvedValue([installedRecord(LITE_MODEL)]);
    await hydrate();

    await replyFails(LITE_MODEL.id, new Error('Local inference failed'));

    expect(useSystemModelSession.getState().failedModelIds).toEqual([]);
    expect(useModelInstallStore.getState().installedModelIds).toEqual([LITE_MODEL.id]);
  });

  it('takes it out after an unexplained error once the device stops reporting it', async () => {
    await hydrate();
    nativeReports('apple_intelligence_not_enabled');

    await replyFails(SYSTEM_MODEL.id, new Error('GENERATE_ERROR'));

    expect(useSystemModelSession.getState().failedModelIds).toEqual([SYSTEM_MODEL.id]);
    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([]);
  });

  it('keeps it after a stopped reply, which is not a failure of the model', async () => {
    await hydrate();
    const stopped = new Error('APPLE_INTELLIGENCE_FAILED');
    stopped.name = 'AbortError';

    await replyFails(SYSTEM_MODEL.id, stopped);

    expect(useSystemModelSession.getState().failedModelIds).toEqual([]);
  });

  it('gives the precise reason when the device then reports it turned off, and returns once it is on', async () => {
    await hydrate();
    await replyFails(SYSTEM_MODEL.id, new Error('APPLE_INTELLIGENCE_ASSETS_UNAVAILABLE'));

    nativeReports('apple_intelligence_not_enabled');
    await hydrate();
    expect(useModelInstallStore.getState().statusForModel(SYSTEM_MODEL).error).toBe(
      `Turn on ${SYSTEM_MODEL.name} in Settings to use it.`,
    );

    nativeReports('available');
    await hydrate();
    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([SYSTEM_MODEL.id]);
    expect(useModelInstallStore.getState().statusForModel(SYSTEM_MODEL).status).toBe('ready');
    await expect(resolveLocalModelRef(AUTO_BALANCED.id)).resolves.toEqual(
      expect.objectContaining({ modelId: SYSTEM_MODEL.id }),
    );
  });
});

type RuntimeModule = typeof import('@/src/features/model-picker/localModelRuntime');
type AvailabilityModule = typeof import('@/src/features/model-picker/systemModelAvailability');
type LocalLlmModule = typeof import('@agiworkforce/local-llm');
type ReactNativeModule = typeof import('react-native');

describe('an Android system model reply that fails', () => {
  const aicoreModelId = platformSystemModelId('android')!;

  function loadOnAndroid(): {
    runtime: RuntimeModule;
    availability: AvailabilityModule;
    localLlm: LocalLlmModule;
  } {
    let loaded!: {
      runtime: RuntimeModule;
      availability: AvailabilityModule;
      localLlm: LocalLlmModule;
    };
    jest.isolateModules(() => {
      const { Platform } = require('react-native') as ReactNativeModule;
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      try {
        loaded = {
          runtime: require('@/src/features/model-picker/localModelRuntime') as RuntimeModule,
          availability:
            require('@/src/features/model-picker/systemModelAvailability') as AvailabilityModule,
          localLlm: require('@agiworkforce/local-llm') as LocalLlmModule,
        };
      } finally {
        Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
      }
    });
    return loaded;
  }

  it('keeps the model when AICore still reports it available', async () => {
    const { runtime, availability, localLlm } = loadOnAndroid();
    jest
      .mocked(localLlm.refreshCapabilities)
      .mockClear()
      .mockResolvedValueOnce(
        capabilities({ tier1Available: true, tier1Runtime: 'aicore', tier1Status: 'available' }),
      );

    await runtime.recordLocalModelTurnFailure(aicoreModelId, new Error('The model is busy'));

    expect(localLlm.refreshCapabilities).toHaveBeenCalledTimes(1);
    expect(availability.useSystemModelSession.getState().failedModelIds).toEqual([]);
  });

  it('takes the model out when AICore reports it is no longer available', async () => {
    const { runtime, availability, localLlm } = loadOnAndroid();
    jest
      .mocked(localLlm.refreshCapabilities)
      .mockResolvedValueOnce(capabilities({ tier1Status: 'downloading' }));

    await runtime.recordLocalModelTurnFailure(aicoreModelId, new Error('The model is busy'));

    expect(availability.useSystemModelSession.getState().failedModelIds).toEqual([aicoreModelId]);
  });
});
