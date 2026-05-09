// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * MCP App Store
 *
 * Manages interactive MCP app instances rendered as sandboxed iframes in chat.
 * MCP tools can return HTML/URL payloads that render as mini-apps.
 *
 * Security: All content is rendered in sandboxed iframes with no allow-same-origin.
 * Follows Zustand v5 patterns consistent with mcpStore.ts.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpAppContent {
  /** Rendering mode */
  type: 'html' | 'url';
  /** HTML string (for html type) or external URL (for url type) */
  payload: string;
  /** Suggested initial height in px. Defaults to 300. */
  height?: number;
  /** Allowed postMessage origins. Empty = block all cross-origin messages. */
  allowedOrigins?: string[];
}

export interface McpInteraction {
  timestamp: number;
  type: 'user_action' | 'data_update';
  data: Record<string, unknown>;
}

export interface McpApp {
  id: string;
  /** Tool name that produced this app, e.g. "weather_widget" */
  toolName: string;
  /** Which MCP server provided this app */
  mcpServer: string;
  content: McpAppContent;
  timestamp: number;
  interactionLog: McpInteraction[];
}

interface McpAppState {
  /** Keyed by app id */
  apps: Record<string, McpApp>;

  /** Register a new MCP app and return its generated id */
  registerApp: (toolName: string, mcpServer: string, content: McpAppContent) => string;

  /** Update content of an existing app */
  updateApp: (id: string, content: Partial<McpAppContent>) => void;

  /** Append an interaction log entry */
  recordInteraction: (id: string, interaction: McpInteraction) => void;

  /** Remove an app from the registry */
  removeApp: (id: string) => void;

  /** Remove all apps */
  clearAll: () => void;

  /** Get all apps as a sorted array (newest first) */
  getAppsArray: () => McpApp[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMcpAppStore = create<McpAppState>()(
  devtools(
    (set, get) => ({
      apps: {},

      registerApp: (toolName, mcpServer, content) => {
        const id = `mcp-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const app: McpApp = {
          id,
          toolName,
          mcpServer,
          content,
          timestamp: Date.now(),
          interactionLog: [],
        };
        set((state) => ({ apps: { ...state.apps, [id]: app } }), undefined, 'mcpApp/registerApp');
        return id;
      },

      updateApp: (id, contentUpdate) => {
        set(
          (state) => {
            const existing = state.apps[id];
            if (!existing) return state;
            return {
              apps: {
                ...state.apps,
                [id]: {
                  ...existing,
                  content: { ...existing.content, ...contentUpdate },
                },
              },
            };
          },
          undefined,
          'mcpApp/updateApp',
        );
      },

      recordInteraction: (id, interaction) => {
        set(
          (state) => {
            const existing = state.apps[id];
            if (!existing) return state;
            return {
              apps: {
                ...state.apps,
                [id]: {
                  ...existing,
                  interactionLog: [...existing.interactionLog, interaction],
                },
              },
            };
          },
          undefined,
          'mcpApp/recordInteraction',
        );
      },

      removeApp: (id) => {
        set(
          (state) => {
            const next = { ...state.apps };
            delete next[id];
            return { apps: next };
          },
          undefined,
          'mcpApp/removeApp',
        );
      },

      clearAll: () => {
        set({ apps: {} }, undefined, 'mcpApp/clearAll');
      },

      getAppsArray: () => {
        return Object.values(get().apps).sort((a, b) => b.timestamp - a.timestamp);
      },
    }),
    { name: 'McpAppStore', enabled: import.meta.env.DEV },
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectMcpApps = (state: McpAppState) => state.apps;
export const selectMcpAppCount = (state: McpAppState) => Object.keys(state.apps).length;
export const selectMcpAppById = (id: string) => (state: McpAppState) => state.apps[id];
export const selectMcpAppsByServer = (server: string) => (state: McpAppState) =>
  Object.values(state.apps).filter((app) => app.mcpServer === server);
