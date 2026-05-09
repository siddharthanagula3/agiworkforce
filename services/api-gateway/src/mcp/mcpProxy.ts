/**
 * @file MCP Proxy Service
 *
 * @deprecated New code should consume `./sharedClient.ts`, which uses the
 * official `@modelcontextprotocol/sdk` via the shared `@agiworkforce/mcp`
 * package. The hand-rolled JSON-RPC framing in this file predates the
 * shared client — kept for backward-compat while existing callers migrate.
 * On first use per process the proxy logs a one-shot deprecation warning.
 *
 * Manages server-side MCP server connections and forwards tool calls from
 * web/mobile clients to the appropriate MCP server.
 *
 * Supports two transports:
 * - stdio: Spawns a child process and communicates via JSON-RPC over stdin/stdout
 * - http: Sends JSON-RPC requests to an HTTP endpoint
 *
 * Connections are maintained persistently and automatically reconnected on failure.
 */

import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';
import { loadMcpConfig, type McpServerEntry, type McpTransport } from './mcpConfig';

// =============================================================================
// TYPES
// =============================================================================

/** JSON-RPC 2.0 request */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** MCP tool definition as returned by tools/list */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Result of a tool call */
export interface McpToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** Connection state for a stdio-based server */
interface StdioConnection {
  type: 'stdio';
  process: ChildProcessWithoutNullStreams;
  pendingRequests: Map<
    string,
    {
      resolve: (value: JsonRpcResponse) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >;
  buffer: string;
  initialized: boolean;
}

/** Connection state for an HTTP-based server */
interface HttpConnection {
  type: 'http';
  url: string;
  headers: Record<string, string>;
  initialized: boolean;
}

type ServerConnection = StdioConnection | HttpConnection;

// =============================================================================
// CONSTANTS
// =============================================================================

/** Timeout for individual JSON-RPC requests (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/** Timeout for server initialization (15 seconds) */
const INIT_TIMEOUT_MS = 15_000;

// =============================================================================
// MCP PROXY CLASS
// =============================================================================

export class McpProxy {
  private connections = new Map<string, ServerConnection>();
  private toolsCache = new Map<string, McpToolDefinition[]>();

  /**
   * Initialize connections to all configured MCP servers.
   * Called once at gateway startup.
   */
  async initialize(): Promise<void> {
    const servers = loadMcpConfig();
    logger.info({ count: servers.length }, 'Initializing MCP proxy connections');

    const results = await Promise.allSettled(servers.map((server) => this.connectServer(server)));

    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const server = servers[i];
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        logger.error(
          { serverId: server.id, error: result.reason },
          'Failed to connect to MCP server',
        );
      }
    }

