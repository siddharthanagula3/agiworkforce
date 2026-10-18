/**
 * @agiworkforce/mcp
 *
 * Thin wrapper over the official MCP TypeScript SDK (v2:
 * `@modelcontextprotocol/client`) for connecting to MCP servers, discovering
 * their tools, and routing tool calls back. Two remote transports:
 *   - **sse**: HTTP+SSE, deprecated since protocol revision 2025-03-26
 *   - **streamable-http**: the current HTTP transport
 * Local stdio servers are spawned by the desktop host, never through this
 * package.
 *
 * Protocol era: connections negotiate with `mode: 'auto'`, so a server that
 * answers the `server/discover` probe gets 2026-07-28 semantics and everything
 * else transparently falls back to the 2025 `initialize` handshake. The
 * negotiated era is reported on the handle as `protocolEra`.
 *
 * @packageDocumentation
 */

export type {
  McpServerConfig,
  McpCatalogTool,
  McpServerCatalog,
  McpToolCatalog,
  McpCallToolResult,
  McpCatalogResource,
  McpCatalogResourceTemplate,
  McpCatalogPrompt,
  McpCatalogPromptArgument,
  McpCatalogDiscoveryError,
  McpRejectedTool,
  McpServerTransport,
  McpToolRejectionReason,
  McpAppDescriptor,
  McpToolVisibility,
  McpInputRequiredState,
  McpClientCacheConfig,
  McpDiscoveryConfig,
  McpTaskOperations,
} from './types';

export {
  MCP_TASKS_EXTENSION_ID,
  cancelTask,
  getTask,
  parseCreateTaskResult,
  serverSupportsTasks,
  updateTask,
} from './tasks';
export type {
  McpCancelTaskResult,
  McpCreateTaskResult,
  McpGetTaskResult,
  McpUpdateTaskResult,
} from './tasks';

export { resolveMcpTransport, createEgressGuardedFetch } from './transport';
export type { McpEgressPolicy, McpFetch } from './transport';
export { connectMcpServer, buildMcpToolCatalog } from './connect';
export type {
  McpServerHandle,
  McpCallToolOptions,
  ConnectMcpServerParams,
  McpConnectionRuntimeOptions,
  BuildMcpCatalogOptions,
} from './connect';
