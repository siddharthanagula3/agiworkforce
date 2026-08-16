
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { getSharedMcpCatalog, callSharedMcpTool } from './sharedClient';
import { getServerEntry, loadMcpConfig } from './mcpConfig';

const router: Router = Router();

router.use(authenticateToken);

router.use(createRateLimiter('mcp-list'));

const toolCallBodySchema = z
  .object({
    arguments: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

const serverIdParamSchema = z.string().min(1).max(100);
const toolNameParamSchema = z.string().min(1).max(200);

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

router.get('/servers', createRateLimiter('mcp-list'), async (_req: Request, res: Response) => {
  try {
    const catalog = await getSharedMcpCatalog();
    const configServers = loadMcpConfig();

    res.json({
      servers: configServers.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        connected: Object.prototype.hasOwnProperty.call(catalog.servers, s.id),
        transport: s.transport.type,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to retrieve MCP catalog');
    throw new AppError('Failed to retrieve MCP catalog', 503);
  }
});

router.get(
  '/servers/:serverId/tools',
  createRateLimiter('mcp-list'),
  async (req: Request<{ serverId: string }>, res: Response) => {
    const serverId = validateServerId(req.params.serverId);

    const entry = getServerEntry(serverId);
    if (!entry) {
      throw new AppError(`Server "${serverId}" not found`, 404);
    }

    try {
      const catalog = await getSharedMcpCatalog();
      const serverCatalog = catalog.servers[serverId];
      if (!serverCatalog) {
        throw new AppError(`Server "${serverId}" is not connected or initialized`, 503);
      }

      res.json({
        serverId,
        serverName: entry.name,
        tools: serverCatalog.tools.map((t) => ({
          name: t.toolName,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? {},
        })),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, serverId }, 'Failed to retrieve server tools');
      throw new AppError('Failed to retrieve server tools', 502);
    }
  },
);

router.post(
  '/servers/:serverId/tools/:toolName/call',
  createRateLimiter('mcp-call'),
  async (req: Request<{ serverId: string; toolName: string }>, res: Response) => {
    const serverId = validateServerId(req.params.serverId);
    const toolName = validateToolName(req.params.toolName);
    const user = req.user;

    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const body = toolCallBodySchema.parse(req.body);

    const entry = getServerEntry(serverId);
    if (!entry) {
      throw new AppError(`Server "${serverId}" not found`, 404);
    }

    const catalog = await getSharedMcpCatalog();
    const serverCatalog = catalog.servers[serverId];
    if (!serverCatalog) {
      throw new AppError(`Server "${serverId}" is not connected or initialized`, 503);
    }

    const toolDef = serverCatalog.tools.find((t) => t.toolName === toolName);
    if (!toolDef) {
      throw new AppError(`Tool "${toolName}" not found on server "${serverId}"`, 404);
    }

    if (toolDef.inputSchema && Object.keys(toolDef.inputSchema).length > 0) {
      const schemaValidation = validateToolArguments(body.arguments, toolDef.inputSchema);
      if (!schemaValidation.valid) {
        throw new AppError(`Invalid tool arguments: ${schemaValidation.error}`, 400);
      }
    }

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
      const result = await callSharedMcpTool(serverId, toolName, body.arguments);
      const durationMs = Date.now() - startTime;

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

      throw new AppError(
        err instanceof Error ? err.message : 'MCP tool call execution failed',
        502,
      );
    }
  },
);

function validateToolArguments(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): { valid: boolean; error?: string } {
  const required = schema['required'] as string[] | undefined;
  if (Array.isArray(required)) {
    for (const field of required) {
      if (!(field in args)) {
        return { valid: false, error: `Missing required field: "${field}"` };
      }
    }
  }

  const properties = schema['properties'] as Record<string, { type?: string }> | undefined;
  if (properties) {
    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema?.type) {
        const expectedType = propSchema.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (value !== null && expectedType !== actualType) {
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

export { router as mcpRouter };
