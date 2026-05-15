import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '../../api/mcp';
import type { McpServerHealth } from '../../types/mcp';

export interface McpHealthState {
  health: McpServerHealth[];
  stats: Record<string, number>;
  error: string | null;

  refreshHealth: () => Promise<void>;
  checkServerHealth: (name: string) => Promise<void>;
  upsertServerHealth: (health: McpServerHealth) => void;
  refreshStats: () => Promise<void>;
  clearError: () => void;
}

export const useMcpHealthStore = create<McpHealthState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      health: [],
      stats: {},
      error: null,

      refreshHealth: async () => {
        if (!isTauri) return;
        try {
          const health = await McpClient.getHealth();
          set({ health, error: null }, undefined, 'mcpHealth/refreshHealth');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get MCP health' },
            undefined,
            'mcpHealth/refreshHealth/error',
          );
        }
      },

      checkServerHealth: async (name: string) => {
        if (!isTauri) return;
        try {
          const health = await McpClient.checkServerHealth(name);
          get().upsertServerHealth(health);
          set({ error: null }, undefined, 'mcpHealth/checkServerHealth');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to check health for ${name}`,
            },
            undefined,
            'mcpHealth/checkServerHealth/error',
          );
        }
      },

      upsertServerHealth: (health: McpServerHealth) => {
        set(
          (state) => {
            const existingIndex = state.health.findIndex(
              (entry) => entry.server_name === health.server_name,
            );
            if (existingIndex === -1) {
              return { health: [...state.health, health] };
            }
            const nextHealth = [...state.health];
            nextHealth[existingIndex] = { ...nextHealth[existingIndex], ...health };
            return { health: nextHealth };
          },
          undefined,
          'mcpHealth/upsertServerHealth',
        );
      },

      refreshStats: async () => {
        if (!isTauri) return;
        try {
          const stats = await McpClient.getStats();
          set({ stats, error: null }, undefined, 'mcpHealth/refreshStats');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get stats' },
            undefined,
            'mcpHealth/refreshStats/error',
          );
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'mcpHealth/clearError');
      },
    })),
    { name: 'McpHealthStore', enabled: import.meta.env.DEV },
  ),
);

export const selectMcpHealth = (state: McpHealthState) => state.health;
export const selectMcpStats = (state: McpHealthState) => state.stats;
export const selectMcpHealthError = (state: McpHealthState) => state.error;
