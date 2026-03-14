import { McpClient } from '@/api/mcp';
import { create } from 'zustand';
import type { McpRuntimeServerConfig } from '@/types/mcp';

interface McpServerStore {
  config: McpRuntimeServerConfig | null;
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  updateConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
}

export const useMcpServerStore = create<McpServerStore>((set, get) => ({
  config: null,
  loading: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await McpClient.getRuntimeServerConfig();
      set({ config, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false });
    }
  },

  startServer: async () => {
    set({ loading: true, error: null });
    try {
      await McpClient.startRuntimeServer();
      await get().fetchConfig();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  stopServer: async () => {
    set({ loading: true, error: null });
    try {
      await McpClient.stopRuntimeServer();
      await get().fetchConfig();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  updateConfig: async (port?: number, enabledTools?: string[]) => {
    set({ loading: true, error: null });
    try {
      await McpClient.updateRuntimeServerConfig(port, enabledTools);
      await get().fetchConfig();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },
}));
