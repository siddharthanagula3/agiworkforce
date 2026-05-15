import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { isTauri } from '../../lib/tauri-mock';
import { McpClient } from '../../api/mcp';
import type { McpExecutionHistoryEntry, McpToolExecutionStats, McpToolInfo } from '../../types/mcp';

export interface McpToolsState {
  tools: McpToolInfo[];
  toolSchemas: unknown[];
  executionHistory: McpExecutionHistoryEntry[];
  toolExecutionStats: McpToolExecutionStats[];
  searchQuery: string;
  error: string | null;

  refreshTools: () => Promise<void>;
  refreshToolSchemas: () => Promise<void>;
  searchTools: (query: string) => Promise<void>;
  callTool: (toolId: string, args: Record<string, unknown>) => Promise<unknown>;
  refreshExecutionHistory: (limit?: number) => Promise<void>;
  refreshToolExecutionStats: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useMcpToolsStore = create<McpToolsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      tools: [],
      toolSchemas: [],
      executionHistory: [],
      toolExecutionStats: [],
      searchQuery: '',
      error: null,

      refreshTools: async () => {
        if (!isTauri) return;
        try {
          const tools = await McpClient.listTools();
          set({ tools, error: null }, undefined, 'mcpTools/refreshTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to list tools' },
            undefined,
            'mcpTools/refreshTools/error',
          );
        }
      },

      refreshToolSchemas: async () => {
        if (!isTauri) return;
        try {
          const toolSchemas = await McpClient.getToolSchemas();
          set({ toolSchemas, error: null }, undefined, 'mcpTools/refreshToolSchemas');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to get tool schemas' },
            undefined,
            'mcpTools/refreshToolSchemas/error',
          );
        }
      },

      searchTools: async (query: string) => {
        if (!isTauri) return;
        set({ searchQuery: query }, undefined, 'mcpTools/searchTools/start');
        if (!query.trim()) {
          await get().refreshTools();
          return;
        }
        try {
          const tools = await McpClient.searchTools(query);
          set({ tools, error: null }, undefined, 'mcpTools/searchTools');
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : 'Failed to search tools' },
            undefined,
            'mcpTools/searchTools/error',
          );
        }
      },

      callTool: async (toolId: string, args: Record<string, unknown>) => {
        if (!isTauri) return undefined;
        try {
          return await McpClient.callTool(toolId, args);
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : `Failed to call tool '${toolId}'`,
            },
            undefined,
            'mcpTools/callTool/error',
          );
          throw error;
        }
      },

      refreshExecutionHistory: async (limit = 20) => {
        if (!isTauri) return;
        try {
          const executionHistory = await McpClient.getExecutionHistory(limit);
          set({ executionHistory, error: null }, undefined, 'mcpTools/refreshExecutionHistory');
        } catch (error) {
          set(
            {
              error: error instanceof Error ? error.message : 'Failed to get MCP execution history',
            },
            undefined,
            'mcpTools/refreshExecutionHistory/error',
          );
        }
      },

      refreshToolExecutionStats: async () => {
        if (!isTauri) return;
        try {
          const toolExecutionStats = await McpClient.getToolExecutionStats();
          set({ toolExecutionStats, error: null }, undefined, 'mcpTools/refreshToolExecutionStats');
        } catch (error) {
          set(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to get MCP tool execution statistics',
            },
            undefined,
            'mcpTools/refreshToolExecutionStats/error',
          );
        }
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query }, undefined, 'mcpTools/setSearchQuery');
      },

      clearError: () => {
        set({ error: null }, undefined, 'mcpTools/clearError');
      },
    })),
    { name: 'McpToolsStore', enabled: import.meta.env.DEV },
  ),
);

export const selectMcpTools = (state: McpToolsState) => state.tools;
export const selectMcpToolSchemas = (state: McpToolsState) => state.toolSchemas;
export const selectMcpExecutionHistory = (state: McpToolsState) => state.executionHistory;
export const selectMcpToolExecutionStats = (state: McpToolsState) => state.toolExecutionStats;
export const selectMcpSearchQuery = (state: McpToolsState) => state.searchQuery;
export const selectToolCount = (state: McpToolsState) => state.tools.length;
export const selectToolsByServer = (serverName: string) => (state: McpToolsState) =>
  state.tools.filter((tool) => tool.server === serverName);
