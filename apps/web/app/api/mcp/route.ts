/**
 * MCP API — server-side proxy that uses the shared `@agiworkforce/mcp`
 * transport-discriminated client to connect to remote MCP servers and
 * surface their tool catalogs to authenticated web users.
 *
 * Routes:
 *   POST /api/mcp      — connect-and-list. Body: { serverName, config }
 *                        Returns the tool catalog for one server.
 *
 * Notes:
 *   - SSRF defense: stdio transports are rejected outright (the gateway
 *     does not spawn child processes from a Next.js route handler — that
 *     belongs in `services/api-gateway/src/mcp/` which runs the long-lived
 *     proxy). Only HTTP-family transports are accepted here.
 *   - Connection lifecycle: each request opens, lists, and closes a fresh
 *     handle. No connection pooling at this layer; the agent-side caller
 *     is responsible for caching tool catalogs.
 *   - Auth: requires authenticated user. CSRF-protected.
 */

import { NextRequest, NextResponse } from 'next/server';

import { connectMcpServer, type McpServerConfig } from '@agiworkforce/mcp';

import { getAuthenticatedUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

interface ConnectBody {
  serverName?: string;
  config?: McpServerConfig;
}

function validateHttpUrl(raw: unknown): URL {
  if (typeof raw !== 'string') {
    throw createError.validation('config.url must be a string');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw createError.validation('config.url is not a valid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw createError.validation('config.url must use http(s) scheme');
  }
  // SSRF defense: reject loopback / private / link-local hosts. Mirror of
  // the api-gateway httpTransportSchema policy at
  // services/api-gateway/src/mcp/mcpConfig.ts.
  const host = parsed.hostname;
  const blockedHosts =
    /(^localhost$|^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^0\.0\.0\.0$|^::1$|^::ffff:127\.|^\[::1\]$)/i;
  if (blockedHosts.test(host)) {
    throw createError.validation('config.url targets a private network address');
  }
  return parsed;
}

async function handleConnect(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

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

  // Stdio is server-process-only — disallow from a Next route handler.
  if (typeof body.config.command === 'string' && body.config.command.length > 0) {
    throw createError.validation(
      'Stdio MCP transports must be configured via the api-gateway, not the web /api/mcp route.',
    );
  }
  validateHttpUrl(body.config.url);

  let handle;
  try {
    handle = await connectMcpServer({
      serverName,
      config: { ...body.config, connectionTimeoutMs: 30_000 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId: user.id, serverName, message }, 'mcp.connect failed');
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
