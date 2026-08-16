// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)

import { create } from 'zustand';
import { invoke } from '../lib/tauri-mock';

export interface CustomAgentConfig {
  name: string;
  model?: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  scope: 'global' | 'project';
}

interface CustomAgentsState {
  agents: CustomAgentConfig[];
  isLoading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  saveAgent: (config: CustomAgentConfig) => Promise<void>;
  deleteAgent: (name: string, scope: string) => Promise<void>;
}

export const useCustomAgentsStore = create<CustomAgentsState>()((set) => ({
  agents: [],
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const agents = await invoke<CustomAgentConfig[]>('list_custom_agents');
      set({ agents: agents ?? [], isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
    }
  },

  saveAgent: async (config: CustomAgentConfig) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('save_custom_agent', { config });
      const agents = await invoke<CustomAgentConfig[]>('list_custom_agents');
      set({ agents: agents ?? [], isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteAgent: async (name: string, scope: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke('delete_custom_agent', { name, scope });
      const agents = await invoke<CustomAgentConfig[]>('list_custom_agents');
      set({ agents: agents ?? [], isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
      throw err;
    }
  },
}));
