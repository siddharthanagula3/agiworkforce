import { Alert } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';

type LocalLlmModule = typeof import('@agiworkforce/local-llm');
type LocalModelRuntimeModule = typeof import('../src/features/model-picker/localModelRuntime');

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    uploadFile: jest.fn(),
  },
  ApiPaywallError: class MockApiPaywallError extends Error {},
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
  cancelMobileCloudAgentRun: jest.fn(),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => 'mobile-local-only'),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual<LocalLlmModule>('@agiworkforce/local-llm'),
  localGenerate: jest.fn(),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: 'test',
    thermalThrottled: false,
    tier1Available: true,
    tier1Runtime: 'foundation_models',
    tier1Status: 'available',
    tier2Available: true,
    tier3Available: true,
  }),
}));

jest.mock('../src/features/model-picker/localModelRuntime', () => {
  const actual = jest.requireActual<LocalModelRuntimeModule>(
    '../src/features/model-picker/localModelRuntime',
  );
  return {
    ...actual,
    recordLocalModelTurnFailure: jest.fn(actual.recordLocalModelTurnFailure),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/executorchModels', () => ({
  cancelExecutorchPresetDownload: jest.fn().mockResolvedValue(undefined),
  deleteExecutorchPresetFiles: jest.fn().mockResolvedValue(undefined),
  liveInstalledModels: jest.fn(async (installed: unknown[]) => installed),
  releaseExecutorchPreset: jest.fn(),
}));

jest.mock('../src/features/memory/store', () => ({
  retrieveMemoryContext: jest.fn(async () => []),
}));

jest.mock('../src/features/memory/services/pastChatContext', () => ({
  retrievePastChatContext: jest.fn(async () => null),
}));

