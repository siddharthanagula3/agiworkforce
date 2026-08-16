
import { useBillingUsageStore, stopMetricsAutoRefresh } from './billingUsage';
import { useBrowserStore } from './browserStore';
import { useCodeStore } from './codeStore';
import { useConnectorsStore } from './connectorsStore';
import { useDatabaseStore } from './databaseStore';
import { useExecutionStore, cleanupExecutionListeners } from './executionStore';
import { cleanupAgentWorkflowEventListeners } from './chat/agentWorkflowEvents';
import { cleanupBackgroundTaskEventListeners } from './chat/agentStore';
import { cleanupAgentTaskEventListeners, useAgentTaskStore } from './agentTaskStore';
import { cleanupRuntimeActivityEventListeners } from '../hooks/useAgenticEvents';
import { useMcpStore } from './mcpStore';
import { useModelStore } from './modelStore';
import { useProductivityStore } from './productivityStore';
import { useProjectStore } from './projectStore';
import { useSettingsStore } from './settingsStore';
import { useTerminalStore } from './terminalStore';
import { useUnifiedChatStore } from './unifiedChatStore';
import { useCodingCheckpointStore } from './codingCheckpointStore';
import { useProjectMemoryStore } from './projectMemoryStore';
import { useSecurityStore } from './securityStore';
import { STORAGE_KEYS } from '../constants/storageKeys';

export function cleanupAllStoresOnLogout(): void {
  try {

    const browserStore = useBrowserStore.getState();
    browserStore.cleanup();

    const terminalStore = useTerminalStore.getState();
    terminalStore.reset();

    const connectorsStore = useConnectorsStore.getState();
    connectorsStore.resetOnLogout();

    const productivityStore = useProductivityStore.getState();
    productivityStore.resetOnLogout();

    const chatStore = useUnifiedChatStore.getState();
    chatStore.resetOnLogout();

    const mcpStore = useMcpStore.getState();
    mcpStore.resetOnLogout();

    const databaseStore = useDatabaseStore.getState();
    databaseStore.resetOnLogout();

    cleanupBackgroundTaskEventListeners();
    cleanupAgentWorkflowEventListeners();
    cleanupAgentTaskEventListeners();
    useAgentTaskStore.getState().resetOnLogout();
    cleanupExecutionListeners();
    cleanupRuntimeActivityEventListeners();
    const executionStore = useExecutionStore.getState();
    executionStore.reset();

    stopMetricsAutoRefresh();

    useBillingUsageStore.setState({
      costOverview: null,
      costAnalytics: null,
      loadingCostOverview: false,
      loadingCostAnalytics: false,
      costError: null,
      usageStats: null,
      usageStatsLoading: false,
      showAutomationWarning: false,
      showApiCallWarning: false,
      showStorageWarning: false,
      showTokenWarning: false,
      usageError: null,
      systemMetrics: null,
      appMetrics: null,
      analyticsUsageStats: null,
      featureUsage: [],
      isLoadingMetrics: false,
      isLoadingStats: false,
      roiReport: null,
      processMetrics: [],
      userMetrics: [],
      toolMetrics: [],
      trends: {},
      isLoadingROI: false,
    });

    const codeStore = useCodeStore.getState();
    codeStore.closeAllFiles();

    const modelStore = useModelStore.getState();
    modelStore.reset();

    useProjectStore.setState({
      projects: [],
      activeProjectId: null,
      isLoading: false,
      error: null,
    });

    useSettingsStore.setState({
      error: null,
    });

    const featureStores = [
      useCodingCheckpointStore,
      useProjectMemoryStore,
      useSecurityStore,
    ] as const;

    for (const store of featureStores) {
      const state = store.getState() as unknown as Record<string, unknown>;
      if (typeof state['reset'] === 'function') {
        (state as unknown as { reset: () => void }).reset();
      }
    }
  } catch (error) {
    console.error('[LogoutCleanup] Error during store cleanup:', error);
    // Don't throw - logout should complete even if cleanup has issues
  }
}

export function clearPersistedUserData(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove = [
    'chat-storage',
    'unified-auth-storage',
    'agiworkforce-agent-tasks',
    'billing-usage-store',
    'connectors-store',
    STORAGE_KEYS.ID_MAPPINGS,
    'agiworkforce-memory', // remembered facts about the user
    'agiworkforce-custom-instructions',
    'research-store', // research reports
    'artifact-store', // generated artifact bodies
    'trigger-store',
    'agiworkforce-scheduler',
    'agiworkforce-cache', // codebase stats scanned from the user's projects
    'image-gallery-store', // generated images
    'execution-sidecar-storage',
    'tool-storage', // includes the user's trusted-workflow decisions
    'unified-chat-storage',
    'agi-web-chat',
    'billing-storage', // Legacy - now in unified-auth-storage
    'auth-storage', // Legacy - now in unified-auth-storage
    'account-storage', // Legacy - now in unified-auth-storage
    'cost-store',
    'agiworkforce-token-budget',
    // Note: keep these as they are device/app preferences, not user data:
    // 'agiworkforce-settings', 'agiworkforce-models', 'agiworkforce-ui',
    // 'agiworkforce-updater', 'app-mode-store', 'chat-view-storage',
    // 'agiworkforce-voice-mode', 'agiworkforce-voice-input',
    // 'agiworkforce-cowork-dispatch'
  ];

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[LogoutCleanup] Failed to remove ${key} from localStorage:`, error);
    }
  }
}
