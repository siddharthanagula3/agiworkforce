jest.mock('../services/cloudSyncEngine', () => ({
  stopCloudSyncLoop: jest.fn(),
}));

jest.mock('../stores/chat/cloudSyncStateStore', () => ({
  useCloudSyncStateStore: { getState: jest.fn() },
}));

jest.mock('../stores/chat/chatCloudMessageStore', () => ({
  useChatCloudMessageStore: { getState: jest.fn() },
}));

jest.mock('../stores/chat/chatExecutionStore', () => ({
  clearCloudExecutionState: jest.fn(),
}));

jest.mock('../src/features/chat/actions/runImageGenerationTurn', () => ({
  clearCloudImageGenerationState: jest.fn(),
}));

jest.mock('../src/features/chat/actions/runVideoGenerationTurn', () => ({
  clearCloudVideoGenerationState: jest.fn(),
}));

jest.mock('../stores/connectionStore', () => ({
  useConnectionStore: { getState: jest.fn() },
}));

jest.mock('../src/features/artifacts/store', () => ({
  clearAccountScopedArtifactState: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  clearAccountScopedOfflineQueue: jest.fn(),
}));

jest.mock('../src/features/chat/draftStore', () => ({
  clearAccountScopedDrafts: jest.fn(),
}));

jest.mock('../stores/memory/cloudMemoryStore', () => ({
  useCloudMemoryStore: { getState: jest.fn() },
}));

jest.mock('../stores/memory/memorySyncStateStore', () => ({
  useMemorySyncStateStore: { getState: jest.fn() },
}));

jest.mock('../stores/projects/cloudProjectStore', () => ({
  useCloudProjectStore: { getState: jest.fn() },
}));

jest.mock('../stores/projects/projectSyncStateStore', () => ({
  useProjectSyncStateStore: { getState: jest.fn() },
}));

jest.mock('../stores/settings/settingsSyncStateStore', () => ({
  useSettingsSyncStateStore: { getState: jest.fn() },
}));

jest.mock('../stores/agentControlStore', () => ({
  useAgentControlStore: { getState: jest.fn() },
}));

jest.mock('../src/features/billing/store', () => ({
  useTierStore: { getState: jest.fn() },
}));

jest.mock('../src/lib/Capabilities', () => ({
  useRemoteCapabilityStore: { getState: jest.fn() },
}));

jest.mock('../src/features/model-picker/freeQuotaCatalogue', () => ({
  useFreeQuotaCatalogueStore: { getState: jest.fn() },
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: { getState: jest.fn() },
}));

jest.mock('../src/features/model-picker/service', () => ({
  DEFAULT_LOCAL_MODEL_ID: 'fixture-local-model',
  isCloudManagedModelId: (id: string) => id === 'fixture-cloud-model',
}));

jest.mock('../src/features/schedules/store', () => ({
  useScheduleStore: { getState: jest.fn() },
}));

jest.mock('../services/api', () => ({
  resetApiAccountState: jest.fn(),
}));

jest.mock('../services/connectors', () => ({
  invalidateConnectorPolicy: jest.fn(),
}));

jest.mock('../src/features/chat/upload/uploadLifecycle', () => ({
  useUploadLifecycleStore: { getState: jest.fn() },
}));

jest.mock('../services/notifications', () => ({
  notificationCenterStore: { clear: jest.fn() },
  clearDeliveredNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/features/notifications/accountFeed', () => ({
  useAccountNotificationFeed: { getState: jest.fn() },
}));

jest.mock('../services/backgroundFetch', () => ({
  resetBackgroundFetchAccountState: jest.fn(),
}));

jest.mock('../stores/chat/chatViewStore', () => ({
  useChatViewStore: { getState: jest.fn() },
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: { setState: jest.fn() },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn(),
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
    getAllKeys: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: { getState: jest.fn() },
}));

jest.mock('../stores/settings/localSettingsStore', () => ({
  useLocalSettingsStore: { setState: jest.fn() },
}));

