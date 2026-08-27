import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { loadMcpAppPayload } from '@/lib/connectors/mcp-state-store';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ payloadId: string }> },
): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;
  const { payloadId } = await context.params;
  if (!UUID_RE.test(payloadId)) throw createError.validation('Invalid MCP App payload id');
  const { userId } = await getUserScopedDb(request);
  const payload = await loadMcpAppPayload(userId, payloadId);
  if (!payload) throw createError.notFound('MCP App payload not found or expired');
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
