import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import type { ProfileRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import {
  acceptInvitation,
  declineInvitation,
  formatInvitation,
} from '@/lib/services/organization-invitation-service';

const AcceptSchema = z.object({
  token: z.string().min(20).max(512),
  action: z.enum(['accept', 'decline']).default('accept'),
});

async function handleAccept(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-accept');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => ({}));
  const parsed = AcceptSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { token, action } = parsed.data;

  // The token lookups below stay on the raw owner connection on purpose: the
  // invitee has no organization_members row yet, so RLS (organization_invitations_admin_access,
  // 0085_organization_seats_lifecycle.sql) cannot authorize accepting or declining by
  // membership. The one-time token is the authorization, not the session's org scope.
  // check-db-isolation.mjs documents the same reasoning for organization-invitation-service.ts.
  const db = getNeonDb();
  const scopedDb = createClaimedUserScopedDb(db, { userId, organizationId: null });

  const [profile] = await scopedDb.query<Pick<ProfileRow, 'id' | 'email'>>(
    `select id, email from public.profiles where id = $1 limit 1`,
    [userId],
  );

  if (action === 'decline') {
    const invitation = await declineInvitation(db, {
      token,
      userEmail: profile?.email ?? null,
    });
    logger.info(
      { userId, organizationId: invitation.organization_id, invitationId: invitation.id },
      'Organization invitation declined',
    );
    return NextResponse.json({ invitation: formatInvitation(invitation) });
  }

  const { invitation, role } = await acceptInvitation(db, {
    token,
    userId,
    userEmail: profile?.email ?? null,
  });

  logger.info(
    { userId, organizationId: invitation.organization_id, invitationId: invitation.id, role },
    'Organization invitation accepted',
  );

  return NextResponse.json({
    invitation: formatInvitation(invitation),
    membership: {
      organizationId: invitation.organization_id,
      userId,
      role,
    },
  });
}

export const POST = withErrorHandler(handleAccept);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
