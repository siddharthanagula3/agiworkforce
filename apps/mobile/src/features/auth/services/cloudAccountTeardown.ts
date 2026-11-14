import { whenMmkvReady } from '@/lib/mmkv';

export interface ClearCloudAccountOptions {
  keepUnsentWork?: boolean;
}

function runTeardownStep(label: string, step: () => void): void {
  try {
    step();
  } catch (error) {
    console.warn(`[auth] Failed to clear Cloud ${label} state:`, error);
  }
}

function clearUnsentCloudWorkNow(): void {
  /* eslint-disable @typescript-eslint/no-require-imports */
  runTeardownStep('offline Cloud sends', () => {
    const { clearAccountScopedOfflineQueue } = require('@/services/offlineQueue');
    clearAccountScopedOfflineQueue();
  });

  runTeardownStep('Cloud composer drafts', () => {
    const { clearAccountScopedDrafts } = require('@/src/features/chat/draftStore');
    clearAccountScopedDrafts();
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function clearLocalCloudAccountStateNow({ keepUnsentWork }: ClearCloudAccountOptions): void {
  /* eslint-disable @typescript-eslint/no-require-imports */
  let cloudConversationIds: string[] = [];
  let cloudProjectIds: string[] = [];

  runTeardownStep('app mode', () => {
    const { useChatAppModeStore } = require('@/src/features/chat/store/appModeStore');
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  runTeardownStep('sync loop', () => {
    const { stopCloudSyncLoop } = require('@/services/cloudSyncEngine');
    stopCloudSyncLoop();
  });

  runTeardownStep('chat sync cursor', () => {
    const { useCloudSyncStateStore } = require('@/stores/chat/cloudSyncStateStore');
    useCloudSyncStateStore.getState().reset();
  });

  runTeardownStep('active Cloud chat execution', () => {
    const { clearCloudExecutionState } = require('@/stores/chat/chatExecutionStore');
    clearCloudExecutionState();
  });

  runTeardownStep('active Cloud image generation', () => {
    const {
      clearCloudImageGenerationState,
    } = require('@/src/features/chat/actions/runImageGenerationTurn');
    clearCloudImageGenerationState();
  });

  runTeardownStep('active Cloud video generation', () => {
    const {
      clearCloudVideoGenerationState,
    } = require('@/src/features/chat/actions/runVideoGenerationTurn');
    clearCloudVideoGenerationState();
  });

  runTeardownStep('Cloud conversation selection', () => {
    const { useChatCloudMessageStore } = require('@/stores/chat/chatCloudMessageStore');
    const { useChatMessageStore } = require('@/stores/chat/chatMessageStore');
    cloudConversationIds = useChatCloudMessageStore
      .getState()
      .conversations.map((conversation: { id: string }) => conversation.id);
    useChatMessageStore.getState().clearCloudConversationSelection(cloudConversationIds);
  });

  runTeardownStep('Cloud conversation pagination', () => {
    const { clearCloudConversationPagination } = require('@/stores/chat/chatMessageStore');
    clearCloudConversationPagination();
  });

  runTeardownStep('chat cache', () => {
    const { useChatCloudMessageStore } = require('@/stores/chat/chatCloudMessageStore');
    useChatCloudMessageStore.getState().clearCloudData();
  });

  runTeardownStep('artifact cache', () => {
    const { clearAccountScopedArtifactState } = require('@/src/features/artifacts/store');
    clearAccountScopedArtifactState();
  });

  if (!keepUnsentWork) clearUnsentCloudWorkNow();

  runTeardownStep('composer handoff', () => {
    const { clearComposerHandoff } = require('@/src/features/chat/composerHandoff');
    clearComposerHandoff();
  });

  runTeardownStep('memory cache', () => {
    const { useCloudMemoryStore } = require('@/stores/memory/cloudMemoryStore');
    useCloudMemoryStore.getState().clearCloudMemoryData();
  });

  runTeardownStep('memory sync cursor', () => {
    const { useMemorySyncStateStore } = require('@/stores/memory/memorySyncStateStore');
    useMemorySyncStateStore.getState().resetMemorySync();
  });

  runTeardownStep('project cache', () => {
    const { useCloudProjectStore } = require('@/stores/projects/cloudProjectStore');
    cloudProjectIds = useCloudProjectStore
      .getState()
      .projects.map((project: { id: string }) => project.id);
    useCloudProjectStore.getState().clearCloudProjectData();
  });

  runTeardownStep('project sync cursor', () => {
    const { useProjectSyncStateStore } = require('@/stores/projects/projectSyncStateStore');
    useProjectSyncStateStore.getState().resetProjectSync();
  });

  runTeardownStep('settings sync cursor', () => {
    const { useSettingsSyncStateStore } = require('@/stores/settings/settingsSyncStateStore');
    useSettingsSyncStateStore.getState().resetSettingsSync();
  });

  runTeardownStep('settings cache', () => {
    const { useCloudSettingsStore } = require('@/stores/settings/cloudSettingsStore');
    useCloudSettingsStore.setState(useCloudSettingsStore.getInitialState());
  });

  runTeardownStep('Cloud agent controls', () => {
    const { useAgentControlStore } = require('@/stores/agentControlStore');
    useAgentControlStore.getState().clearCloudOverrides(cloudConversationIds, cloudProjectIds);
  });

  runTeardownStep('subscription entitlements', () => {
    const { useTierStore } = require('@/src/features/billing/store');
    useTierStore.getState().clearAccountEntitlements();
  });

  runTeardownStep('Cloud usage', () => {
    const { useCloudUsageStore } = require('@/src/features/settings/cloud-usage/store');
    useCloudUsageStore.getState().clear();
  });

  runTeardownStep('Cloud profile name', () => {
    const {
      useCloudProfileStore,
    } = require('@/src/features/settings/cloud-account/cloudProfileStore');
    useCloudProfileStore.getState().reset();
  });

  runTeardownStep('capability switches', () => {
    const { useRemoteCapabilityStore } = require('@/src/lib/Capabilities');
    useRemoteCapabilityStore.getState().clear();
  });

  runTeardownStep('promotional model catalogue', () => {
    const {
      useFreeQuotaCatalogueStore,
    } = require('@/src/features/model-picker/freeQuotaCatalogue');
    useFreeQuotaCatalogueStore.getState().clear();
  });

  runTeardownStep('promotional model selection', () => {
    const { useModelStore } = require('@/src/features/model-picker/store');
    const { getProviderOffering } = require('@agiworkforce/types');
    const { DEFAULT_LOCAL_MODEL_ID } = require('@/src/features/model-picker/service');
    const selected = useModelStore.getState().selectedModel;
    if (getProviderOffering(selected)) useModelStore.getState().setModel(DEFAULT_LOCAL_MODEL_ID);
  });

  runTeardownStep('schedule cache', () => {
    const { useScheduleStore } = require('@/src/features/schedules/store');
    useScheduleStore.getState().clearAccountSchedules();
  });

  runTeardownStep('connector policy', () => {
    const { invalidateConnectorPolicy } = require('@/services/connectors');
    invalidateConnectorPolicy();
  });

  runTeardownStep('API authentication work', () => {
    const { resetApiAccountState } = require('@/services/api');
    resetApiAccountState();
  });

  runTeardownStep('Cloud upload progress', () => {
    const { useUploadLifecycleStore } = require('@/src/features/chat/upload/uploadLifecycle');
    useUploadLifecycleStore.getState().reset();
  });

  runTeardownStep('notification center', () => {
    const { notificationCenterStore } = require('@/services/notifications');
    notificationCenterStore.clear();
  });

  runTeardownStep('account notification feed', () => {
    const { useAccountNotificationFeed } = require('@/src/features/notifications/accountFeed');
    useAccountNotificationFeed.getState().reset();
  });

  runTeardownStep('background approval notifications', () => {
    const { resetBackgroundFetchAccountState } = require('@/services/backgroundFetch');
    resetBackgroundFetchAccountState();
  });

  runTeardownStep('server search cache', () => {
    const { useChatViewStore } = require('@/stores/chat/chatViewStore');
    useChatViewStore.getState().clearCloudSearchState();
  });

  runTeardownStep('Managed Cloud access', () => {
    const { useWaitlistStore } = require('@/src/features/waitlist/store');
    useWaitlistStore.getState().clear();
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function runNowAndOnceStorageIsReady(teardown: () => void): void {
  teardown();

  let registrationComplete = false;
  whenMmkvReady(() => {
    if (registrationComplete) teardown();
  });
  registrationComplete = true;
}

export function clearLocalCloudAccountState(options: ClearCloudAccountOptions = {}): void {
  runNowAndOnceStorageIsReady(() => clearLocalCloudAccountStateNow(options));
}

export function clearUnsentCloudWork(): void {
  runNowAndOnceStorageIsReady(clearUnsentCloudWorkNow);
}

export function hasQueuedCloudSends(): boolean {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { offlineQueue } = require('@/services/offlineQueue');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return (offlineQueue.getQueue() as { provenance: { scope: string } }[]).some(
    (entry) => entry.provenance.scope === 'cloud',
  );
}
