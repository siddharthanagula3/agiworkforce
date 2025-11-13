/**
 * MCP (Model Context Protocol) Components
 *
 * This module provides UI components for managing MCP servers and tools:
 * - MCPServerManager: Manage installed MCP servers (start/stop/configure)
 * - MCPServerBrowser: Discover and install new MCP servers from registry
 * - MCPToolExplorer: Browse and test available tools from all servers
 * - MCPConnectionStatus: Monitor real-time connection health and metrics
 */

export { MCPServerManager } from './MCPServerManager';
export { MCPServerBrowser } from './MCPServerBrowser';
export { MCPToolExplorer } from './MCPToolExplorer';
export { MCPConnectionStatus } from './MCPConnectionStatus';

// Default export for convenience
export { MCPServerManager as default } from './MCPServerManager';
