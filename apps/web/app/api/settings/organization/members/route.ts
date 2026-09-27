import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedSearchParams } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveWorkspaceApiCaller } from '@/lib/server/service-principals/caller';
import {
  listWorkspaceMembers,
  type WorkspaceMemberPage,
} from '@/lib/services/organization-member-admin-service';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/members';

const QuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    afterId: z.string().max(255).optional(),
    email: z.string().email().max(320).optional(),
  })
  .strict();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-team-list');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'GET');
  const query = readValidatedSearchParams(request, QuerySchema, 'Invalid member list query');

  const page: WorkspaceMemberPage = await listWorkspaceMembers(getNeonDb(), caller.organizationId, {
    limit: query.limit,
    afterId: query.afterId ?? null,
    email: query.email ?? null,
  });
  return NextResponse.json(page);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
