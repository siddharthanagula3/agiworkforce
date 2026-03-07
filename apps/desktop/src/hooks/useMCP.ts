/**
 * useMCP Hook
 *
 * Comprehensive React hook for MCP (Model Context Protocol) server management.
 * Provides a clean interface for all MCP operations including:
 * - Server lifecycle management (list, start, stop, status)
 * - Tool discovery and execution
 * - Server installation and configuration
 * - Health monitoring and diagnostics
 *
 * This hook wraps the Tauri backend commands and provides proper error handling,
 * loading states, and reactive updates for MCP functionality.
 */
import { useCallback, useEffect, useState } from 'react';
import { invoke, listen } from '@/lib/tauri-mock';
import type {
  McpServerInfo,
  McpToolInfo,
  McpServersConfig,
  McpServerConfig,
  McpToolResult,
  McpServerStatus,
  McpEventPayload,
} from '@/types/mcp';

// Server health status from backend
interface ServerHealth {
  server_name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  last_check: string;
  latency_ms: number | null;
  error: string | null;
  consecutive_failures: number;
}

// Registry package from the MCP registry
interface RegistryPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  npmPackage?: string;
  github?: string;
  tools: string[];
  rating: number;
  downloads: number;
  installed: boolean;
}

// Installation progress event
interface InstallProgress {
  phase: 'downloading' | 'installing' | 'configuring' | 'completed' | 'failed';
  message: string;
  percentage: number;
  error?: string;
}

// Hook return type
interface UseMCPReturn {
  // Server management
  servers: McpServerInfo[];
  isLoading: boolean;
  error: string | null;

  // Server operations
  listServers: () => Promise<McpServerInfo[]>;
  startServer: (name: string) => Promise<void>;
  stopServer: (name: string) => Promise<void>;
  getServerStatus: (name: string) => Promise<McpServerInfo | undefined>;
  enableServer: (name: string) => Promise<void>;
  disableServer: (name: string) => Promise<void>;

  // Tool operations
  tools: McpToolInfo[];
  listTools: () => Promise<McpToolInfo[]>;
  listServerTools: (serverName: string) => Promise<McpToolInfo[]>;
  searchTools: (query: string) => Promise<McpToolInfo[]>;
  executeTool: (toolId: string, args: Record<string, unknown>) => Promise<unknown>;
  getToolSchemas: () => Promise<unknown[]>;

  // Server installation
  registry: RegistryPackage[];
  getRegistry: () => Promise<RegistryPackage[]>;
  installServer: (serverId: string, config?: Partial<McpServerConfig>) => Promise<void>;
  uninstallServer: (name: string) => Promise<void>;
  installProgress: InstallProgress | null;

  // Configuration
  config: McpServersConfig | null;
  getConfig: () => Promise<McpServersConfig>;
  updateConfig: (config: McpServersConfig) => Promise<void>;
  configureServer: (name: string, config: Partial<McpServerConfig>) => Promise<void>;

  // Credentials
  setCredential: (serverName: string, key: string, value: string) => Promise<void>;
  deleteCredential: (serverName: string, key: string) => Promise<void>;

  // Health monitoring
  serverHealth: Map<string, ServerHealth>;
  getHealth: () => Promise<ServerHealth[]>;
  checkServerHealth: (serverName: string) => Promise<ServerHealth>;

  // Server logs
  getServerLogs: (serverName: string, lines?: number) => Promise<string[]>;

  // Stats
  stats: Record<string, number>;
  getStats: () => Promise<Record<string, number>>;

