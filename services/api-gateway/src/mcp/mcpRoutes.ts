/**
 * @file MCP Proxy API Routes
 * @security
 * - Authentication: JWT required for all endpoints (via authenticateToken middleware)
 * - Rate limiting: 30/min for list operations, 20/min for tool calls
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Audit logging: All tool calls are logged with user ID, server ID, tool name
 *
 * Routes:
 * - GET  /api/mcp/servers                         — List available MCP servers
 * - GET  /api/mcp/servers/:serverId/tools          — List tools for a server
 * - POST /api/mcp/servers/:serverId/tools/:toolName/call — Call a tool
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { getMcpProxySync, McpProxyError } from './mcpProxy';
import { getServerEntry } from './mcpConfig';

const router: Router = Router();

// All MCP routes require authentication
router.use(authenticateToken);

// SECURITY: Baseline rate limit on all MCP routes to prevent abuse.
// Individual routes apply stricter per-endpoint limits below.
router.use(createRateLimiter('mcp-list'));

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// SECURITY: .strict() rejects unexpected fields to prevent mass assignment
const toolCallBodySchema = z
  .object({
    arguments: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

const serverIdParamSchema = z.string().min(1).max(100);
const toolNameParamSchema = z.string().min(1).max(200);

// =============================================================================
// HELPERS
// =============================================================================

function getProxy() {
  const proxy = getMcpProxySync();
  if (!proxy) {
    throw new AppError('MCP proxy is not initialized', 503);
  }
  return proxy;
}

function validateServerId(serverId: string | undefined): string {
  const parsed = serverIdParamSchema.safeParse(serverId);
  if (!parsed.success) {
    throw new AppError('Invalid server ID', 400);
  }
  return parsed.data;
}

function validateToolName(toolName: string | undefined): string {
  const parsed = toolNameParamSchema.safeParse(toolName);
  if (!parsed.success) {
    throw new AppError('Invalid tool name', 400);
  }
  return parsed.data;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * List all available MCP servers
 * GET /api/mcp/servers
 *
 * SECURITY: Rate limited to 30/min (read-only list operation)
 */
router.get('/servers', createRateLimiter('mcp-list'), async (_req: Request, res: Response) => {
  const proxy = getProxy();
  const servers = proxy.listServers();

  res.json({
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      connected: s.connected,
      transport: s.transport,
    })),
  });
});

/**
 * List tools available on a specific MCP server
 * GET /api/mcp/servers/:serverId/tools
 *
 * SECURITY: Rate limited to 30/min (read-only list operation)
 */
router.get(
  '/servers/:serverId/tools',
  createRateLimiter('mcp-list'),
  async (req: Request<{ serverId: string }>, res: Response) => {
    const proxy = getProxy();
    const serverId = validateServerId(req.params.serverId);

    // Verify server exists in config
    const entry = getServerEntry(serverId);
    if (!entry) {
      throw new AppError(`Server "${serverId}" not found`, 404);
    }

    try {
      const tools = await proxy.listTools(serverId);

      res.json({
        serverId,
        serverName: entry.name,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? {},
        })),
      });
    } catch (err) {
      if (err instanceof McpProxyError) {
        throw new AppError(err.message, mapErrorCode(err.code));
      }
      throw err;
    }
  },
);

/**
 * Call a specific tool on a specific MCP server
 * POST /api/mcp/servers/:serverId/tools/:toolName/call
 *
 * SECURITY:
 * - Rate limited to 20/min (tool execution is resource-intensive)
 * - Input validated against tool schema before forwarding
 * - All calls are audit-logged with user ID, server ID, tool name
 */
