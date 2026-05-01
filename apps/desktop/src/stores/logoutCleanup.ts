/**
 * Centralized logout cleanup utility
 *
 * This module provides a single function that clears all store state when
 * a user logs out. It ensures that:
 * 1. All sensitive user data is removed from memory
 * 2. All event listeners are cleaned up
 * 3. All persisted state is cleared where appropriate
 * 4. No memory leaks from active timers/intervals
 *
 * Import and call this function in authStore.signOut() to ensure
 * complete cleanup across all stores.
 */

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
// Orchestration store archived - visual workflow builder removed
import { useProductivityStore } from './productivityStore';
import { useProjectStore } from './projectStore';
import { useSettingsStore } from './settingsStore';
import { useTerminalStore } from './terminalStore';
import { useUnifiedChatStore } from './unifiedChatStore';
import { useAutomationStore } from './automationStore';
import { useOnboardingStore } from './onboardingStore';
import { useSettingsV2Store } from './settingsV2Store';
import { useChatMemoryStore } from './chatMemoryStore';
import { useCheckpointStore } from './checkpointStore';
import { useCodingCheckpointStore } from './codingCheckpointStore';
import { useGitStore } from './gitStore';
import { useHooksStore } from './hooksStore';
import { useIntentStore } from './intentStore';
import { useKnowledgeStore } from './knowledgeStore';
import { useLLMConfigStore } from './llmConfigStore';
import { useProjectMemoryStore } from './projectMemoryStore';
import { useSecurityStore } from './securityStore';
import { useVisionStore } from './visionStore';

/**
 * Clears all store state on logout.
 * Call this after supabaseAuth.signOut() completes.
 *
 * Order matters: clean up stores with dependencies last.
 */
export function cleanupAllStoresOnLogout(): void {
  try {
    // 1. Clean up stores with event listeners and timers first
    // These have active resources that need to be released

    // Browser store has Tauri event listeners
    const browserStore = useBrowserStore.getState();
    browserStore.cleanup();

    // Terminal store has session listeners
    const terminalStore = useTerminalStore.getState();
    terminalStore.reset();

    // Automation store has state that should be reset
    const automationStore = useAutomationStore.getState();
    automationStore.reset();

    // HIGH-001/HIGH-002: Connectors store — clear OAuth timers and state
    const connectorsStore = useConnectorsStore.getState();
    connectorsStore.resetOnLogout();

    // AUDIT-006-011: Productivity store cleanup
    const productivityStore = useProductivityStore.getState();
    productivityStore.resetOnLogout();

    // 2. Clean up data stores

    // Unified chat store - clears conversations, messages, pending state
    const chatStore = useUnifiedChatStore.getState();
    chatStore.resetOnLogout();

    // AUDIT-006-019: MCP store - use dedicated resetOnLogout function
    const mcpStore = useMcpStore.getState();
    mcpStore.resetOnLogout();

    // AUDIT-006-022: Database store - clear connections and state
    const databaseStore = useDatabaseStore.getState();
    databaseStore.resetOnLogout();

    // AUDIT-006-028: Execution store - cleanup event listeners and reset
    cleanupBackgroundTaskEventListeners();
    cleanupAgentWorkflowEventListeners();
    cleanupAgentTaskEventListeners();
    useAgentTaskStore.getState().resetOnLogout();
    cleanupExecutionListeners();
    cleanupRuntimeActivityEventListeners();
    const executionStore = useExecutionStore.getState();
    executionStore.reset();

    // Orchestration store archived - visual workflow builder removed

    // Stop analytics auto-refresh before resetting state
    stopMetricsAutoRefresh();

    // Billing/Usage consolidated store - clear usage data but keep filters and budget config
    useBillingUsageStore.setState({
      // Cost state
      costOverview: null,
      costAnalytics: null,
      loadingCostOverview: false,
      loadingCostAnalytics: false,
      costError: null,
      // Usage state
      usageStats: null,
      usageStatsLoading: false,
      showAutomationWarning: false,
      showApiCallWarning: false,
      showStorageWarning: false,
      showTokenWarning: false,
      usageError: null,
      // Analytics state
      systemMetrics: null,
      appMetrics: null,
      analyticsUsageStats: null,
      featureUsage: [],
      isLoadingMetrics: false,
      isLoadingStats: false,
      // ROI state
      roiReport: null,
      processMetrics: [],
      userMetrics: [],
      toolMetrics: [],
      trends: {},
      isLoadingROI: false,
    });

    // Unified Auth store cleanup is handled by the caller (auth.ts signOut)
    // to avoid a circular dependency (auth -> logoutCleanup -> auth).

    // 3. Clean up stores that should preserve some state (preferences)

    // Code store - close all files
    const codeStore = useCodeStore.getState();
    codeStore.closeAllFiles();

    // Model store - reset selection but keep favorites (user preference)
    const modelStore = useModelStore.getState();
    modelStore.reset();

    // Project store - we don't reset since projects are local
    // but clear active project selection
    useProjectStore.setState({
      activeProjectId: null,
      isLoading: false,
      error: null,
    });

    // Settings store - preserve settings (they're app-level, not user-level)
    // Just clear any error state
    useSettingsStore.setState({
      error: null,
    });

    // Onboarding store - clear session-specific state on logout
    useOnboardingStore.setState({
      session: null,
      firstRunSession: null,
      error: null,
    });

    // Settings V2 store - clear cached settings (will reload from DB on next login)
    useSettingsV2Store.setState({
      settings: {},
      appSettings: null,
      error: null,
    });

    // 4. Clean up feature stores — use safe setState to initial values.
    // These stores may not expose a reset() method, so we set state directly.
    const featureStores = [
      useChatMemoryStore,
      useCheckpointStore,
      useCodingCheckpointStore,
      useGitStore,
      useHooksStore,
      useIntentStore,
      useKnowledgeStore,
      useLLMConfigStore,
      useProjectMemoryStore,
      useSecurityStore,
      useVisionStore,
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

/**
 * Clears persisted storage for user-specific data.
 * Call this to ensure a completely clean slate on logout.
 */
export function clearPersistedUserData(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove = [
    'unified-chat-storage',
    'chat-storage',
    'unified-auth-storage',
    'agiworkforce-agent-tasks',
    'billing-usage-store',
    'connectors-store',
    'id-mappings',
    // Legacy store keys (now consolidated)
    'billing-storage', // Legacy - now in unified-auth-storage
    'auth-storage', // Legacy - now in unified-auth-storage
    'account-storage', // Legacy - now in unified-auth-storage
    'cost-store',
    'agiworkforce-token-budget',
    // Note: Keep these as they're app preferences, not user data:
    // 'settings-storage', 'model-storage', 'onboarding-storage'
  ];

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[LogoutCleanup] Failed to remove ${key} from localStorage:`, error);
    }
  }
}
