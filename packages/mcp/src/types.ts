/**
 * MCP server configuration shape.
 *
 * Mirrors OpenClaw's `McpServerConfig` (`src/config/types.mcp.ts`) — a stable
 * shape across the MCP ecosystem. Three transports:
 *   - **stdio**: spawn `command` with `args` as a child process; pipe JSON-RPC
 *     over stdin/stdout. Most common for local/dev MCP servers.
 *   - **sse**: legacy MCP transport over Server-Sent Events.
 *   - **streamable-http**: modern MCP transport over a single bidi HTTP stream.
 */
export interface McpServerConfig {
  /** Stdio: command to run. Mutually exclusive with `url`. */
  command?: string;
  /** Stdio: args. */
  args?: string[];
  /** Stdio: env vars (added on top of process.env). */
  env?: Record<string, string | number | boolean>;
  /** Stdio: working directory. */
  cwd?: string;
  /** HTTP transports: server URL. Mutually exclusive with `command`. */
  url?: string;
  /** HTTP transport selection: defaults to "streamable-http" if `url` is set. */
  transport?: 'sse' | 'streamable-http';
  /** HTTP transports: extra request headers (auth, X-Forwarded-For, etc.). */
  headers?: Record<string, string | number | boolean>;
  /** Connection timeout in milliseconds. Default 30s. */
  connectionTimeoutMs?: number;
}

/** A single tool in the connected MCP server's catalog. */
export interface McpCatalogTool {
  serverName: string;
  /** Filesystem-safe / model-prompt-safe alias. */
  safeServerName: string;
  toolName: string;
  title?: string;
  description?: string;
  /** JSON Schema describing the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Backstop description used when the server omits one. */
  fallbackDescription: string;
}

export interface McpServerCatalog {
  serverName: string;
  safeServerName: string;
  tools: McpCatalogTool[];
}

export interface McpToolCatalog {
  /** Catalog version — bump on breaking shape changes. */
  version: number;
  /** Epoch ms when the catalog was generated. */
  generatedAt: number;
  servers: Record<string, McpServerCatalog>;
  /** Flat tool list across all servers (for prompt injection). */
  tools: McpCatalogTool[];
}

/** Result of a single MCP tool invocation. */
export interface McpCallToolResult {
  /** Was this an error result? */
  isError?: boolean;
  /** Content blocks the tool returned (text/image/embedded resource/etc). */
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string } }
  >;
}