  // Utilities
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Custom hook for MCP server management
 *
 * @example
 * ```tsx
 * function MCPDashboard() {
 *   const {
 *     servers,
 *     isLoading,
 *     startServer,
 *     stopServer,
 *     listTools
 *   } = useMCP();
 *
 *   useEffect(() => {
 *     // Tools are automatically loaded
 *   }, []);
 *
 *   return (
 *     <div>
 *       {servers.map(server => (
 *         <ServerCard
 *           key={server.name}
 *           server={server}
 *           onStart={() => startServer(server.name)}
 *           onStop={() => stopServer(server.name)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMCP(): UseMCPReturn {
  // State
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [registry, setRegistry] = useState<RegistryPackage[]>([]);
  const [config, setConfig] = useState<McpServersConfig | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [serverHealth, setServerHealth] = useState<Map<string, ServerHealth>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Helper to handle errors
  const handleError = useCallback((err: unknown, context: string): never => {
    const message = err instanceof Error ? err.message : String(err);
    // Translate MCP errors to user-friendly messages (per CLAUDE.md guidelines)
    const friendlyMessage = translateMcpError(message, context);
    setError(friendlyMessage);
    throw new Error(friendlyMessage);
  }, []);

  // Translate technical MCP errors to user-friendly messages
  const translateMcpError = (error: string, context: string): string => {
    // Hide MCP-specific terminology from users
    if (error.includes('ECONNREFUSED') || error.includes('connection refused')) {
      return `Could not connect to the ${context} service. Please check your internet connection and try again.`;
    }
    if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
      return `The ${context} operation took too long. Please try again.`;
    }
    if (error.includes('not found') || error.includes('NotFound')) {
      return `The requested ${context} could not be found.`;
    }
    if (error.includes('permission denied') || error.includes('EACCES')) {
      return `Permission denied while accessing ${context}. Please check your settings.`;
    }
    if (error.includes('MCP') || error.includes('mcp')) {
      // Remove MCP references for non-technical users
      return error
        .replace(/MCP\s*/gi, '')
        .replace(/mcp_/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return error;
  };

  // ============================================================================
  // Server Operations
  // ============================================================================

  const listServers = useCallback(async (): Promise<McpServerInfo[]> => {
    try {
      const result = await invoke<McpServerInfo[]>('mcp_list_servers');
      setServers(result);
      return result;
    } catch (err) {
      return handleError(err, 'server list');
    }
  }, [handleError]);

  const startServer = useCallback(
    async (name: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_connect_server', { name });
        await listServers();
      } catch (err) {
        handleError(err, `starting "${name}"`);
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers],
  );

  const stopServer = useCallback(
    async (name: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_disconnect_server', { name });
        await listServers();
      } catch (err) {
        handleError(err, `stopping "${name}"`);
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers],
  );

  const getServerStatus = useCallback(
    async (name: string): Promise<McpServerInfo | undefined> => {
      const serverList = await listServers();
      return serverList.find((s) => s.name === name);
    },
    [listServers],
  );

  const enableServer = useCallback(
    async (name: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_enable_server', { name });
        await listServers();
      } catch (err) {
        handleError(err, `enabling "${name}"`);
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers],
  );

  const disableServer = useCallback(
    async (name: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_disable_server', { name });
        await listServers();
      } catch (err) {
        handleError(err, `disabling "${name}"`);
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers],
  );

  // ============================================================================
  // Tool Operations
  // ============================================================================

  const listTools = useCallback(async (): Promise<McpToolInfo[]> => {
    try {
      const result = await invoke<McpToolInfo[]>('mcp_list_tools');
      setTools(result);
      return result;
    } catch (err) {
      return handleError(err, 'tool list');
    }
  }, [handleError]);

  const listServerTools = useCallback(
    async (serverName: string): Promise<McpToolInfo[]> => {
      const allTools = await listTools();
      return allTools.filter((tool) => tool.server === serverName);
    },
    [listTools],
  );

  const searchTools = useCallback(
    async (query: string): Promise<McpToolInfo[]> => {
      try {
        const result = await invoke<McpToolInfo[]>('mcp_search_tools', { query });
        setTools(result);
        return result;
      } catch (err) {
        return handleError(err, 'tool search');
      }
    },
    [handleError],
  );

  const executeTool = useCallback(
    async (toolId: string, args: Record<string, unknown>): Promise<unknown> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<unknown>('mcp_call_tool', {
          tool_id: toolId,
          arguments: args,
        });
        return result;
      } catch (err) {
        return handleError(err, 'tool execution');
      } finally {
        setIsLoading(false);
      }
    },
    [handleError],
  );

  const getToolSchemas = useCallback(async (): Promise<unknown[]> => {
    try {
      return await invoke<unknown[]>('mcp_get_tool_schemas');
    } catch (err) {
      return handleError(err, 'tool schemas');
    }
  }, [handleError]);

  // ============================================================================
  // Configuration (must be before Registry & Installation due to dependencies)
  // ============================================================================

  const getConfig = useCallback(async (): Promise<McpServersConfig> => {
    try {
      const result = await invoke<McpServersConfig>('mcp_get_config');
      setConfig(result);
      return result;
    } catch (err) {
      return handleError(err, 'configuration');
    }
  }, [handleError]);

  const updateConfig = useCallback(
    async (newConfig: McpServersConfig): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_update_config', { newConfig });
        setConfig(newConfig);
        await listServers();
      } catch (err) {
        handleError(err, 'updating configuration');
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers],
  );

  // ============================================================================
  // Registry & Installation
  // ============================================================================

  const getRegistry = useCallback(async (): Promise<RegistryPackage[]> => {
    try {
      const result = await invoke<RegistryPackage[]>('mcp_get_registry');
      setRegistry(result);
      return result;
    } catch (err) {
      return handleError(err, 'tool registry');
    }
  }, [handleError]);

  const installServer = useCallback(
    async (serverId: string, serverConfig?: Partial<McpServerConfig>): Promise<void> => {
      setIsLoading(true);
      setError(null);
      setInstallProgress({
        phase: 'downloading',
        message: 'Downloading server package...',
        percentage: 10,
      });

      try {
        // Get the registry package info
        const registryPackages = registry.length > 0 ? registry : await getRegistry();
        const pkg = registryPackages.find((p) => p.id === serverId);

        if (!pkg) {
          throw new Error(`Server "${serverId}" not found in registry`);
        }

        setInstallProgress({
          phase: 'installing',
          message: `Installing ${pkg.name}...`,
          percentage: 40,
        });

        // Create the server configuration
        const newConfig: McpServerConfig = {
          command: serverConfig?.command || 'npx',
          args: serverConfig?.args || [
            '-y',
            pkg.npmPackage || `@modelcontextprotocol/server-${serverId}`,
          ],
          env: serverConfig?.env || {},
          enabled: serverConfig?.enabled ?? true,
        };

        // Get current config and add the new server
        const currentConfig = await getConfig();
        const updatedConfig: McpServersConfig = {
          mcpServers: {
            ...currentConfig.mcpServers,
            [serverId.replace('mcp-', '')]: newConfig,
          },
        };

        setInstallProgress({
          phase: 'configuring',
          message: 'Configuring server...',
          percentage: 70,
        });

        // Save the updated config
        await updateConfig(updatedConfig);

        setInstallProgress({
          phase: 'completed',
          message: `${pkg.name} installed successfully!`,
          percentage: 100,
        });

        // Refresh server list
        await listServers();
        await getRegistry();

        // Clear progress after a short delay
        setTimeout(() => setInstallProgress(null), 2000);
      } catch (err) {
        setInstallProgress({
          phase: 'failed',
          message: 'Installation failed',
          percentage: 0,
          error: err instanceof Error ? err.message : String(err),
        });
        handleError(err, 'server installation');
      } finally {
        setIsLoading(false);
      }
    },
    [registry, getRegistry, handleError, listServers, getConfig, updateConfig],
  );

  const uninstallServer = useCallback(
    async (name: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        // Stop the server first if running
        await stopServer(name).catch(() => {
          // Ignore errors if server is not running
        });

        // Get current config and remove the server
        const currentConfig = await getConfig();
        const { [name]: _removed, ...remainingServers } = currentConfig.mcpServers;
        const updatedConfig: McpServersConfig = {
          mcpServers: remainingServers,
        };

        // Save the updated config
        await updateConfig(updatedConfig);

        // Refresh server list
        await listServers();
        await getRegistry();
      } catch (err) {
        handleError(err, `uninstalling "${name}"`);
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, listServers, stopServer, getRegistry, getConfig, updateConfig],
  );

  const configureServer = useCallback(
    async (name: string, serverConfig: Partial<McpServerConfig>): Promise<void> => {
      const currentConfig = await getConfig();
      const existingServer = currentConfig.mcpServers[name];

      if (!existingServer) {
        throw new Error(`Server "${name}" not found`);
      }

      const updatedConfig: McpServersConfig = {
        mcpServers: {
          ...currentConfig.mcpServers,
          [name]: {
            ...existingServer,
            ...serverConfig,
          },
        },
      };

      await updateConfig(updatedConfig);
    },
    [getConfig, updateConfig],
  );

  // ============================================================================
  // Credentials
  // ============================================================================

  const setCredential = useCallback(
    async (serverName: string, key: string, value: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_set_credential', {
          server_name: serverName,
          key,
          value,
        });
      } catch (err) {
        handleError(err, 'storing credential');
      } finally {
        setIsLoading(false);
      }
    },
    [handleError],
  );

  const deleteCredential = useCallback(
    async (serverName: string, key: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<string>('mcp_delete_credential', {
          server_name: serverName,
          key,
        });
      } catch (err) {
        handleError(err, 'deleting credential');
      } finally {
        setIsLoading(false);
      }
    },
    [handleError],
  );

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  const getHealth = useCallback(async (): Promise<ServerHealth[]> => {
    try {
      const result = await invoke<ServerHealth[]>('mcp_get_health');
      const healthMap = new Map<string, ServerHealth>();
      result.forEach((h) => healthMap.set(h.server_name, h));
      setServerHealth(healthMap);
      return result;
    } catch (err) {
      return handleError(err, 'health status');
    }
  }, [handleError]);

  const checkServerHealth = useCallback(
    async (serverName: string): Promise<ServerHealth> => {
      try {
        const result = await invoke<ServerHealth>('mcp_check_server_health', {
          server_name: serverName,
        });
        setServerHealth((prev) => new Map(prev).set(serverName, result));
        return result;
      } catch (err) {
        return handleError(err, `checking health of "${serverName}"`);
      }
    },
    [handleError],
  );

  // ============================================================================
  // Logs
  // ============================================================================

  const getServerLogs = useCallback(
    async (serverName: string, lines?: number): Promise<string[]> => {
      try {
        return await invoke<string[]>('mcp_get_server_logs', {
          serverName,
          lines: lines ?? 100,
        });
      } catch (err) {
        return handleError(err, 'server logs');
      }
    },
    [handleError],
  );

  // ============================================================================
  // Stats
  // ============================================================================

  const getStats = useCallback(async (): Promise<Record<string, number>> => {
    try {
      const result = await invoke<Record<string, number>>('mcp_get_stats');
      setStats(result);
      return result;
    } catch (err) {
      return handleError(err, 'statistics');
    }
  }, [handleError]);

  // ============================================================================
  // Initialization & Refresh
  // ============================================================================

  const initialize = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke<string>('mcp_initialize');
      await Promise.all([listServers(), listTools(), getStats(), getConfig(), getRegistry()]);
    } catch (err) {
      // Don't throw on initialization - just log the error
      const message = err instanceof Error ? err.message : String(err);
      setError(translateMcpError(message, 'initialization'));
      console.error('MCP initialization failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [listServers, listTools, getStats, getConfig, getRegistry]);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([listServers(), listTools(), getStats()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(translateMcpError(message, 'refresh'));
    } finally {
      setIsLoading(false);
    }
  }, [listServers, listTools, getStats]);

  // ============================================================================
  // Event Listeners
  // ============================================================================

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    // Listen for MCP connection changes
    unlisteners.push(
      listen<McpEventPayload>('mcp:connection_changed', (event) => {
        if (event.payload.type === 'server_connection_changed') {
          // Refresh server list on connection changes
          void listServers();
        }
      }),
    );

    // Listen for tool updates
    unlisteners.push(
      listen<McpEventPayload>('mcp:tools_updated', () => {
        void listTools();
        void getStats();
      }),
    );

    // Listen for system initialized
    unlisteners.push(
      listen<McpEventPayload>('mcp:system_initialized', () => {
        void listServers();
        void listTools();
        void getStats();
      }),
    );

    return () => {
      unlisteners.forEach((promise) => {
        promise.then((unlisten) => unlisten()).catch(console.error);
      });
    };
  }, [listServers, listTools, getStats]);

  return {
    // Server state
    servers,
    isLoading,
    error,

    // Server operations
    listServers,
    startServer,
    stopServer,
    getServerStatus,
    enableServer,
    disableServer,

    // Tool operations
    tools,
    listTools,
    listServerTools,
    searchTools,
    executeTool,
    getToolSchemas,

    // Registry & Installation
    registry,
    getRegistry,
    installServer,
    uninstallServer,
    installProgress,

    // Configuration
    config,
    getConfig,
    updateConfig,
    configureServer,

    // Credentials
    setCredential,
    deleteCredential,

    // Health
    serverHealth,
    getHealth,
    checkServerHealth,

    // Logs
    getServerLogs,

    // Stats
    stats,
    getStats,

    // Utilities
    initialize,
    refresh,
    clearError,
  };
}

export default useMCP;

// Re-export types for convenience
export type {
  McpServerInfo,
  McpToolInfo,
  McpServersConfig,
  McpServerConfig,
  McpToolResult,
  McpServerStatus,
  ServerHealth,
  RegistryPackage,
  InstallProgress,
  UseMCPReturn,
};
