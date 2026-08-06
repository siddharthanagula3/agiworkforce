import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getOrganizationSeatState } from '@/lib/services/organization-seat-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';

const QuerySchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
});

/**
 * GET /api/settings/organization/seats?organizationId=<uuid>
 *
 * Read-only on purpose.
 *
 * `licensed_seats` is the number the customer PAID for. Exposing a mutation
 * here would let an org admin grant themselves seats they never bought, which
 * is a revenue defect, so the column is writable only by billing provisioning
 * (a `before update` trigger in 0085 rejects the write outright when it comes
 * from the application role).
 *
 * `seatSource: 'unprovisioned'` is the honest signal that no Stripe
 * subscription is linked yet: the ceiling holds, but it cannot grow until the
 * checkout/webhook path writes `organizations.licensed_seats`. That path is
 * owned by the billing workstream and is a declared dependency, not a claim
 * made here.
 */
async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-seats');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    organizationId: searchParams.get('organizationId') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('organizationId query parameter is required', parsed.error.issues);
  }
  const { organizationId } = parsed.data;

  const db = getNeonDb();
  const access = await requireTeamAdminAccess(db, userId, organizationId);

  // Membership in the NAMED org is proved before any seat number is returned.
  const [membership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );

  if (!membership) {
    throw createError.forbidden('You are not a member of this organization');
  }

  const seats = await getOrganizationSeatState(db, organizationId);
  if (!seats) {
    throw createError.notFound('Organization not found');
  }

  const [pending] = await db.query<{ pending_count: string }>(
    `select count(*)::text as pending_count
       from public.organization_invitations
      where organization_id = $1 and status = 'pending' and expires_at > now()`,
    [organizationId],
  );

  return NextResponse.json({
    seats: {
      ...seats,
      pendingInvitations: Number.parseInt(pending?.pending_count ?? '0', 10),
      seatsWritable: false,
      seatsWritableReason:
        'Licensed seats are written by billing provisioning. No checkout path writes organizations.licensed_seats yet, so this number cannot be increased from the product.',
    },
    access,
    currentUserRole: membership.role,
  });
}

export const GET = withErrorHandler(handleGet);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
