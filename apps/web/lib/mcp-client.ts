/**
 * @file MCP Client for Web App
 *
 * HTTP client for calling MCP tools via the API gateway proxy.
 * Web/mobile clients cannot run local MCP servers, so this client
 * proxies requests through the API gateway's /api/mcp/* endpoints.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface McpServer {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  transport: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError: boolean;
}

export interface McpToolCallResponse {
  serverId: string;
  toolName: string;
  result: McpToolResult;
  meta: {
    durationMs: number;
  };
}

export interface McpClientOptions {
  /** Base URL for the API gateway (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Function that returns the current auth token */
  getToken: () => string | null;
}

// =============================================================================
// ERROR
// =============================================================================

export class McpClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'McpClientError';
    this.status = status;
    this.code = code;
  }
}

// =============================================================================
// CLIENT
// =============================================================================

export class McpClient {
  private baseUrl: string;
  private getToken: () => string | null;

  constructor(options: McpClientOptions) {
    // Remove trailing slash
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getToken = options.getToken;
  }

  /**
   * List all available MCP servers.
   */
  async listServers(): Promise<McpServer[]> {
    const data = await this.request<{ servers: McpServer[] }>('GET', '/api/mcp/servers');
    return data.servers;
  }

  /**
   * List tools available on a specific server.
   */
  async listTools(serverId: string): Promise<{
    serverId: string;
    serverName: string;
    tools: McpTool[];
  }> {
    return this.request('GET', `/api/mcp/servers/${encodeURIComponent(serverId)}/tools`);
  }

  /**
   * Call a tool on a specific server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolCallResponse> {
    return this.request(
      'POST',
      `/api/mcp/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}/call`,
      { arguments: args },
    );
  }

  /**
   * List all tools across all connected servers.
   * Convenience method that fetches tools from every server in parallel.
   */
  async listAllTools(): Promise<Array<{ serverId: string; serverName: string; tool: McpTool }>> {
    const servers = await this.listServers();
    const connectedServers = servers.filter((s) => s.connected);

    const results = await Promise.allSettled(connectedServers.map((s) => this.listTools(s.id)));

    const allTools: Array<{
      serverId: string;
      serverName: string;
      tool: McpTool;
    }> = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { serverId, serverName, tools } = result.value;
        for (const tool of tools) {
          allTools.push({ serverId, serverName, tool });
        }
      }
    }

    return allTools;
  }

  // ===========================================================================
  // PRIVATE
  // ===========================================================================

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new McpClientError('Not authenticated', 401, 'NO_TOKEN');
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorBody: { error?: string; message?: string; code?: string } = {};
      try {
        errorBody = (await response.json()) as typeof errorBody;
      } catch {
        // Ignore parse errors
      }

      throw new McpClientError(
        errorBody.message ?? errorBody.error ?? `HTTP ${response.status}`,
        response.status,
        errorBody.code,
      );
    }

    return (await response.json()) as T;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let clientInstance: McpClient | null = null;

/**
 * Get or create the singleton MCP client.
 * Uses NEXT_PUBLIC_API_GATEWAY_URL env var for the base URL.
 */
export function getMcpClient(getToken: () => string | null): McpClient {
  if (clientInstance) return clientInstance;

  const baseUrl = process.env['NEXT_PUBLIC_API_GATEWAY_URL'] ?? 'http://localhost:3000';

  clientInstance = new McpClient({ baseUrl, getToken });
  return clientInstance;
}
