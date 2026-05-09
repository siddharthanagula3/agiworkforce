// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import type { BrowserActivityState, BrowserAgentStatus } from '@agiworkforce/types';
import { invoke, isTauri } from '../lib/tauri-mock';

export interface ExtensionPageAction {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export interface ExtensionPageContextEvent {
  task_id: string;
  url: string;
  title: string;
  tab_id: number;
  timestamp: number;
  selected_text?: string | null;
  actions?: ExtensionPageAction[];
}

export interface ExtensionTaskResultEvent {
  task_id: string;
  success: boolean;
  screenshot_path?: string | null;
  result?: unknown;
  error?: string | null;
  actions_performed?: number;
  duration?: number;
}

export interface ExtensionConnectionStatusEvent {
  connected: boolean;
  status?: string;
  extension_id?: string;
  reason?: string;
  timestamp?: number;
}

export type ExtensionAgentStatus = BrowserAgentStatus;
export type ExtensionEventState = BrowserActivityState;

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
