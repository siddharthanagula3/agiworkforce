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
import type { ProfileRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import {
  acceptInvitation,
  declineInvitation,
  formatInvitation,
} from '@/lib/services/organization-invitation-service';

/**
 * POST /api/settings/team/invitations/accept
 * body: { token, action: 'accept' | 'decline' }
 *
 * # Why this handler is privileged
 *
 * The invitee has no `organization_members` row yet and no org claim in their
 * JWT, so no RLS predicate can authorize them — 0085 says so in the policy
 * block. Authorization is therefore the one-time token, and the lookup is bound
 * to `token_hash = $1 and status = 'pending' and expires_at > now()` and
 * nothing else. It never accepts an organizationId from the client.
 *
 * # Why the token alone is not enough
 *
 * A leaked link must not hand org access to whoever opens it, so the
 * authenticated subject's stored email must match the invited address. The
 * membership row is always bound to the authenticated user id, never to the
 * invited string.
 *
 * # Why the token is in the BODY
 *
 * A token in the query string lands in access logs and Referer headers. It is
 * read from a POST body and never logged or echoed back.
 */
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
    // The issue list is safe: zod reports the path and constraint, never the
    // submitted token value.
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { token, action } = parsed.data;

  const db = getNeonDb();

  if (action === 'decline') {
    const invitation = await declineInvitation(db, token);
    logger.info(
      { userId, organizationId: invitation.organization_id, invitationId: invitation.id },
      'Organization invitation declined',
    );
    return NextResponse.json({ invitation: formatInvitation(invitation) });
  }

  // Email identity is resolved from the database, never from a client claim.
  const [profile] = await db.query<Pick<ProfileRow, 'id' | 'email'>>(
    `select id, email from public.profiles where id = $1 limit 1`,
    [userId],
  );

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