    logger.info(
      { total: servers.length, connected: successCount },
      'MCP proxy initialization complete',
    );
  }

  /**
   * List all available servers with their connection status.
   */
  listServers(): Array<{
    id: string;
    name: string;
    description: string;
    connected: boolean;
    transport: string;
  }> {
    const servers = loadMcpConfig();
    return servers.map((server) => {
      const conn = this.connections.get(server.id);
      return {
        id: server.id,
        name: server.name,
        description: server.description ?? '',
        connected: conn?.initialized ?? false,
        transport: server.transport.type,
      };
    });
  }

  /**
   * List tools available on a specific server.
   * Results are cached after the first successful fetch.
   */
  async listTools(serverId: string): Promise<McpToolDefinition[]> {
    // Check cache first
    const cached = this.toolsCache.get(serverId);
    if (cached) return cached;

    const conn = this.getConnection(serverId);

    const response = await this.sendRequest(serverId, conn, {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/list',
      params: {},
    });

    if (response.error) {
      throw new McpProxyError(
        `Failed to list tools: ${response.error.message}`,
        'TOOLS_LIST_FAILED',
      );
    }

    const result = response.result as { tools?: McpToolDefinition[] } | undefined;
    const tools = result?.tools ?? [];

    // Cache the result
    this.toolsCache.set(serverId, tools);
    return tools;
  }

  /**
   * Call a specific tool on a specific server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const conn = this.getConnection(serverId);

    const response = await this.sendRequest(serverId, conn, {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    });

    if (response.error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${response.error.message}`,
          },
        ],
        isError: true,
      };
    }

    const result = response.result as McpToolCallResult | undefined;
    return result ?? { content: [{ type: 'text', text: 'No result returned' }] };
  }

  /**
   * Shut down all connections gracefully.
   */
  async shutdown(): Promise<void> {
    logger.info({}, 'Shutting down MCP proxy connections');

    for (const [serverId, conn] of this.connections.entries()) {
      try {
        if (conn.type === 'stdio' && conn.process) {
          conn.process.kill('SIGTERM');
          // Clean up pending requests
          for (const [, pending] of conn.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('MCP proxy shutting down'));
          }
          conn.pendingRequests.clear();
        }
      } catch (err) {
        logger.error({ serverId, error: err }, 'Error shutting down MCP server connection');
      }
    }

    this.connections.clear();
    this.toolsCache.clear();
  }

  // ===========================================================================
  // PRIVATE — Connection Management
  // ===========================================================================

  private async connectServer(server: McpServerEntry): Promise<void> {
    const { transport } = server;

    if (transport.type === 'stdio') {
      await this.connectStdio(server.id, transport);
    } else {
      await this.connectHttp(server.id, transport);
    }
  }

  private async connectStdio(
    serverId: string,
    transport: Extract<McpTransport, { type: 'stdio' }>,
  ): Promise<void> {
    logger.info(
      { serverId, command: transport.command, args: transport.args },
      'Connecting to stdio MCP server',
    );

    // SECURITY: Build a sanitized env — strip sensitive vars from parent process
    const SENSITIVE_ENV_KEYS = new Set([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'JWT_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SIGNALING_INTERNAL_SECRET',
      'DATABASE_URL',
      'REDIS_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
    ]);
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!SENSITIVE_ENV_KEYS.has(k)) {
        env[k] = v;
      }
    }
    if (transport.env) {
      for (const [k, v] of Object.entries(transport.env)) {
        if (!SENSITIVE_ENV_KEYS.has(k)) {
          env[k] = v;
        }
      }
    }

    const child = spawn(transport.command, transport.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    const conn: StdioConnection = {
      type: 'stdio',
      process: child,
      pendingRequests: new Map(),
      buffer: '',
      initialized: false,
    };

    const MAX_BUFFER_SIZE = 1_048_576; // 1MB cap to prevent OOM from misbehaving MCP servers

    // Handle stdout data (JSON-RPC responses)
    child.stdout.on('data', (data: Buffer) => {
      conn.buffer += data.toString();
      if (conn.buffer.length > MAX_BUFFER_SIZE) {
        logger.error(
          { serverId },
          'MCP server buffer overflow (>1MB without newline), killing process',
        );
        child.kill('SIGTERM');
        conn.buffer = '';
        return;
      }
      this.processStdioBuffer(serverId, conn);
    });

    // Log stderr for debugging
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logger.debug({ serverId, stderr: text }, 'MCP server stderr');
      }
    });

    child.on('error', (err: Error) => {
      logger.error({ serverId, error: err.message }, 'MCP server process error');
      conn.initialized = false;
    });

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      logger.warn({ serverId, code, signal }, 'MCP server process exited');
      conn.initialized = false;
      this.connections.delete(serverId);
    });

    this.connections.set(serverId, conn);

    // Send initialize request
    await this.initializeServer(serverId, conn);
  }

  private async connectHttp(
    serverId: string,
    transport: Extract<McpTransport, { type: 'http' }>,
  ): Promise<void> {
    logger.info({ serverId, url: transport.url }, 'Connecting to HTTP MCP server');

    const conn: HttpConnection = {
      type: 'http',
      url: transport.url,
      headers: transport.headers ?? {},
      initialized: false,
    };

    this.connections.set(serverId, conn);

    // Send initialize request
    await this.initializeServer(serverId, conn);
  }

  private async initializeServer(serverId: string, conn: ServerConnection): Promise<void> {
    const initRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: randomUUID(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'agiworkforce-api-gateway',
          version: '1.0.0',
        },
      },
    };

    try {
      const response = await this.sendRequestWithTimeout(
        serverId,
        conn,
        initRequest,
        INIT_TIMEOUT_MS,
      );

      if (response.error) {
        throw new Error(`Initialize failed: ${response.error.message}`);
      }

      conn.initialized = true;

      // Send initialized notification (no id = notification)
      if (conn.type === 'stdio' && conn.process.stdin.writable) {
        const notification = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        });
        conn.process.stdin.write(notification + '\n');
      } else if (conn.type === 'http') {
        // For HTTP, send as a POST (server may or may not care)
        try {
          await fetch(conn.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...conn.headers,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
              params: {},
            }),
          });
        } catch {
          // Notifications are best-effort
        }
      }

      logger.info({ serverId }, 'MCP server initialized successfully');
    } catch (err) {
      logger.error({ serverId, error: err }, 'Failed to initialize MCP server');
      throw err;
    }
  }

  // ===========================================================================
  // PRIVATE — Request/Response
  // ===========================================================================

  private getConnection(serverId: string): ServerConnection {
    const conn = this.connections.get(serverId);
    if (!conn) {
      throw new McpProxyError(
        `Server "${serverId}" not found or not connected`,
        'SERVER_NOT_FOUND',
      );
    }
    if (!conn.initialized) {
      throw new McpProxyError(`Server "${serverId}" is not initialized`, 'SERVER_NOT_INITIALIZED');
    }
    return conn;
  }

  private async sendRequest(
    serverId: string,
    conn: ServerConnection,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    return this.sendRequestWithTimeout(serverId, conn, request, REQUEST_TIMEOUT_MS);
  }

  private async sendRequestWithTimeout(
    serverId: string,
    conn: ServerConnection,
    request: JsonRpcRequest,
    timeoutMs: number,
  ): Promise<JsonRpcResponse> {
    if (conn.type === 'stdio') {
      return this.sendStdioRequest(serverId, conn, request, timeoutMs);
    }
    return this.sendHttpRequest(conn, request, timeoutMs);
  }

  private sendStdioRequest(
    serverId: string,
    conn: StdioConnection,
    request: JsonRpcRequest,
    timeoutMs: number,
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const id = String(request.id);

      const timer = setTimeout(() => {
        conn.pendingRequests.delete(id);
        reject(
          new McpProxyError(
            `Request to "${serverId}" timed out after ${timeoutMs}ms`,
            'REQUEST_TIMEOUT',
          ),
        );
      }, timeoutMs);

      conn.pendingRequests.set(id, { resolve, reject, timer });

      const payload = JSON.stringify(request) + '\n';
      if (!conn.process.stdin.writable) {
        clearTimeout(timer);
        conn.pendingRequests.delete(id);
        reject(
          new McpProxyError(`Server "${serverId}" stdin is not writable`, 'SERVER_NOT_WRITABLE'),
        );
        return;
      }

      conn.process.stdin.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          conn.pendingRequests.delete(id);
          reject(
            new McpProxyError(
              `Failed to write to server "${serverId}": ${err.message}`,
              'WRITE_FAILED',
            ),
          );
        }
      });
    });
  }

  private async sendHttpRequest(
    conn: HttpConnection,
    request: JsonRpcRequest,
    timeoutMs: number,
  ): Promise<JsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(conn.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...conn.headers,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new McpProxyError(`HTTP ${response.status}: ${text}`, 'HTTP_ERROR');
      }

      const json = (await response.json()) as JsonRpcResponse;
      return json;
    } catch (err) {
      if (err instanceof McpProxyError) throw err;

      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new McpProxyError(`Request timed out after ${timeoutMs}ms`, 'REQUEST_TIMEOUT');
      }
      throw new McpProxyError(`HTTP request failed: ${error.message}`, 'HTTP_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  // ===========================================================================
  // PRIVATE — Stdio Buffer Processing
  // ===========================================================================

  private processStdioBuffer(serverId: string, conn: StdioConnection): void {
    // JSON-RPC messages are delimited by newlines
    const lines = conn.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    conn.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;

        // Only handle responses with an id (skip notifications)
        if (response.id != null) {
          const id = String(response.id);
          const pending = conn.pendingRequests.get(id);
          if (pending) {
            clearTimeout(pending.timer);
            conn.pendingRequests.delete(id);
            pending.resolve(response);
          }
        }
      } catch {
        logger.debug(
          { serverId, line: trimmed.slice(0, 200) },
          'Failed to parse MCP server output line',
        );
      }
    }
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

export class McpProxyError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'McpProxyError';
    this.code = code;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let proxyInstance: McpProxy | null = null;
let deprecationLogged = false;

/**
 * Get the singleton MCP proxy instance.
 * Creates and initializes it on first call.
 *
 * @deprecated Prefer `./sharedClient.ts`'s `getSharedMcpCatalog` /
 * `callSharedMcpTool` for new code — they use the official MCP SDK via
 * `@agiworkforce/mcp` and avoid the hand-rolled JSON-RPC framing here.
 */
export async function getMcpProxy(): Promise<McpProxy> {
  if (!deprecationLogged) {
    deprecationLogged = true;
    logger.warn(
      'mcpProxy.getMcpProxy() is deprecated; new callers should use sharedClient.ts (powered by @agiworkforce/mcp).',
    );
  }
  if (proxyInstance) return proxyInstance;

  proxyInstance = new McpProxy();
  await proxyInstance.initialize();
  return proxyInstance;
}

/**
 * Get the proxy instance without initializing (for routes that need it synchronously).
 * Returns null if not yet initialized.
 */
export function getMcpProxySync(): McpProxy | null {
  return proxyInstance;
}
