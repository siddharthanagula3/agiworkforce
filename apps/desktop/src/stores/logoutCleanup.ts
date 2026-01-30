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

import { useUnifiedAuthStore, cleanupUnifiedAuthStore } from './auth';
import { useBillingUsageStore, stopMetricsAutoRefresh } from './billingUsage';
import { useBrowserStore } from './browserStore';
import { useCodeStore } from './codeStore';
import { useDatabaseStore } from './databaseStore';
import { useExecutionStore, cleanupExecutionListeners } from './executionStore';
import { useMcpStore } from './mcpStore';
import { useModelStore } from './modelStore';
// Orchestration store archived - visual workflow builder removed
import { useProductivityStore } from './productivityStore';
import { useProjectStore } from './projectStore';
import { useSettingsStore } from './settingsStore';
import { useTerminalStore } from './terminalStore';
import { useUnifiedChatStore } from './unifiedChatStore';
import { useAutomationStore } from './automationStore';

/**
 * Clears all store state on logout.
 * Call this after supabaseAuth.signOut() completes.
 *
 * Order matters: clean up stores with dependencies last.
 */
export function cleanupAllStoresOnLogout(): void {
  console.log('[LogoutCleanup] Starting store cleanup...');

  try {
    // 1. Clean up stores with event listeners and timers first
    // These have active resources that need to be released

    // Browser store has Tauri event listeners
    const browserStore = useBrowserStore.getState();
    browserStore.cleanup();
    console.log('[LogoutCleanup] Browser store cleaned up');

    // Terminal store has session listeners
    const terminalStore = useTerminalStore.getState();
    terminalStore.reset();
    console.log('[LogoutCleanup] Terminal store cleaned up');

    // Automation store has state that should be reset
    const automationStore = useAutomationStore.getState();
    automationStore.reset();
    console.log('[LogoutCleanup] Automation store cleaned up');

    // AUDIT-006-011: Productivity store cleanup
    const productivityStore = useProductivityStore.getState();
    productivityStore.resetOnLogout();
    console.log('[LogoutCleanup] Productivity store cleaned up');

    // 2. Clean up data stores

    // Unified chat store - clears conversations, messages, pending state
    const chatStore = useUnifiedChatStore.getState();
    chatStore.resetOnLogout();
    console.log('[LogoutCleanup] Chat store cleaned up');

    // AUDIT-006-019: MCP store - use dedicated resetOnLogout function
    const mcpStore = useMcpStore.getState();
    mcpStore.resetOnLogout();
    console.log('[LogoutCleanup] MCP store cleaned up');

    // AUDIT-006-022: Database store - clear connections and state
    const databaseStore = useDatabaseStore.getState();
    databaseStore.resetOnLogout();
    console.log('[LogoutCleanup] Database store cleaned up');

    // AUDIT-006-028: Execution store - cleanup event listeners and reset
    cleanupExecutionListeners();
    const executionStore = useExecutionStore.getState();
    executionStore.reset();
    console.log('[LogoutCleanup] Execution store cleaned up');

    // Orchestration store archived - visual workflow builder removed
    console.log('[LogoutCleanup] Orchestration store skipped (archived)');

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
    console.log('[LogoutCleanup] Billing/Usage store cleaned up');

    // Unified Auth store - clear account, billing, and auth data
    // (Consolidated from authStore, accountStore, and billingStore)
    cleanupUnifiedAuthStore();
    useUnifiedAuthStore.getState().reset();
    console.log('[LogoutCleanup] Unified Auth store cleaned up');

    // 3. Clean up stores that should preserve some state (preferences)

    // Code store - close all files
    const codeStore = useCodeStore.getState();
    codeStore.closeAllFiles();
    console.log('[LogoutCleanup] Code store cleaned up');

    // Model store - reset selection but keep favorites (user preference)
    const modelStore = useModelStore.getState();
    modelStore.reset();
    console.log('[LogoutCleanup] Model store cleaned up');

    // Project store - we don't reset since projects are local
    // but clear active project selection
    useProjectStore.setState({
      activeProjectId: null,
      isLoading: false,
      error: null,
    });
    console.log('[LogoutCleanup] Project store cleaned up');

    // Settings store - preserve settings (they're app-level, not user-level)
    // Just clear any error state
    useSettingsStore.setState({
      error: null,
    });
    console.log('[LogoutCleanup] Settings store cleaned up');

    console.log('[LogoutCleanup] All stores cleaned up successfully');
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
    'unified-auth-storage',
    'billing-usage-store',
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

  console.log('[LogoutCleanup] Persisted user data cleared');
}
