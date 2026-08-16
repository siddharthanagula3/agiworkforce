
import { useShallow } from 'zustand/react/shallow';
import {
  useExtensionEventsStore,
  type ExtensionAgentStatus,
  type ExtensionEventState,
} from '../stores/extensionEventsStore';

export type { ExtensionAgentStatus, ExtensionEventState };

export interface UseExtensionEventsReturn extends ExtensionEventState {
  stopAgent: () => Promise<void>;
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
