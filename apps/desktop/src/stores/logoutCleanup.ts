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

import { useBillingStore } from './billingStore';
import { useBrowserStore } from './browserStore';
import { useCodeStore } from './codeStore';
import { useCostStore } from './costStore';
import { useMcpStore } from './mcpStore';
import { useModelStore } from './modelStore';
import { useOrchestrationStore } from './orchestrationStore';
import { useProjectStore } from './projectStore';
import { useSettingsStore } from './settingsStore';
import { useTerminalStore } from './terminalStore';
import { useUnifiedChatStore } from './unifiedChatStore';
import { useAccountStore, cleanupAccountStore } from './accountStore';
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

    // 2. Clean up data stores

    // Unified chat store - clears conversations, messages, pending state
    const chatStore = useUnifiedChatStore.getState();
    chatStore.resetOnLogout();
    console.log('[LogoutCleanup] Chat store cleaned up');

    // MCP store - clear server connections and config
    useMcpStore.setState({
      servers: [],
      tools: [],
      config: null,
      stats: {},
      isInitialized: false,
      isLoading: false,
      error: null,
      selectedServer: null,
      searchQuery: '',
    });
    console.log('[LogoutCleanup] MCP store cleaned up');

    // Orchestration store - clear workflows and executions
    const orchestrationStore = useOrchestrationStore.getState();
    orchestrationStore.reset();
    console.log('[LogoutCleanup] Orchestration store cleaned up');

    // Cost store - clear usage data but keep filters
    useCostStore.setState({
      overview: null,
      analytics: null,
      loadingOverview: false,
      loadingAnalytics: false,
      error: null,
    });
    console.log('[LogoutCleanup] Cost store cleaned up');

    // Account store - clear account data and cleanup retry timers
    cleanupAccountStore();
    useAccountStore.getState().reset();
    console.log('[LogoutCleanup] Account store cleaned up');

    // Billing store - clear customer and subscription data
    useBillingStore.setState({
      customer: null,
      subscription: null,
      subscriptionLoading: false,
      initialized: false,
      error: null,
      creditBalance_cents: null,
      dailyUsage_cents: null,
      dailyLimit_cents: null,
      dailyResetAt: null,
    });
    console.log('[LogoutCleanup] Billing store cleaned up');

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
    'billing-storage',
    'id-mappings',
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
