/**
 * Shared browser extension state hook backed by a singleton store.
 * Listener initialization is owned by app startup, not component mounts.
 */

import { useShallow } from 'zustand/react/shallow';
import {
  useExtensionEventsStore,
  type ExtensionAgentStatus,
  type ExtensionEventState,
} from '../stores/extensionEventsStore';

// ─── Public state shape ────────────────────────────────────────────────────────

export type { ExtensionAgentStatus, ExtensionEventState };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseExtensionEventsReturn extends ExtensionEventState {
  /** Invoke agi-workforce.stopAgent Tauri command */
  stopAgent: () => Promise<void>;
  /** Reset state back to idle (e.g. after user dismisses error) */
  resetState: () => void;
}

export function useExtensionEvents(): UseExtensionEventsReturn {
  const state = useExtensionEventsStore(
    useShallow((store) => ({
      currentPageUrl: store.currentPageUrl,
      currentPageTitle: store.currentPageTitle,
      lastAction: store.lastAction,
      agentStatus: store.agentStatus,
      hasError: store.hasError,
      lastError: store.lastError,
      lastTaskActionsPerformed: store.lastTaskActionsPerformed,
      extensionConnected: store.extensionConnected,
      stopAgent: store.stopAgent,
      resetState: store.resetState,
    })),
  );

  return state;
}
