
import { NextRequest, NextResponse } from 'next/server';

import { connectMcpServer, type McpServerConfig } from '@agiworkforce/mcp';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';

export const runtime = 'nodejs';
export const WEB_MCP_PRIVATE_BETA_ENV = 'AGI_WEB_MCP_PRIVATE_BETA';

interface ConnectBody {
  serverName?: string;
  config?: McpServerConfig;
}

function isWebMcpPrivateBetaEnabled(): boolean {
  const raw = process.env[WEB_MCP_PRIVATE_BETA_ENV]?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

async function handleConnect(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  if (!isWebMcpPrivateBetaEnabled()) {
    return NextResponse.json(
      {
        error: 'Web MCP connections are private beta only.',
        code: 'WEB_MCP_PRIVATE_BETA_REQUIRED',
      },
      { status: 403 },
    );
  }

  let body: ConnectBody;
  try {
    body = (await request.json()) as ConnectBody;
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const serverName = body.serverName?.trim();
  if (!serverName || serverName.length > 100) {
    throw createError.validation('serverName is required (1–100 chars)');
  }
  if (!body.config) {
    throw createError.validation('config is required');
  }

  if (typeof body.config.command === 'string' && body.config.command.length > 0) {
    throw createError.validation(
      'Stdio MCP transports must be configured via the api-gateway, not the web /api/mcp route.',
    );
  }
  await validateHttpsMcpUrl(body.config.url, 'config.url');

  let handle;
  try {
    handle = await connectMcpServer({
      serverName,
      config: { ...body.config, connectionTimeoutMs: 30_000 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, serverName, message }, 'mcp.connect failed');
    throw createError.serviceUnavailable(`Failed to connect to MCP server: ${message}`);
  }

  try {
    return NextResponse.json({
      version: 1,
      generatedAt: Date.now(),
      server: handle.catalog,
    });
  } finally {
    await handle.close();
  }
}

export const POST = withErrorHandler(handleConnect);
