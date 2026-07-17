/**
 * @agiworkforce/mcp
 *
 * Thin wrapper over `@modelcontextprotocol/sdk` for connecting to MCP
 * servers, discovering their tools, and routing tool calls back. Three
 * transports:
 *   - **stdio**: spawn a child process, pipe JSON-RPC over stdin/stdout
 *   - **sse**: legacy SSE transport
 *   - **streamable-http**: modern bidi HTTP stream
 *
 * Shape note: `McpServerConfig` mirrors OpenClaw's
 * `src/config/types.mcp.ts` so AGI Workforce config files are MCP-ecosystem
 * compatible (drop-in for tools that already produce that shape).
 *
 * @packageDocumentation
 */

export type {
  McpServerConfig,
  McpCatalogTool,
  McpServerCatalog,
  McpToolCatalog,
  McpCallToolResult,
} from './types';

export { resolveMcpTransport } from './transport';
export { connectMcpServer, buildMcpToolCatalog } from './connect';
export type { McpServerHandle, ConnectMcpServerParams } from './connect';