jest.mock('../src/features/memory/services/consolidation', () => ({
  consolidateFactsFromTurn: jest.fn(),
  shouldConsolidateMemoryOnClient: jest.fn(() => false),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { localGenerate } from '@agiworkforce/local-llm';
import { LOCAL_NO_MODEL_MESSAGE, useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { listInstalledModels } from '../storage/installedModels';
import {
  recordLocalModelTurnFailure,
  resolveLocalModelRef,
} from '../src/features/model-picker/localModelRuntime';
import {
  AUTO_MODES,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  type ModelDef,
} from '../src/features/model-picker/service';
import {
  platformSystemModelId,
  useSystemModelSession,
} from '../src/features/model-picker/systemModelAvailability';
import type { InstalledModel } from '../storage/types';

const mockLocalGenerate = localGenerate as jest.MockedFunction<typeof localGenerate>;
const mockListInstalledModels = listInstalledModels as jest.MockedFunction<
  typeof listInstalledModels
>;
const mockRecordFailure = recordLocalModelTurnFailure as jest.MockedFunction<
  typeof recordLocalModelTurnFailure
>;

const CONV_ID = 'local-model-turn-failure-chat';
const STAMP = '2026-11-16T10:00:00.000Z';
const SYSTEM_MODEL_ID = platformSystemModelId('ios')!;
const DOWNLOADED_MODEL = LOCAL_MODEL_LIST.find(
  (model) => (model.fileSizeBytes ?? 0) > 0 && model.id !== DEFAULT_LOCAL_MODEL_ID,
)!;
const AUTO_ID = AUTO_MODES.find((mode) => mode.tier === 'balanced')!.id;
const SYSTEM_FAILURE = new Error('APPLE_INTELLIGENCE_FAILED');

function installed(model: ModelDef): InstalledModel {
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
    capabilities: null,
  };
}

function seed(model: string): void {
  useChatStore.setState({
    conversations: [
      {
        id: CONV_ID,
        title: 'Local chat',
        updatedAt: STAMP,
        createdAt: STAMP,
        messageCount: 0,
        pinned: false,
        model,
        provider: 'local',
        executionMode: 'local',
      },
    ],
    messages: { [CONV_ID]: [] },
    currentConversationId: CONV_ID,
  });
}

async function send(content: string, model: string): Promise<boolean> {
  let accepted = false;
  await act(async () => {
    accepted = await useChatStore.getState().sendMessage(CONV_ID, content, model);
  });
  return accepted;
}

function lastGeneratedModelId(): string | undefined {
  return mockLocalGenerate.mock.calls.at(-1)?.[1].modelId;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useSettingsStore.setState({ reduceSensitiveContent: false, isTemporaryChat: false });
  useSystemModelSession.setState({ failedModelIds: [], unreadySinceFailureIds: [] });
  useChatExecutionStore.setState({ error: null });
  mockListInstalledModels.mockResolvedValue([installed(DOWNLOADED_MODEL)]);
  mockLocalGenerate.mockImplementation(async () => ({
    text: 'an answer',
    runtime: 'foundation_models',
    aborted: false,
  }));
  seed(SYSTEM_MODEL_ID);
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('a Local reply the built-in model could not give', () => {
  it('takes the built-in model out of Auto for the session, so Auto picks a ready model', async () => {
    expect((await resolveLocalModelRef(AUTO_ID)).modelId).toBe(SYSTEM_MODEL_ID);
    mockLocalGenerate.mockRejectedValueOnce(SYSTEM_FAILURE);

    expect(await send('Hello there', SYSTEM_MODEL_ID)).toBe(true);
    await waitFor(() =>
      expect(useSystemModelSession.getState().failedModelIds).toEqual([SYSTEM_MODEL_ID]),
    );
    expect(mockRecordFailure).toHaveBeenCalledTimes(1);
    expect(mockRecordFailure).toHaveBeenCalledWith(SYSTEM_MODEL_ID, SYSTEM_FAILURE);

    expect(await send('Hello again', AUTO_ID)).toBe(true);
    expect(lastGeneratedModelId()).toBe(DOWNLOADED_MODEL.id);
  });

  it('leads to the model list when nothing else is ready', async () => {
    mockListInstalledModels.mockResolvedValue([]);
    mockLocalGenerate.mockRejectedValueOnce(SYSTEM_FAILURE);

    await send('Hello there', SYSTEM_MODEL_ID);
    await waitFor(() =>
      expect(useSystemModelSession.getState().failedModelIds).toEqual([SYSTEM_MODEL_ID]),
    );
    mockLocalGenerate.mockClear();

    await send('Hello again', AUTO_ID);

    expect(mockLocalGenerate).not.toHaveBeenCalled();
    expect(useChatExecutionStore.getState().error).toBe(LOCAL_NO_MODEL_MESSAGE);
  });

  it('records nothing for a reply the person stopped', async () => {
    mockLocalGenerate.mockImplementationOnce(
      (_modelPath, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(SYSTEM_FAILURE), { once: true });
        }),
    );

    const sent = useChatStore.getState().sendMessage(CONV_ID, 'Hello there', SYSTEM_MODEL_ID);
    await waitFor(() => expect(mockLocalGenerate).toHaveBeenCalledTimes(1));
    act(() => useChatStore.getState().stopStreaming());
    await act(async () => {
      await sent;
    });

    expect(mockRecordFailure).not.toHaveBeenCalled();
    expect(useSystemModelSession.getState().failedModelIds).toEqual([]);
  });

  it('keeps a downloaded model that failed to answer', async () => {
    seed(DOWNLOADED_MODEL.id);
    mockLocalGenerate.mockRejectedValueOnce(SYSTEM_FAILURE);

    await send('Hello there', DOWNLOADED_MODEL.id);
    await waitFor(() => expect(mockRecordFailure).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mockRecordFailure.mock.results[0]?.value;
    });

    expect(useSystemModelSession.getState().failedModelIds).toEqual([]);
    expect(await send('Hello again', DOWNLOADED_MODEL.id)).toBe(true);
    expect(lastGeneratedModelId()).toBe(DOWNLOADED_MODEL.id);
  });
});
