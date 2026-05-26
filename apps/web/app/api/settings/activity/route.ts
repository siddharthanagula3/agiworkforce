import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SecurityAuditLogRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Map security_audit_log event_type values to the UserActivity type enum.
const EVENT_TYPE_MAP: Record<string, string> = {
  login: 'login',
  logout: 'logout',
  settings_change: 'settings_change',
  api_call: 'api_call',
  chat_session: 'chat_session',
  employee_hire: 'employee_hire',
  payment: 'payment',
};

function mapEventType(eventType: string): string {
  return EVENT_TYPE_MAP[eventType] ?? 'other';
}

/**
 * GET /api/settings/activity
 * User activity log — returns the current user's recent security audit events
 * mapped to the UserActivity shape the UI expects.
 */
async function handleGetActivity(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
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

  const db = getNeonDb();

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

    const activities = rows.map((row) => ({
      id: row.id,
      userId: row.user_id ?? userId,
      type: mapEventType(row.event_type),
      description:
        (row.details?.['description'] as string | undefined) ?? row.endpoint ?? row.event_type,
      ipAddress: row.ip_address ?? null,
      userAgent: row.user_agent ?? null,
      metadata: (row.details as Record<string, unknown>) ?? {},
      createdAt: row.created_at,
    }));

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
