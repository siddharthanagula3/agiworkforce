/**
 * useExtensionEvents.ts
 *
 * Shared browser extension event hook backed by a singleton store.
 * Multiple mounted surfaces read the same extension state without
 * registering duplicate Tauri listeners or auto-opening sidecars.
 */

import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  initializeExtensionEventListeners,
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

  useEffect(() => {
    void initializeExtensionEventListeners();
  }, []);

  return state;
}
