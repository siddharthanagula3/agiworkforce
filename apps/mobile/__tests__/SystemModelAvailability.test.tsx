import React from 'react';
import { NativeModules } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';
import { detectCapabilities, getCapabilities } from '@agiworkforce/local-llm';
import type { InstalledModel } from '@/storage/types';
import { listInstalledModels } from '@/storage/installedModels';
import { ModelRow } from '@/src/features/model-picker/components/ModelRow';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { resolveLocalModelRef } from '@/src/features/model-picker/localModelRuntime';
import {
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { localModelRecovery } from '@/src/features/chat/utils/localModelRecovery';
import { resetPostAuthDestinationToLocal } from '@/src/features/auth/actions/postAuthIntent';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useSystemModelSession } from '@/src/features/model-picker/systemModelAvailability';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

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
  };
});

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: { setWorkMode: () => void }) => unknown) =>
    selector({ setWorkMode: () => undefined }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

const nativeSystemModel = { getCapabilities: jest.fn() };

const SYSTEM_MODEL = LOCAL_MODEL_LIST.find((model) => (model.fileSizeBytes ?? 0) <= 0)!;
const LITE_MODEL = LOCAL_MODEL_LIST.find(
  (model) => model.tier === 'economy' && (model.fileSizeBytes ?? 0) > 0,
)!;
const CLOUD_MODEL_ID = requireMobileCloudModel().id;

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

function onDevice(...models: ModelDef[]): void {
  jest.mocked(listInstalledModels).mockResolvedValue(models.map(installedRecord));
}

async function hydrate(): Promise<void> {
  await act(async () => {
    await useModelInstallStore.getState().hydrateInstalledModels();
  });
}

function renderSystemRow() {
  const installStatus = useModelInstallStore.getState().statusForModel(SYSTEM_MODEL);
  return render(
    <ModelRow
      model={SYSTEM_MODEL}
      isSelected={false}
      isFavorite={false}
      isExpanded={false}
      thinkingEnabled={false}
      installStatus={installStatus}
      onSelect={jest.fn()}
      onLockedPress={jest.fn()}
      onToggleFavorite={jest.fn()}
      onToggleThinking={jest.fn()}
    />,
  );
}

beforeAll(() => {
  Object.assign(NativeModules, { AGIFoundationModels: nativeSystemModel });
});

beforeEach(() => {
  jest.clearAllMocks();
  onDevice();
  useWaitlistStore.getState().setCloudAccess(false);
  useChatAppModeStore.getState().setAppMode('local');
  useSystemModelSession.setState({ failedModelIds: [], unreadySinceFailureIds: [] });
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

describe('the built-in system model is the default only when it can answer now', () => {
  it('is offered as ready and chosen for a new Local chat when the check reports available', async () => {
    nativeReports('available');

    await hydrate();

    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([SYSTEM_MODEL.id]);
    expect(useModelInstallStore.getState().statusForModel(SYSTEM_MODEL).status).toBe('ready');
    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
    const row = renderSystemRow();
    expect(row.getByText('Ready')).toBeTruthy();
    expect(row.getByTestId(`model-row-${SYSTEM_MODEL.id}`).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it.each([
    ['apple_intelligence_not_enabled', `Turn on ${SYSTEM_MODEL.name} in Settings to use it.`],
    ['device_not_eligible', 'Not available on this device.'],
    ['model_not_ready', 'Still getting ready on this device. Try again later.'],
    ['os_too_old', 'Not available on this device.'],
  ])(
    'when the check reports %s the row says why and the model is not the default',
    async (status, reason) => {
      nativeReports(status);

      await hydrate();

      const install = useModelInstallStore.getState();
      expect(install.readySystemModelIds).toEqual([]);
      expect(install.statusForModel(SYSTEM_MODEL)).toEqual({
        status: 'unavailable',
        progress: 0,
        error: reason,
      });
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);

      const row = renderSystemRow();
      expect(row.getByText(reason)).toBeTruthy();
      const pressable = row.getByTestId(`model-row-${SYSTEM_MODEL.id}`);
      expect(pressable.props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true }),
      );
      expect(pressable.props.accessibilityHint).toBe(reason);
      expect(row.queryByText('Ready')).toBeNull();

      await expect(resolveLocalModelRef(useModelStore.getState().selectedModel)).rejects.toThrow(
        /not downloaded/,
      );
      expect(
        localModelRecovery({
          executionMode: 'local',
          isNoLocalModelError: true,
          selectedModelId: useModelStore.getState().selectedModel,
          installedModelIds: install.installedModelIds,
          readySystemModelIds: install.readySystemModelIds,
          displayNameFor: () => null,
        }),
      ).toEqual({ kind: 'open-models', modelId: null, label: 'Open Models' });
    },
  );

  it.each(['apple_intelligence_not_enabled', 'model_not_ready'])(
    'keeps a remembered system model choice while the check reports %s, and returns to it',
    async (status) => {
      useModelStore.getState().setModel(SYSTEM_MODEL.id);
      nativeReports(status);

      await hydrate();

      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
      expect(useModelStore.getState().newChatModels.local).toBe(SYSTEM_MODEL.id);

      act(() => useModelStore.getState().restoreNewChatModel());
      expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
      expect(useModelStore.getState().newChatModels.local).toBe(SYSTEM_MODEL.id);

      nativeReports('available');
      await hydrate();
      expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
    },
  );

  it('uses a downloaded model for new chats while the remembered system model is turned off', async () => {
    useModelStore.getState().setModel(SYSTEM_MODEL.id);
    nativeReports('apple_intelligence_not_enabled');
    onDevice(LITE_MODEL);

    await hydrate();
    act(() => useModelStore.getState().restoreNewChatModel());

    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
    expect(useModelStore.getState().newChatModels.local).toBe(SYSTEM_MODEL.id);
  });

  it('prefers a downloaded model over a system model this device cannot run', async () => {
    useModelStore.getState().setModel(SYSTEM_MODEL.id);
    nativeReports('device_not_eligible');
    onDevice(LITE_MODEL);

    await hydrate();

    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
    expect(useModelStore.getState().newChatModels.local).toBe(LITE_MODEL.id);
  });

  it('notices when the system model is turned off after it was found ready', async () => {
    nativeReports('available');
    await hydrate();
    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([SYSTEM_MODEL.id]);
    const answerFromLaunch = await detectCapabilities();

    nativeReports('apple_intelligence_not_enabled');
    jest.mocked(getCapabilities).mockResolvedValueOnce(answerFromLaunch);
    await hydrate();

    expect(useModelInstallStore.getState().readySystemModelIds).toEqual([]);
    expect(useModelInstallStore.getState().statusForModel(SYSTEM_MODEL).error).toBe(
      `Turn on ${SYSTEM_MODEL.name} in Settings to use it.`,
    );
  });
});

describe('the Local model a person chose is a device setting', () => {
  beforeEach(() => {
    nativeReports('available');
    onDevice(LITE_MODEL);
  });

  async function chooseLite(): Promise<void> {
    await hydrate();
    act(() => useModelStore.getState().setModel(LITE_MODEL.id));
  }

  function goToCloud(): void {
    useWaitlistStore.getState().setCloudAccess(true);
    useTierStore.getState().setTier('max');
    useChatAppModeStore.getState().setAppMode('cloud');
    useModelStore.getState().setModel(CLOUD_MODEL_ID);
    expect(useModelStore.getState().selectedModel).toBe(CLOUD_MODEL_ID);
  }

  it('stays chosen when sign-out returns the app to Local', async () => {
    await chooseLite();
    goToCloud();

    useWaitlistStore.getState().setCloudAccess(false);
    resetPostAuthDestinationToLocal();
    await hydrate();

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
  });

  it('stays chosen when switching back to Local after signing in', async () => {
    await chooseLite();
    goToCloud();
    const { result } = renderHook(() => useAppModeSwitch());

    act(() => {
      result.current.switchToLocal();
    });
    await hydrate();

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
  });

  it('stays chosen after a restart', async () => {
    await chooseLite();
    const persisted = JSON.parse(JSON.stringify(useModelStore.getState()));
    useModelStore.setState({
      selectedModel: DEFAULT_LOCAL_MODEL_ID,
      newChatModels: { local: null, cloud: null },
    });

    const merge = useModelStore.persist.getOptions().merge!;
    act(() => useModelStore.setState(merge(persisted, useModelStore.getState())));
    await hydrate();

    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
  });

  it('falls back to a ready model when the chosen one was deleted while in Cloud', async () => {
    await chooseLite();
    goToCloud();
    onDevice();
    await hydrate();
    const { result } = renderHook(() => useAppModeSwitch());

    act(() => {
      result.current.switchToLocal();
    });

    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
    expect(useModelStore.getState().newChatModels.local).toBe(SYSTEM_MODEL.id);
  });

  it('stays chosen when switching back to Local while the system model is turned off', async () => {
    act(() => useModelStore.getState().setModel(SYSTEM_MODEL.id));
    goToCloud();
    nativeReports('apple_intelligence_not_enabled');
    await hydrate();
    const { result } = renderHook(() => useAppModeSwitch());

    act(() => {
      result.current.switchToLocal();
    });

    expect(useModelStore.getState().selectedModel).toBe(LITE_MODEL.id);
    expect(useModelStore.getState().newChatModels.local).toBe(SYSTEM_MODEL.id);
  });

  it('falls back to a ready model when the chosen one is deleted in Local', async () => {
    await chooseLite();

    act(() => useModelInstallStore.getState().forgetInstalledModel(LITE_MODEL.id));

    expect(useModelStore.getState().selectedModel).toBe(SYSTEM_MODEL.id);
  });
});
