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
import { presentActivity, type PresentedActivity } from '../activity/activity-presentation';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const AUDIT_SCOPE = { resolveOrganization: false } as const;

const QuerySchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type PresentedAuditEntry = PresentedActivity & { action: string };

async function handleGetAuditLogs(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-audit-logs');
  if (rateLimitResponse) return rateLimitResponse;

  let requesterId: string;
  let db: ScopedDb;
  try {
    ({ db, userId: requesterId } = await getUserScopedDb(request, AUDIT_SCOPE));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    action: searchParams.get('action') ?? undefined,
    resourceType: searchParams.get('resourceType') ?? undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  if (!parsed.success) {
    throw createError.validation('Invalid query parameters', parsed.error.issues);
  }

  const { action, resourceType, startDate, endDate, limit, offset } = parsed.data;

  const effectiveUserId = requesterId;

  try {
    const params: unknown[] = [effectiveUserId, limit + 1, offset];
    const clauses: string[] = [];

    if (action) {
      params.push(action);
      clauses.push(`sal.event_type = $${params.length}`);
    }
    if (resourceType) {
      params.push(resourceType);
      clauses.push(`sal.details->>'resource_type' = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      clauses.push(`sal.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate) {
      params.push(endDate);
      clauses.push(`sal.created_at <= $${params.length}::timestamptz`);
    }

    const whereExtra = clauses.length > 0 ? `and ${clauses.join(' and ')}` : '';

    const rows = await db.query<SecurityAuditLogRow>(
      `select
         sal.id, sal.user_id, sal.event_type, sal.severity,
         sal.ip_address, sal.user_agent, sal.endpoint, sal.details, sal.created_at
       from public.security_audit_logs sal
       where sal.user_id = $1
         ${whereExtra}
       order by sal.created_at desc
       limit $2
       offset $3`,
      params,
    );

    const hasMore = rows.length > limit;
    const entries = rows
      .slice(0, limit)
      .map((row): PresentedAuditEntry | null => {
        const presented = presentActivity({
          id: row.id,
          event_type: row.event_type,
          endpoint: row.endpoint ?? null,
          user_agent: row.user_agent ?? null,
          created_at: row.created_at,
        });
        return presented ? { ...presented, action: row.event_type } : null;
      })
      .filter((entry): entry is PresentedAuditEntry => entry !== null);

    return NextResponse.json({ entries, hasMore, limit, offset });
  } catch (error) {
    logger.error({ error, requesterId }, 'Failed to fetch audit logs');
    throw createError.internal('Failed to fetch audit logs');
  }
}

export const GET = withErrorHandler(handleGetAuditLogs);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
