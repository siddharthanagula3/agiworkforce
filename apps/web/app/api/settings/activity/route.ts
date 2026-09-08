import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { SecurityAuditLogRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { presentActivity, type PresentedActivity } from './activity-presentation';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const AUDIT_SCOPE = { resolveOrganization: false } as const;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

async function handleGetActivity(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  let db: ScopedDb;
  try {
    ({ db, userId } = await getUserScopedDb(request, AUDIT_SCOPE));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });
  if (!parsed.success) {
    throw createError.validation('Invalid query parameters', parsed.error.issues);
  }
  const { limit, offset } = parsed.data;

  try {
    const rows = await db.query<SecurityAuditLogRow>(
      `select id, user_id, event_type, severity, ip_address, user_agent, endpoint, details, created_at
       from public.security_audit_logs
       where user_id = $1
       order by created_at desc
       limit $2
       offset $3`,
      [userId, limit, offset],
    );

    // Rows the map does not recognise are dropped rather than handed to the
    // client as a path and an address. See activity-presentation.ts.
    const activities = rows
      .map((row) =>
        presentActivity({
          id: row.id,
          event_type: row.event_type,
          endpoint: row.endpoint ?? null,
          user_agent: row.user_agent ?? null,
          created_at: row.created_at,
        }),
      )
      .filter((activity): activity is PresentedActivity => activity !== null);

    return NextResponse.json({ activities, limit, offset });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch user activity');
    throw createError.internal('Failed to fetch user activity');
  }
}

export const GET = withErrorHandler(handleGetActivity);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
