import { McpClient } from '@/api/mcp';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { McpRuntimeServerConfig } from '@/types/mcp';

interface McpServerToolEntry {
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface McpServerStore {
  config: McpRuntimeServerConfig | null;
  isRunning: boolean;
  tools: McpServerToolEntry[];
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchTools: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  updateConfig: (port?: number, enabledTools?: string[]) => Promise<void>;
}

export const useMcpServerStore = create<McpServerStore>()(
  devtools(
    (set, get) => ({
      config: null,
      isRunning: false,
      tools: [],
      loading: false,
      error: null,

      fetchConfig: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/fetchConfig/start');
        try {
          const config = await McpClient.getRuntimeServerConfig();
          set(
            { config, isRunning: config.running, error: null, loading: false },
            undefined,
            'mcpServer/fetchConfig/success',
          );
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/fetchConfig/error',
          );
        }
      },

      fetchStatus: async () => {
        try {
          const isRunning = await McpClient.getRuntimeServerStatus();
          set({ isRunning, error: null }, undefined, 'mcpServer/fetchStatus');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            undefined,
            'mcpServer/fetchStatus/error',
          );
        }
      },

      fetchTools: async () => {
        try {
          const result = await McpClient.listRuntimeServerTools();
          const tools = (result.tools ?? []) as McpServerToolEntry[];
          set({ tools, error: null }, undefined, 'mcpServer/fetchTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            undefined,
            'mcpServer/fetchTools/error',
          );
        }
      },

      startServer: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/start/start');
        try {
          await McpClient.startRuntimeServer();
          await get().fetchConfig();
          await get().fetchTools();
          set({ loading: false }, undefined, 'mcpServer/start/success');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/start/error',
          );
        }
      },

      stopServer: async () => {
        set({ loading: true, error: null }, undefined, 'mcpServer/stop/start');
        try {
          await McpClient.stopRuntimeServer();
          await get().fetchConfig();
          set({ tools: [] }, undefined, 'mcpServer/stop/clearTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/stop/error',
          );
        }
      },

      updateConfig: async (port?: number, enabledTools?: string[]) => {
        set({ loading: true, error: null }, undefined, 'mcpServer/updateConfig/start');
        try {
          await McpClient.updateRuntimeServerConfig(port, enabledTools);
          await get().fetchConfig();
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            undefined,
            'mcpServer/updateConfig/error',
          );
        }
      },
    }),
    { name: 'McpServerStore', enabled: import.meta.env.DEV },
  ),
);
