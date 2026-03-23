import { create } from 'zustand';
import { invoke, isTauri, listen } from '../lib/tauri-mock';
import { EVENTS } from '../constants/event-names';
import type {
  ExtensionPageContextEvent,
  ExtensionTaskResultEvent,
} from '../hooks/useAgenticEvents';

export type ExtensionAgentStatus = 'idle' | 'planning' | 'executing' | 'done' | 'error';

export interface ExtensionEventState {
  currentPageUrl: string | null;
  currentPageTitle: string | null;
  lastAction: string | null;
  agentStatus: ExtensionAgentStatus;
  hasError: boolean;
  lastError: string | null;
  lastTaskActionsPerformed: number;
  extensionConnected: boolean;
}

interface ExtensionEventsStore extends ExtensionEventState {
  applyPageContext: (payload: ExtensionPageContextEvent) => void;
  applyTaskResult: (payload: ExtensionTaskResultEvent) => void;
  applyConnectionStatus: (connected: boolean) => void;
  stopAgent: () => Promise<void>;
  resetState: () => void;
}

const INITIAL_STATE: ExtensionEventState = {
  currentPageUrl: null,
  currentPageTitle: null,
  lastAction: null,
  agentStatus: 'idle',
  hasError: false,
  lastError: null,
  lastTaskActionsPerformed: 0,
  extensionConnected: false,
};

export const useExtensionEventsStore = create<ExtensionEventsStore>((set) => ({
  ...INITIAL_STATE,

  applyPageContext: (payload) => {
    const actionSummary =
      payload.actions && payload.actions.length > 0
        ? `Planning ${payload.actions.length} action${payload.actions.length === 1 ? '' : 's'}`
        : 'Analysing page…';

    set((state) => ({
      ...state,
      currentPageUrl: payload.url,
      currentPageTitle: payload.title,
      lastAction: actionSummary,
      agentStatus: 'planning',
      hasError: false,
      lastError: null,
      extensionConnected: true,
    }));
  },

  applyTaskResult: (payload) => {
    const actionsPerformed = payload.actions_performed ?? 0;
    const durationText =
      payload.duration != null ? `${(payload.duration / 1000).toFixed(1)}s` : 'unknown time';
    const actionSummary = payload.success
      ? `Completed — ${actionsPerformed} action${actionsPerformed === 1 ? '' : 's'} in ${durationText}`
      : `Failed: ${payload.error ?? 'Unknown error'}`;

    set((state) => ({
      ...state,
      lastAction: actionSummary,
      agentStatus: payload.success ? 'done' : 'error',
      hasError: !payload.success,
      lastError: payload.success ? null : (payload.error ?? null),
      lastTaskActionsPerformed: actionsPerformed,
      extensionConnected: true,
    }));
  },

  applyConnectionStatus: (connected) => {
    set((state) => ({
      ...state,
      extensionConnected: connected,
      agentStatus: connected ? state.agentStatus : 'idle',
    }));
  },

  stopAgent: async () => {
    if (!isTauri) return;
    try {
      await invoke('agent_stop');
      set((state) => ({
        ...state,
        agentStatus: 'idle',
        lastAction: 'Stopped by user',
      }));
    } catch (error) {
      console.warn('[extensionEventsStore] agent_stop failed:', error);
    }
  },

  resetState: () => {
    set(INITIAL_STATE);
  },
}));

let extensionEventListenersPromise: Promise<void> | null = null;
const extensionEventUnlistenFns: Array<() => void> = [];

export function cleanupExtensionEventListeners(): void {
  for (const unlisten of extensionEventUnlistenFns.splice(0)) {
    try {
      unlisten();
    } catch (error) {
      console.error('[extensionEventsStore] Failed to cleanup extension listener:', error);
    }
  }

  extensionEventListenersPromise = null;
}

export async function initializeExtensionEventListeners(): Promise<void> {
  if (extensionEventListenersPromise) {
    return extensionEventListenersPromise;
  }

  if (!isTauri) {
    return;
  }

  extensionEventListenersPromise = (async () => {
    try {
      const unlistenPageContext = await listen<ExtensionPageContextEvent>(
        EVENTS.EXTENSION_PAGE_CONTEXT,
        ({ payload }) => {
          useExtensionEventsStore.getState().applyPageContext(payload);
        },
      );

      const unlistenTaskResult = await listen<ExtensionTaskResultEvent>(
        EVENTS.EXTENSION_TASK_RESULT,
        ({ payload }) => {
          useExtensionEventsStore.getState().applyTaskResult(payload);
        },
      );

      const unlistenConnectionStatus = await listen<{ connected: boolean }>(
        'extension:connection-status',
        ({ payload }) => {
          useExtensionEventsStore.getState().applyConnectionStatus(payload.connected);
        },
      );

      extensionEventUnlistenFns.push(
        unlistenPageContext,
        unlistenTaskResult,
        unlistenConnectionStatus,
      );
    } catch (error) {
      cleanupExtensionEventListeners();
      console.warn('[extensionEventsStore] Failed to initialize extension listeners:', error);
    }
  })();

  return extensionEventListenersPromise;
}