router.post(
  '/servers/:serverId/tools/:toolName/call',
  createRateLimiter('mcp-call'),
  async (req: Request<{ serverId: string; toolName: string }>, res: Response) => {
    const proxy = getProxy();
    const serverId = validateServerId(req.params.serverId);
    const toolName = validateToolName(req.params.toolName);
    const user = req.user;

    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // Validate request body
    const body = toolCallBodySchema.parse(req.body);

    // Verify server exists
    const entry = getServerEntry(serverId);
    if (!entry) {
      throw new AppError(`Server "${serverId}" not found`, 404);
    }

    // Verify tool exists on this server
    let tools: Awaited<ReturnType<typeof proxy.listTools>>;
    try {
      tools = await proxy.listTools(serverId);
    } catch (err) {
      if (err instanceof McpProxyError) {
        throw new AppError(err.message, mapErrorCode(err.code));
      }
      throw err;
    }

    const toolDef = tools.find((t) => t.name === toolName);
    if (!toolDef) {
      throw new AppError(`Tool "${toolName}" not found on server "${serverId}"`, 404);
    }

    // Validate arguments against tool's input schema (if available)
    if (toolDef.inputSchema && Object.keys(toolDef.inputSchema).length > 0) {
      const schemaValidation = validateToolArguments(body.arguments, toolDef.inputSchema);
      if (!schemaValidation.valid) {
        throw new AppError(`Invalid tool arguments: ${schemaValidation.error}`, 400);
      }
    }

    // SECURITY: Audit log before execution
    logger.info(
      {
        event: 'mcp_tool_call',
        userId: user.userId,
        serverId,
        toolName,
        argsKeys: Object.keys(body.arguments),
      },
      'MCP tool call initiated',
    );

    const startTime = Date.now();

    try {
      const result = await proxy.callTool(serverId, toolName, body.arguments);
      const durationMs = Date.now() - startTime;

      // SECURITY: Audit log after execution
      logger.info(
        {
          event: 'mcp_tool_call_complete',
          userId: user.userId,
          serverId,
          toolName,
          durationMs,
          isError: result.isError ?? false,
          contentCount: result.content.length,
        },
        'MCP tool call completed',
      );

      res.json({
        serverId,
        toolName,
        result: {
          content: result.content,
          isError: result.isError ?? false,
        },
        meta: {
          durationMs,
        },
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;

      logger.error(
        {
          event: 'mcp_tool_call_error',
          userId: user.userId,
          serverId,
          toolName,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        },
        'MCP tool call failed',
      );

      if (err instanceof McpProxyError) {
        throw new AppError(err.message, mapErrorCode(err.code));
      }
      throw err;
    }
  },
);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Basic validation of tool arguments against a JSON Schema-like input schema.
 * Checks required fields and top-level types.
 */
function validateToolArguments(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): { valid: boolean; error?: string } {
  // Check required properties
  const required = schema['required'] as string[] | undefined;
  if (Array.isArray(required)) {
    for (const field of required) {
      if (!(field in args)) {
        return { valid: false, error: `Missing required field: "${field}"` };
      }
    }
  }

  // Check property types (basic top-level check only)
  const properties = schema['properties'] as Record<string, { type?: string }> | undefined;
  if (properties) {
    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema?.type) {
        const expectedType = propSchema.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        // Allow null for any type (MCP tools may accept null)
        if (value !== null && expectedType !== actualType) {
          // Allow number where integer is expected
          if (expectedType === 'integer' && actualType === 'number') continue;
          return {
            valid: false,
            error: `Field "${key}" expected type "${expectedType}", got "${actualType}"`,
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Map McpProxyError codes to HTTP status codes.
 */
function mapErrorCode(code: string): number {
  switch (code) {
    case 'SERVER_NOT_FOUND':
      return 404;
    case 'SERVER_NOT_INITIALIZED':
      return 503;
    case 'TOOLS_LIST_FAILED':
      return 502;
    case 'REQUEST_TIMEOUT':
      return 504;
    case 'HTTP_ERROR':
    case 'HTTP_REQUEST_FAILED':
      return 502;
    case 'WRITE_FAILED':
    case 'SERVER_NOT_WRITABLE':
      return 503;
    default:
      return 500;
  }
}

export { router as mcpRouter };
