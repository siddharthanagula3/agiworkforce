/**
 * Clear every device-side cache that belongs to the currently authenticated
 * Cloud account.
 *
 * This service is deliberately synchronous and network-free so it can run both
 * from explicit sign-out and from Clerk's loaded -> signed-out transition
 * (session expiry, revocation, or an external sign-out). It must never call
 * Clerk signOut itself: doing so from ClerkTokenBridge would recurse through
 * the same auth transition.
 *
 * Local chats, Local settings, Local memories, and Local projects are not
 * imported here. They belong to the device's Local trust boundary and survive
 * Cloud account changes.
 */
import { whenMmkvReady } from '@/lib/mmkv';

const DEFAULT_CLOUD_SETTINGS = {
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
} as const;

function runTeardownStep(label: string, step: () => void): void {
  try {
    step();
  } catch (error) {
    // Account isolation is best-effort per store: one malformed/hydration-failed
    // cache must not prevent the remaining account-scoped stores from clearing.
    console.warn(`[auth] Failed to clear Cloud ${label} state:`, error);
  }
}

function clearLocalCloudAccountStateNow(): void {
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

  runTeardownStep('Cloud conversation selection', () => {
    const { useChatCloudMessageStore } = require('@/stores/chat/chatCloudMessageStore');
    const { useChatMessageStore } = require('@/stores/chat/chatMessageStore');
    cloudConversationIds = useChatCloudMessageStore
      .getState()
      .conversations.map((conversation: { id: string }) => conversation.id);
    useChatMessageStore.getState().clearCloudConversationSelection(cloudConversationIds);
  });

  runTeardownStep('chat cache', () => {
    const { useChatCloudMessageStore } = require('@/stores/chat/chatCloudMessageStore');
    useChatCloudMessageStore.getState().clearCloudData();
  });

  runTeardownStep('artifact cache', () => {
    const { clearAccountScopedArtifactState } = require('@/src/features/artifacts/store');
    clearAccountScopedArtifactState();
  });

  runTeardownStep('offline Cloud sends', () => {
    const { clearAccountScopedOfflineQueue } = require('@/services/offlineQueue');
    clearAccountScopedOfflineQueue();
  });

  runTeardownStep('Cloud composer drafts', () => {
    const { clearAccountScopedDrafts } = require('@/src/features/chat/draftStore');
    clearAccountScopedDrafts();
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
    useCloudSettingsStore.setState(DEFAULT_CLOUD_SETTINGS);
  });

  runTeardownStep('Cloud agent controls', () => {
    const { useAgentControlStore } = require('@/stores/agentControlStore');
    useAgentControlStore.getState().clearCloudOverrides(cloudConversationIds, cloudProjectIds);
  });

  runTeardownStep('subscription entitlements', () => {
    const { useTierStore } = require('@/src/features/billing/store');
    useTierStore.getState().clearAccountEntitlements();
  });

  runTeardownStep('schedule cache', () => {
    const { useScheduleStore } = require('@/src/features/schedules/store');
    useScheduleStore.getState().clearAccountSchedules();
  });

  runTeardownStep('API authentication work', () => {
    const { resetApiAccountState } = require('@/services/api');
    resetApiAccountState();
  });

  runTeardownStep('notification center', () => {
    const { notificationCenterStore } = require('@/services/notifications');
    notificationCenterStore.clear();
  });

  runTeardownStep('background approval notifications', () => {
    const { resetBackgroundFetchAccountState } = require('@/services/backgroundFetch');
    resetBackgroundFetchAccountState();
  });

  runTeardownStep('in-app purchase flow', () => {
    const { useIapStore } = require('@/src/features/billing/iapStore');
    useIapStore.getState().reset();
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

export function clearLocalCloudAccountState(): void {
  clearLocalCloudAccountStateNow();

  // If teardown was requested before encrypted MMKV opened, every store above
  // currently contains defaults and its persisted account-A payload is still
  // queued to rehydrate. Register this callback after loading those stores so
  // their rehydrate callbacks run first, then erase the restored account data.
  // whenMmkvReady fires synchronously when already ready; avoid a redundant
  // second clear in that normal case.
  let registrationComplete = false;
  whenMmkvReady(() => {
    if (registrationComplete) clearLocalCloudAccountStateNow();
  });
  registrationComplete = true;
}
