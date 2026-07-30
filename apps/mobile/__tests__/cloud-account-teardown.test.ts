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

jest.mock('../stores/settings/cloudSettingsStore', () => ({
  useCloudSettingsStore: { setState: jest.fn() },
}));

jest.mock('../src/features/billing/store', () => ({
  useTierStore: { getState: jest.fn() },
}));

jest.mock('../src/features/schedules/store', () => ({
  useScheduleStore: { getState: jest.fn() },
}));

jest.mock('../services/api', () => ({
  resetApiAccountState: jest.fn(),
}));

jest.mock('../services/notifications', () => ({
  notificationCenterStore: { clear: jest.fn() },
}));

jest.mock('../services/backgroundFetch', () => ({
  resetBackgroundFetchAccountState: jest.fn(),
}));

jest.mock('../src/features/billing/iapStore', () => ({
  useIapStore: { getState: jest.fn() },
}));

jest.mock('../stores/chat/chatViewStore', () => ({
  useChatViewStore: { getState: jest.fn() },
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: { setState: jest.fn() },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn(),
}));

jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: { getState: jest.fn() },
}));

// These device-local stores are deliberately mocked even though the teardown
// service must never import them. The assertions below guard the Local/Cloud
// trust boundary during future account-cache additions.
jest.mock('../stores/settings/localSettingsStore', () => ({
  useLocalSettingsStore: { setState: jest.fn() },
}));

jest.mock('../stores/chat/chatMessageStore', () => ({
  useChatMessageStore: { getState: jest.fn(), setState: jest.fn() },
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
const { useCloudSettingsStore } = require('../stores/settings/cloudSettingsStore') as {
  useCloudSettingsStore: { setState: jest.Mock };
};
const { useTierStore } = require('../src/features/billing/store') as {
  useTierStore: { getState: jest.Mock };
};
const { useScheduleStore } = require('../src/features/schedules/store') as {
  useScheduleStore: { getState: jest.Mock };
};
const { resetApiAccountState } = require('../services/api') as {
  resetApiAccountState: jest.Mock;
};
const { notificationCenterStore } = require('../services/notifications') as {
  notificationCenterStore: { clear: jest.Mock };
};
const { resetBackgroundFetchAccountState } = require('../services/backgroundFetch') as {
  resetBackgroundFetchAccountState: jest.Mock;
};
const { useIapStore } = require('../src/features/billing/iapStore') as {
  useIapStore: { getState: jest.Mock };
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

import { clearLocalCloudAccountState } from '../src/features/auth/services/cloudAccountTeardown';

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
  const clearSchedules = jest.fn();
  const resetIapFlow = jest.fn();
  const clearCloudSearch = jest.fn();
  const clearManagedCloudAccess = jest.fn();
  let mmkvReadyCallbacks: Array<() => void>;

  beforeEach(() => {
    jest.clearAllMocks();
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
    useScheduleStore.getState.mockReturnValue({ clearAccountSchedules: clearSchedules });
    useIapStore.getState.mockReturnValue({ reset: resetIapFlow });
    useChatViewStore.getState.mockReturnValue({ clearCloudSearchState: clearCloudSearch });
    useWaitlistStore.getState.mockReturnValue({ clear: clearManagedCloudAccess });
  });

  it('clears account A Cloud data before account B while preserving Local data', () => {
    clearLocalCloudAccountState();

    expect(stopCloudSyncLoop).toHaveBeenCalledTimes(1);
    expect(resetCloudSync).toHaveBeenCalledTimes(1);
    expect(clearCloudExecutionState).toHaveBeenCalledTimes(1);
    expect(clearCloudImageGenerationState).toHaveBeenCalledTimes(1);
    expect(clearCloudChats).toHaveBeenCalledTimes(1);
    expect(clearCloudConversationSelection).toHaveBeenCalledWith(['cloud-conversation-a']);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(1);
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
    expect(clearSchedules).toHaveBeenCalledTimes(1);
    expect(resetApiAccountState).toHaveBeenCalledTimes(1);
    expect(notificationCenterStore.clear).toHaveBeenCalledTimes(1);
    expect(resetBackgroundFetchAccountState).toHaveBeenCalledTimes(1);
    expect(resetIapFlow).toHaveBeenCalledTimes(1);
    expect(clearCloudSearch).toHaveBeenCalledTimes(1);
    expect(useCloudSettingsStore.setState).toHaveBeenCalledWith({
      themeMode: 'system',
      accentColor: 'neutral',
      fontPreference: 'default',
      notificationsEnabled: true,
      speechLanguage: 'en',
      autoListenEnabled: true,
      referencePastChats: false,
      generateMemoryFromHistory: true,
      memoryPolicyInitialized: false,
      personalization: {
        fullName: '',
        nickname: '',
        occupation: '',
        instructions: '',
        style: 'default',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
      settingsUpdatedAt: null,
    });
    expect(useChatAppModeStore.setState).toHaveBeenCalledWith({ appMode: 'local' });
    expect(clearManagedCloudAccess).toHaveBeenCalledTimes(1);

    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });

  it('is safe to repeat when explicit sign-out is followed by Clerk expiry', () => {
    clearLocalCloudAccountState();
    clearLocalCloudAccountState();

    expect(stopCloudSyncLoop).toHaveBeenCalledTimes(2);
    expect(resetCloudSync).toHaveBeenCalledTimes(2);
    expect(clearCloudExecutionState).toHaveBeenCalledTimes(2);
    expect(clearCloudImageGenerationState).toHaveBeenCalledTimes(2);
    expect(clearCloudChats).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedOfflineQueue).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedDrafts).toHaveBeenCalledTimes(2);
    expect(clearCloudMemory).toHaveBeenCalledTimes(2);
    expect(clearCloudProjects).toHaveBeenCalledTimes(2);
    expect(resetSettingsSync).toHaveBeenCalledTimes(2);
    expect(clearEntitlements).toHaveBeenCalledTimes(2);
    expect(clearSchedules).toHaveBeenCalledTimes(2);
    expect(resetApiAccountState).toHaveBeenCalledTimes(2);
    expect(notificationCenterStore.clear).toHaveBeenCalledTimes(2);
    expect(resetBackgroundFetchAccountState).toHaveBeenCalledTimes(2);
    expect(resetIapFlow).toHaveBeenCalledTimes(2);
    expect(clearCloudSearch).toHaveBeenCalledTimes(2);
    expect(clearManagedCloudAccess).toHaveBeenCalledTimes(2);
    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });

  it('clears again after deferred MMKV hydration so account A cannot reappear', () => {
    clearLocalCloudAccountState();

    expect(clearCloudChats).toHaveBeenCalledTimes(1);
    expect(mmkvReadyCallbacks).toHaveLength(1);

    // Simulate all persisted stores rehydrating account-A data first. The
    // teardown callback was registered after those store callbacks and must
    // erase the restored data once encrypted MMKV becomes ready.
    mmkvReadyCallbacks[0]?.();

    expect(clearCloudChats).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedArtifactState).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedOfflineQueue).toHaveBeenCalledTimes(2);
    expect(clearAccountScopedDrafts).toHaveBeenCalledTimes(2);
    expect(clearCloudMemory).toHaveBeenCalledTimes(2);
    expect(clearCloudProjects).toHaveBeenCalledTimes(2);
    expect(clearEntitlements).toHaveBeenCalledTimes(2);
    expect(useLocalSettingsStore.setState).not.toHaveBeenCalled();
    expect(useChatMessageStore.setState).not.toHaveBeenCalled();
  });
});
