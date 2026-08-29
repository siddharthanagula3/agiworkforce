import 'server-only';

import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AgentTaskStateSchema,
  ManagedCloudAgentRunRequestIdSchema,
} from '@agiworkforce/cloud-contracts';
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
import type { CloudWorkMode } from '@agiworkforce/types';
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

const AGI_WORK_MODES = ['agiwork'] as const satisfies readonly CloudWorkMode[];

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'agent-run-follow');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const rawStates = url.searchParams.getAll('state');
  const parsedRequestIds = z
    .array(ManagedCloudAgentRunRequestIdSchema)
    .max(1)
    .safeParse(url.searchParams.getAll('requestId'));
  const parsedStates = z
    .array(AgentTaskStateSchema)
    .min(1)
    .max(9)
    .safeParse(rawStates.length > 0 ? [...new Set(rawStates)] : DEFAULT_ACTIVE_STATES);
  const rawLimit = url.searchParams.get('limit') ?? '25';
  const parsedLimit = z.coerce.number().int().min(1).max(100).safeParse(rawLimit);
  if (!parsedRequestIds.success || !parsedStates.success || !parsedLimit.success) {
    throw createError.validation('Invalid Cloud task list parameters');
  }

  const { db, userId } = await getUserScopedDb(request);
  // Tasks is the AGI Work surface: it lists the runs that mode produced and
  // nothing else. An ordinary `chat` turn also writes a cloud_agent_runs row,
  // so without this filter every conversation showed up here as a "task".
  const page = await listCloudAgentRuns(db, {
    userId,
    states: parsedStates.data,
    requestId: parsedRequestIds.data[0],
    before: decodeCursor(url.searchParams.get('cursor')),
    limit: parsedLimit.data,
    workModes: AGI_WORK_MODES,
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
