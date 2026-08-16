import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { persistActiveWorkspaceSelection } from '@/lib/services/active-workspace-service';

const SelectionSchema = z.object({ organizationId: z.string().uuid().nullable() }).strict();

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const parsed = SelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Select a valid workspace', parsed.error.issues);
  }

  const { userId } = await getClerkAuthUser(request);
  await getNeonDb().transaction(async (tx) => {
    await tx.query(
      `select pg_advisory_xact_lock(hashtextextended('agi:active-workspace:' || $1, 0))`,
      [userId],
    );
    await persistActiveWorkspaceSelection(tx, userId, parsed.data.organizationId);
  });

  return NextResponse.json({
    activeOrganizationId: parsed.data.organizationId,
    scope: parsed.data.organizationId ? 'organization' : 'personal',
  });
}

export const PUT = withErrorHandler(handlePut);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