jest.mock('../stores/chat/chatMessageStore', () => ({
  useChatMessageStore: { getState: jest.fn(), setState: jest.fn() },
  clearCloudConversationPagination: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { stopCloudSyncLoop } = require('../services/cloudSyncEngine') as {
  stopCloudSyncLoop: jest.Mock;
};
const { useCloudSyncStateStore } = require('../stores/chat/cloudSyncStateStore') as {
  useCloudSyncStateStore: { getState: jest.Mock };
};
const { useChatCloudMessageStore } = require('../stores/chat/chatCloudMessageStore') as {
  useChatCloudMessageStore: { getState: jest.Mock };
};
const { clearCloudExecutionState } = require('../stores/chat/chatExecutionStore') as {
  clearCloudExecutionState: jest.Mock;
};
const { clearCloudImageGenerationState } =
  require('../src/features/chat/actions/runImageGenerationTurn') as {
    clearCloudImageGenerationState: jest.Mock;
  };
const { clearCloudVideoGenerationState } =
  require('../src/features/chat/actions/runVideoGenerationTurn') as {
    clearCloudVideoGenerationState: jest.Mock;
  };
const { useConnectionStore } = require('../stores/connectionStore') as {
  useConnectionStore: { getState: jest.Mock };
};
const { clearAccountScopedArtifactState } = require('../src/features/artifacts/store') as {
  clearAccountScopedArtifactState: jest.Mock;
};
const { clearAccountScopedOfflineQueue } = require('../services/offlineQueue') as {
  clearAccountScopedOfflineQueue: jest.Mock;
};
const { clearAccountScopedDrafts } = require('../src/features/chat/draftStore') as {
  clearAccountScopedDrafts: jest.Mock;
};
const { useCloudMemoryStore } = require('../stores/memory/cloudMemoryStore') as {
  useCloudMemoryStore: { getState: jest.Mock };
};
const { useMemorySyncStateStore } = require('../stores/memory/memorySyncStateStore') as {
  useMemorySyncStateStore: { getState: jest.Mock };
};
const { useCloudProjectStore } = require('../stores/projects/cloudProjectStore') as {
  useCloudProjectStore: { getState: jest.Mock };
};
const { useProjectSyncStateStore } = require('../stores/projects/projectSyncStateStore') as {
  useProjectSyncStateStore: { getState: jest.Mock };
};
const { useSettingsSyncStateStore } = require('../stores/settings/settingsSyncStateStore') as {
  useSettingsSyncStateStore: { getState: jest.Mock };
};
const { useAgentControlStore } = require('../stores/agentControlStore') as {
  useAgentControlStore: { getState: jest.Mock };
};
const { useTierStore } = require('../src/features/billing/store') as {
  useTierStore: { getState: jest.Mock };
};
const { useRemoteCapabilityStore } = require('../src/lib/Capabilities') as {
  useRemoteCapabilityStore: { getState: jest.Mock };
};
const { useFreeQuotaCatalogueStore } =
  require('../src/features/model-picker/freeQuotaCatalogue') as {
    useFreeQuotaCatalogueStore: { getState: jest.Mock };
  };
const { useModelStore } = require('../src/features/model-picker/store') as {
  useModelStore: { getState: jest.Mock };
};
const { useScheduleStore } = require('../src/features/schedules/store') as {
  useScheduleStore: { getState: jest.Mock };
};
const { resetApiAccountState } = require('../services/api') as {
  resetApiAccountState: jest.Mock;
};
const { invalidateConnectorPolicy } = require('../services/connectors') as {
  invalidateConnectorPolicy: jest.Mock;
};
const { useUploadLifecycleStore } = require('../src/features/chat/upload/uploadLifecycle') as {
  useUploadLifecycleStore: { getState: jest.Mock };
};
const { notificationCenterStore, clearDeliveredNotifications } =
  require('../services/notifications') as {
    notificationCenterStore: { clear: jest.Mock };
    clearDeliveredNotifications: jest.Mock;
  };
const { useAccountNotificationFeed } = require('../src/features/notifications/accountFeed') as {
  useAccountNotificationFeed: { getState: jest.Mock };
};
const { resetBackgroundFetchAccountState } = require('../services/backgroundFetch') as {
  resetBackgroundFetchAccountState: jest.Mock;
};
const { useChatViewStore } = require('../stores/chat/chatViewStore') as {
  useChatViewStore: { getState: jest.Mock };
};
const { useChatAppModeStore } = require('../src/features/chat/store/appModeStore') as {
  useChatAppModeStore: { setState: jest.Mock };
};
const { whenMmkvReady } = require('../lib/mmkv') as {
  whenMmkvReady: jest.Mock;
};
const { useWaitlistStore } = require('../src/features/waitlist/store') as {
  useWaitlistStore: { getState: jest.Mock };
};
const { useLocalSettingsStore } = require('../stores/settings/localSettingsStore') as {
  useLocalSettingsStore: { setState: jest.Mock };
};
const { useChatMessageStore } = require('../stores/chat/chatMessageStore') as {
  useChatMessageStore: { getState: jest.Mock; setState: jest.Mock };
};
/* eslint-enable @typescript-eslint/no-require-imports */

import { mmkvStorage, storage } from '../lib/mmkv';
import { getProviderOfferings } from '@agiworkforce/types';
import { useLibraryCacheStore } from '../src/features/library/libraryCacheStore';
import { SET_ASIDE_MARKER } from '../storage/unreadableFiles';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { applyCloudSettings, toCloudSettings } from '../services/cloudSettingsMapping';
import { clearLocalCloudAccountState } from '../src/features/auth/services/cloudAccountTeardown';
import {
  stageComposerAttachments,
  stageComposerText,
  takeComposerAttachments,
  takeComposerText,
} from '@/src/features/chat/composerHandoff';

describe('clearLocalCloudAccountState', () => {
  const resetCloudSync = jest.fn();
  const clearCloudChats = jest.fn();
  const clearCloudMemory = jest.fn();
  const resetMemorySync = jest.fn();
  const clearCloudProjects = jest.fn();
  const resetProjectSync = jest.fn();
  const resetSettingsSync = jest.fn();
  const clearCloudConversationSelection = jest.fn();
  const clearCloudAgentControls = jest.fn();
  const clearEntitlements = jest.fn();
  const clearCapabilitySwitches = jest.fn();
  const clearPromotionalCatalogue = jest.fn();
  const clearSchedules = jest.fn();
  const clearCloudSearch = jest.fn();
  const clearCloudConversationView = jest.fn();
  const clearManagedCloudAccess = jest.fn();
  const resetCloudUploads = jest.fn();
  const resetAccountNotificationFeed = jest.fn();
  const endDesktopPairing = jest.fn();
  let mmkvReadyCallbacks: Array<() => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCloudSettingsStore.setState(useCloudSettingsStore.getInitialState());
    mmkvReadyCallbacks = [];
    whenMmkvReady.mockImplementation((callback: () => void) => {
      mmkvReadyCallbacks.push(callback);
    });
    useCloudSyncStateStore.getState.mockReturnValue({ reset: resetCloudSync });
    useChatCloudMessageStore.getState.mockReturnValue({
      conversations: [{ id: 'cloud-conversation-a' }],
      clearCloudData: clearCloudChats,
    });
    useCloudMemoryStore.getState.mockReturnValue({ clearCloudMemoryData: clearCloudMemory });
    useMemorySyncStateStore.getState.mockReturnValue({ resetMemorySync });
    useCloudProjectStore.getState.mockReturnValue({
      projects: [{ id: 'cloud-project-a' }],
      clearCloudProjectData: clearCloudProjects,
    });
    useProjectSyncStateStore.getState.mockReturnValue({ resetProjectSync });
    useSettingsSyncStateStore.getState.mockReturnValue({ resetSettingsSync });
    useAgentControlStore.getState.mockReturnValue({
      clearCloudOverrides: clearCloudAgentControls,
    });
    useChatMessageStore.getState.mockReturnValue({
      clearCloudConversationSelection,
    });
    useTierStore.getState.mockReturnValue({
      clearAccountEntitlements: clearEntitlements,
    });
    useRemoteCapabilityStore.getState.mockReturnValue({ clear: clearCapabilitySwitches });
    useFreeQuotaCatalogueStore.getState.mockReturnValue({ clear: clearPromotionalCatalogue });
    useModelStore.getState.mockReturnValue({ selectedModel: 'fixture-local-model' });
    useScheduleStore.getState.mockReturnValue({ clearAccountSchedules: clearSchedules });
    useChatViewStore.getState.mockReturnValue({
      clearCloudSearchState: clearCloudSearch,
      clearCloudConversationState: clearCloudConversationView,
    });
    useWaitlistStore.getState.mockReturnValue({ clear: clearManagedCloudAccess });
    useUploadLifecycleStore.getState.mockReturnValue({ reset: resetCloudUploads });
    useAccountNotificationFeed.getState.mockReturnValue({ reset: resetAccountNotificationFeed });
    useConnectionStore.getState.mockReturnValue({ disconnect: endDesktopPairing });
  });

  it('clears account A Cloud data before account B while preserving Local data', () => {
    const warning = jest.spyOn(console, 'warn');
    clearLocalCloudAccountState();

    expect(stopCloudSyncLoop).toHaveBeenCalledTimes(1);
    expect(clearPromotionalCatalogue).toHaveBeenCalledTimes(1);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
    expect(resetCloudSync).toHaveBeenCalledTimes(1);
    expect(clearCloudExecutionState).toHaveBeenCalledTimes(1);
    expect(clearCloudImageGenerationState).toHaveBeenCalledTimes(1);
    expect(clearCloudVideoGenerationState).toHaveBeenCalledTimes(1);
    expect(clearCloudChats).toHaveBeenCalledTimes(1);
    expect(clearCloudConversationSelection).toHaveBeenCalledWith(['cloud-conversation-a']);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(1);
    expect(endDesktopPairing).toHaveBeenCalledTimes(1);
    expect(clearAccountScopedOfflineQueue).toHaveBeenCalledTimes(1);
    expect(clearAccountScopedDrafts).toHaveBeenCalledTimes(1);
    expect(clearCloudMemory).toHaveBeenCalledTimes(1);
    expect(resetMemorySync).toHaveBeenCalledTimes(1);
    expect(clearCloudProjects).toHaveBeenCalledTimes(1);
    expect(clearCloudAgentControls).toHaveBeenCalledWith(
      ['cloud-conversation-a'],
      ['cloud-project-a'],
    );
    expect(resetProjectSync).toHaveBeenCalledTimes(1);
    expect(resetSettingsSync).toHaveBeenCalledTimes(1);
    expect(clearEntitlements).toHaveBeenCalledTimes(1);
    expect(clearCapabilitySwitches).toHaveBeenCalledTimes(1);
    expect(clearSchedules).toHaveBeenCalledTimes(1);
    expect(resetApiAccountState).toHaveBeenCalledTimes(1);
    expect(invalidateConnectorPolicy).toHaveBeenCalledTimes(1);
    expect(resetCloudUploads).toHaveBeenCalledTimes(1);
    expect(notificationCenterStore.clear).toHaveBeenCalledTimes(1);
    expect(clearDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(resetAccountNotificationFeed).toHaveBeenCalledTimes(1);
    expect(resetBackgroundFetchAccountState).toHaveBeenCalledTimes(1);
    expect(clearCloudSearch).toHaveBeenCalledTimes(1);
    expect(clearCloudConversationView).toHaveBeenCalledWith(['cloud-conversation-a']);
    expect(useCloudSettingsStore.getState()).toEqual(useCloudSettingsStore.getInitialState());
    expect(useChatAppModeStore.setState).toHaveBeenCalledWith({ appMode: 'local' });
    expect(clearManagedCloudAccess).toHaveBeenCalledTimes(1);

    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });

  it('removes every account’s recent Cloud searches from the phone and keeps the Local ones', () => {
    (storage.getAllKeys as jest.Mock).mockReturnValueOnce([
      'recent-searches:v1:local',
      'recent-searches:v1:cloud:account-a',
      'recent-searches:v1:cloud:account-b',
      'unrelated-key',
    ]);

    clearLocalCloudAccountState();

    expect(storage.delete).toHaveBeenCalledWith('recent-searches:v1:cloud:account-a');
    expect(storage.delete).toHaveBeenCalledWith('recent-searches:v1:cloud:account-b');
    expect(storage.delete).not.toHaveBeenCalledWith('recent-searches:v1:local');
    expect(storage.delete).not.toHaveBeenCalledWith('unrelated-key');
  });

  it('moves a Cloud model selection to the Local choice and keeps the Cloud choice for that account', () => {
    const setModel = jest.fn();
    const restoreNewChatModel = jest.fn();
    useModelStore.getState.mockReturnValue({
      selectedModel: 'fixture-cloud-model',
      setModel,
      restoreNewChatModel,
    });

    clearLocalCloudAccountState();

    expect(restoreNewChatModel).toHaveBeenCalledTimes(1);
    expect(setModel).not.toHaveBeenCalled();
  });

  const promotionalModelId = Object.keys(getProviderOfferings())[0]!;

  it('keeps the Local model the person chose when a promotional Cloud model was selected', () => {
    const setModel = jest.fn();
    useModelStore.getState.mockReturnValue({
      selectedModel: promotionalModelId,
      newChatModels: { local: 'fixture-chosen-local-model', cloud: promotionalModelId },
      setModel,
      restoreNewChatModel: jest.fn(),
    });

    clearLocalCloudAccountState();

    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith('fixture-chosen-local-model');
  });

  it('falls back to the default Local model when none was chosen before the promotional one', () => {
    const setModel = jest.fn();
    useModelStore.getState.mockReturnValue({
      selectedModel: promotionalModelId,
      newChatModels: { local: null, cloud: promotionalModelId },
      setModel,
      restoreNewChatModel: jest.fn(),
    });

    clearLocalCloudAccountState();

    expect(setModel).toHaveBeenCalledWith('fixture-local-model');
  });

  it('deletes the copies set aside from unreadable Cloud stores and keeps Local ones', () => {
    const keys = [
      `chat-message-store-cloud${SET_ASIDE_MARKER}1700000000000`,
      `memory-store-cloud${SET_ASIDE_MARKER}1700000000001`,
      `projects-store-cloud${SET_ASIDE_MARKER}1700000000002-1`,
      `library-store-cloud${SET_ASIDE_MARKER}1700000000003`,
      `settings-store-cloud${SET_ASIDE_MARKER}1700000000004`,
      `schedule-store${SET_ASIDE_MARKER}1700000000005`,
      `tier-store${SET_ASIDE_MARKER}1700000000007`,
      `chat-message-store-local${SET_ASIDE_MARKER}1700000000006`,
      'chat-message-store-cloud',
      'unrelated-key',
    ];
    (storage.getAllKeys as jest.Mock).mockReturnValueOnce([]).mockReturnValueOnce(keys);

    clearLocalCloudAccountState();

    const deleted = (storage.delete as jest.Mock).mock.calls.map(([key]) => key);
    expect(deleted).toEqual(expect.arrayContaining(keys.slice(0, 7)));
    expect(deleted).not.toContain(keys[7]);
    expect(deleted).not.toContain('chat-message-store-cloud');
    expect(deleted).not.toContain('unrelated-key');
  });

  it('forgets the answers it was waiting for after the app closed and signs out even if that fails', () => {
    const warning = jest.spyOn(console, 'warn');
    (storage.delete as jest.Mock).mockImplementation((key: string) => {
      if (key === 'agi-in-flight-turn-runs-v1') throw new Error('storage unavailable');
    });
    (storage.getString as jest.Mock).mockImplementation((key: string) =>
      key === 'agi-in-flight-turn-runs-v1'
        ? JSON.stringify([{ conversationId: 'c1', questionId: 'q1', operationId: 'o1' }])
        : undefined,
    );

    try {
      clearLocalCloudAccountState();

      expect(storage.delete).toHaveBeenCalledWith('agi-in-flight-turn-runs-v1');
      expect(clearCloudSearch).toHaveBeenCalledTimes(1);
      expect(clearManagedCloudAccess).toHaveBeenCalledTimes(1);
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
      (storage.delete as jest.Mock).mockReset();
      (storage.getString as jest.Mock).mockReset().mockReturnValue(undefined);
    }
  });

  it('drops shared text and files staged for account A before account B opens a composer', () => {
    stageComposerText('new-chat', 'Account A shared text');
    stageComposerAttachments('new-chat', [
      { id: 'share-a', uri: 'file:///cache/a.pdf', mimeType: 'application/pdf', fileName: 'a.pdf' },
    ]);

    clearLocalCloudAccountState();

    expect(takeComposerText('new-chat')).toBe('');
    expect(takeComposerAttachments('new-chat')).toEqual([]);
  });

  it('clears prior account memory consent even when the next settings omit capabilities', () => {
    const cloud = useCloudSettingsStore.getState();
    cloud.setMemoryEnabled(true);
    cloud.setIncludeSensitiveTopics(true);
    cloud.setReferencePastChats(true);
    cloud.setPersonalization({ aboutYou: 'Account A', responseLanguage: 'fr' });

    clearLocalCloudAccountState();
    applyCloudSettings({ appearance: { theme: 'dark' } });

    expect(useCloudSettingsStore.getState()).toMatchObject({
      memoryEnabled: false,
      includeSensitiveTopics: false,
      referencePastChats: false,
      memoryPolicyInitialized: false,
      personalization: useCloudSettingsStore.getInitialState().personalization,
    });
    expect(toCloudSettings(useCloudSettingsStore.getState())).not.toHaveProperty('capabilities');
    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();

    applyCloudSettings({ capabilities: { memory: true, includeSensitiveTopics: true } });
    expect(useCloudSettingsStore.getState()).toMatchObject({
      memoryEnabled: true,
      includeSensitiveTopics: true,
      memoryPolicyInitialized: true,
    });
  });

  it('keeps canonical reset defaults after the real persist middleware hydrates account settings', async () => {
    const initial = useCloudSettingsStore.getInitialState();
    (mmkvStorage.getItem as jest.Mock).mockReturnValueOnce(
      JSON.stringify({
        version: 2,
        state: {
          memoryEnabled: true,
          includeSensitiveTopics: true,
          memoryPolicyInitialized: true,
          personalization: { aboutYou: 'Persisted account A' },
        },
      }),
    );

    await useCloudSettingsStore.persist.rehydrate();
    expect(useCloudSettingsStore.getState().includeSensitiveTopics).toBe(true);
    expect(useCloudSettingsStore.getInitialState()).toBe(initial);
    expect(initial.memoryEnabled).toBe(false);
    expect(initial.includeSensitiveTopics).toBe(false);
    expect(initial.personalization.aboutYou).toBe('');

    clearLocalCloudAccountState();

    expect(useCloudSettingsStore.getState()).toEqual(initial);
    useCloudSettingsStore.getState().setPersonalization({ nickname: 'Account B' });
    expect(useCloudSettingsStore.getState().personalization.nickname).toBe('Account B');
    expect(initial.personalization.nickname).toBe('');
  });

  it('is safe to repeat when explicit sign-out is followed by Clerk expiry', () => {
    clearLocalCloudAccountState();
    clearLocalCloudAccountState();

    expect(stopCloudSyncLoop).toHaveBeenCalledTimes(2);
    expect(resetCloudSync).toHaveBeenCalledTimes(2);
    expect(clearCloudExecutionState).toHaveBeenCalledTimes(2);
    expect(clearCloudImageGenerationState).toHaveBeenCalledTimes(2);
    expect(clearCloudVideoGenerationState).toHaveBeenCalledTimes(2);
    expect(clearCloudChats).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedOfflineQueue).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedDrafts).toHaveBeenCalledTimes(2);
    expect(clearCloudMemory).toHaveBeenCalledTimes(2);
    expect(clearCloudProjects).toHaveBeenCalledTimes(2);
    expect(resetSettingsSync).toHaveBeenCalledTimes(2);
    expect(clearEntitlements).toHaveBeenCalledTimes(2);
    expect(clearCapabilitySwitches).toHaveBeenCalledTimes(2);
    expect(clearSchedules).toHaveBeenCalledTimes(2);
    expect(resetApiAccountState).toHaveBeenCalledTimes(2);
    expect(resetCloudUploads).toHaveBeenCalledTimes(2);
    expect(notificationCenterStore.clear).toHaveBeenCalledTimes(2);
    expect(resetBackgroundFetchAccountState).toHaveBeenCalledTimes(2);
    expect(clearCloudSearch).toHaveBeenCalledTimes(2);
    expect(clearManagedCloudAccess).toHaveBeenCalledTimes(2);
    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });

  it('clears again after deferred MMKV hydration so account A cannot reappear', () => {
    clearLocalCloudAccountState();

    expect(clearCloudChats).toHaveBeenCalledTimes(1);
    expect(mmkvReadyCallbacks).toHaveLength(1);

    useCloudSettingsStore.setState({
      memoryEnabled: true,
      includeSensitiveTopics: true,
      memoryPolicyInitialized: true,
    });
    mmkvReadyCallbacks[0]?.();

    expect(useCloudSettingsStore.getState()).toEqual(useCloudSettingsStore.getInitialState());
    expect(useCloudSettingsStore.getState().memoryEnabled).toBe(false);
    expect(useCloudSettingsStore.getState().includeSensitiveTopics).toBe(false);

    expect(clearCloudChats).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedOfflineQueue).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedDrafts).toHaveBeenCalledTimes(2);
    expect(clearCloudMemory).toHaveBeenCalledTimes(2);
    expect(clearCloudProjects).toHaveBeenCalledTimes(2);
    expect(clearEntitlements).toHaveBeenCalledTimes(2);
    expect(clearCapabilitySwitches).toHaveBeenCalledTimes(2);
    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });
});

