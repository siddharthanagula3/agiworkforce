import 'server-only';

import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentTaskStateSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import {
  getCorsHeaders,
  getSecurityHeaders,
  handleCorsPreflightRequest,
  withCorsRoute,
} from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listCloudAgentRuns,
  type CloudAgentRunCursor,
} from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_ACTIVE_STATES = [
  'queued',
  'running',
  'paused',
  'awaiting_input',
  'ready_for_review',
] as const;
const CursorSchema = z.object({
  updatedAt: z.string().datetime(),
  id: z.string().uuid(),
});

function decodeCursor(raw: string | null): CloudAgentRunCursor | undefined {
  if (!raw) return undefined;
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw createError.validation('Invalid Cloud task cursor');
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const parsed = CursorSchema.safeParse(decoded);
    if (!parsed.success) throw new Error('invalid cursor payload');
    return parsed.data;
  } catch {
    throw createError.validation('Invalid Cloud task cursor');
  }
}

function encodeCursor(cursor: CloudAgentRunCursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url') : null;
}

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const rawStates = url.searchParams.getAll('state');
  const parsedStates = z
    .array(AgentTaskStateSchema)
    .min(1)
    .max(9)
    .safeParse(rawStates.length > 0 ? [...new Set(rawStates)] : DEFAULT_ACTIVE_STATES);
  const rawLimit = url.searchParams.get('limit') ?? '25';
  const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(rawLimit);
  if (!parsedStates.success || !parsedLimit.success) {
    throw createError.validation('Invalid Cloud task list parameters');
  }

  const { db, userId } = await getUserScopedDb(request);
  const page = await listCloudAgentRuns(db, {
    userId,
    states: parsedStates.data,
    before: decodeCursor(url.searchParams.get('cursor')),
    limit: parsedLimit.data,
  });
  return NextResponse.json(
    { runs: page.runs, nextCursor: encodeCursor(page.next) },
    { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
