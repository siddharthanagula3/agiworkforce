/**
 * @file React Hook for MCP Tools
 *
 * Provides discovery and invocation of MCP tools via the API gateway proxy.
 * Used by the web chat interface to make MCP tools available during conversations.
 *
 * Usage:
 * ```tsx
 * const { servers, tools, callTool, isLoading, error } = useMcpTools();
 *
 * // List tools from all servers
 * useEffect(() => { refreshTools(); }, []);
 *
 * // Call a tool
 * const result = await callTool('filesystem', 'read_file', { path: '/tmp/test.txt' });
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMcpClient,
  type McpServer,
  type McpTool,
  type McpToolCallResponse,
  McpClientError,
} from '@/lib/mcp-client';

// =============================================================================
// TYPES
// =============================================================================

export interface McpToolEntry {
  serverId: string;
  serverName: string;
  tool: McpTool;
}

export interface UseMcpToolsReturn {
  /** List of available MCP servers */
  servers: McpServer[];
  /** Flat list of all tools across all connected servers */
  tools: McpToolEntry[];
  /** Whether the hook is loading data */
  isLoading: boolean;
  /** Last error that occurred */
  error: string | null;
  /** Refresh the list of servers and tools */
  refreshTools: () => Promise<void>;
  /** Call a specific tool */
  callTool: (
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<McpToolCallResponse>;
  /** Whether the MCP proxy is available (at least one server connected) */
  isAvailable: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for discovering and calling MCP tools via the API gateway proxy.
 *
 * @param getToken - Function that returns the current JWT auth token.
 *                   If not provided, the hook will be in a disabled state.
 */
export function useMcpTools(getToken?: () => string | null): UseMcpToolsReturn {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpToolEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the token getter so it doesn't trigger re-fetches
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Memoized client getter
  const getClient = useCallback(() => {
    const tokenFn = getTokenRef.current;
    if (!tokenFn) return null;
    return getMcpClient(tokenFn);
  }, []);

  /**
   * Fetch servers and all their tools.
   */
  const refreshTools = useCallback(async () => {
    const client = getClient();
    if (!client) {
      setError('No auth token available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch servers first
      const serverList = await client.listServers();
      setServers(serverList);

      // Then fetch all tools across connected servers
      const allTools = await client.listAllTools();
      setTools(allTools);
    } catch (err) {
      if (err instanceof McpClientError) {
        // Don't treat 503 (proxy not initialized) as an error in the UI
        if (err.status === 503) {
          setError(null);
          setServers([]);
          setTools([]);
          return;
        }
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch MCP tools');
      }
    } finally {
      setIsLoading(false);
    }
  }, [getClient]);

  /**
   * Call a tool and return the result.
   */
  const callTool = useCallback(
    async (
      serverId: string,
      toolName: string,
      args: Record<string, unknown> = {},
    ): Promise<McpToolCallResponse> => {
      const client = getClient();
      if (!client) {
        throw new McpClientError('No auth token available', 401, 'NO_TOKEN');
      }

      return client.callTool(serverId, toolName, args);
    },
    [getClient],
  );

  // Auto-fetch on mount if token is available
  useEffect(() => {
    if (getTokenRef.current) {
      refreshTools();
    }
  }, [refreshTools]);

  const isAvailable = servers.some((s) => s.connected);

  return {
    servers,
    tools,
    isLoading,
    error,
    refreshTools,
    callTool,
    isAvailable,
  };
}