describe('clearLocalCloudAccountState on persisted account stores', () => {
  const persistedCopies = new Map<string, string>();
  const chatViewModule = jest.requireActual('../stores/chat/chatViewStore') as {
    useChatViewStore: typeof import('../stores/chat/chatViewStore').useChatViewStore;
  };
  const realChatView = chatViewModule.useChatViewStore;

  const persistedState = (name: string) =>
    (JSON.parse(persistedCopies.get(name) ?? 'null') as { state: Record<string, unknown> }).state;

  beforeEach(() => {
    jest.clearAllMocks();
    persistedCopies.clear();
    (whenMmkvReady as jest.Mock).mockImplementation(() => undefined);
    (mmkvStorage.getItem as jest.Mock).mockImplementation(
      (name: string) => persistedCopies.get(name) ?? null,
    );
    (mmkvStorage.setItem as jest.Mock).mockImplementation((name: string, value: string) => {
      persistedCopies.set(name, value);
    });
    (mmkvStorage.removeItem as jest.Mock).mockImplementation((name: string) => {
      persistedCopies.delete(name);
    });
    useChatCloudMessageStore.getState.mockReturnValue({
      conversations: [{ id: 'cloud-conversation-a' }],
      clearCloudData: jest.fn(),
    });
    useCloudProjectStore.getState.mockReturnValue({
      projects: [],
      clearCloudProjectData: jest.fn(),
    });
    useChatViewStore.getState.mockImplementation(() => realChatView.getState());
  });

  afterEach(() => {
    (mmkvStorage.getItem as jest.Mock).mockReset().mockReturnValue(null);
    (mmkvStorage.setItem as jest.Mock).mockReset();
    (mmkvStorage.removeItem as jest.Mock).mockReset();
  });

  it('clears the library cache of account A from memory and from the persisted copy', async () => {
    persistedCopies.set(
      'library-store-cloud',
      JSON.stringify({
        version: 0,
        state: { ownerId: 'account-a', assets: [{ id: 'asset-a' }] },
      }),
    );
    await useLibraryCacheStore.persist.rehydrate();
    expect(useLibraryCacheStore.getState().readLibraryPage('account-a')).toHaveLength(1);

    clearLocalCloudAccountState();

    expect(useLibraryCacheStore.getState()).toMatchObject({ ownerId: null, assets: [] });
    expect(persistedState('library-store-cloud')).toEqual({ ownerId: null, assets: [] });
  });

  it('clears the style and connector choices made in account A conversations and keeps device choices', async () => {
    persistedCopies.set(
      'chat-view-store',
      JSON.stringify({
        version: 2,
        state: {
          chatMode: 'research',
          features: { webSearch: false },
          chatStyleByConversation: {
            'cloud-conversation-a': 'formal',
            conv_local_1: 'learning',
          },
          disabledConnectorIdsByConversation: {
            'cloud-conversation-a': ['connector-a'],
            conv_local_1: ['connector-local'],
          },
        },
      }),
    );
    await realChatView.persist.rehydrate();
    expect(realChatView.getState().chatStyleByConversation['cloud-conversation-a']).toBe('formal');

    clearLocalCloudAccountState();

    const memory = realChatView.getState();
    expect(memory.chatStyleByConversation).toEqual({ conv_local_1: 'learning' });
    expect(memory.disabledConnectorIdsByConversation).toEqual({
      conv_local_1: ['connector-local'],
    });
    const persisted = persistedState('chat-view-store');
    expect(persisted.chatStyleByConversation).toEqual({ conv_local_1: 'learning' });
    expect(persisted.disabledConnectorIdsByConversation).toEqual({
      conv_local_1: ['connector-local'],
    });
    expect(memory.chatMode).toBe('research');
    expect(persisted.chatMode).toBe('research');
    expect(memory.features.webSearch).toBe(false);
  });
});
