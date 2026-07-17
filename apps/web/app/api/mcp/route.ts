/**
 * MCP API · server-side proxy that uses the shared `@agiworkforce/mcp`
 * transport-discriminated client to connect to remote MCP servers and
 * surface their tool catalogs to authenticated web users.
 *
 * Routes:
 *   POST /api/mcp      · connect-and-list. Body: { serverName, config }
 *                        Returns the tool catalog for one server.
 *
 * Notes:
 *   - SSRF defense: stdio transports are rejected outright (the gateway
 *     does not spawn child processes from a Next.js route handler · that
 *     belongs in `services/api-gateway/src/mcp/` which runs the long-lived
 *     proxy). Only HTTP-family transports are accepted here.
 *   - Connection lifecycle: each request opens, lists, and closes a fresh
 *     handle. No connection pooling at this layer; the agent-side caller
 *     is responsible for caching tool catalogs.
 *   - Auth: requires authenticated user. CSRF-protected.
 */

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

// Open by default (2026-07-11), mirroring the managed-compute public-alpha
// kill-switch pattern (lib/managed-compute-gate.ts): the env var is retained
// ONLY for incident response — set AGI_WEB_MCP_PRIVATE_BETA=0 (or
// 'false'/'off') to re-gate. The route keeps auth + CSRF + rate-limit +
// https-only + SSRF DNS validation regardless; this flag was the only thing
// making the connectors-page "Inspect MCP server" primary CTA a dead control.
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

  // Stdio is server-process-only · disallow from a Next route handler.
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
