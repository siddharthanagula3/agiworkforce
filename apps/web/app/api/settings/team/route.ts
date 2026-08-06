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
import type { OrganizationMemberRow, ProfileRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { expirePendingInvitations } from '@/lib/services/organization-invitation-service';
import { requireTeamAdminAccess } from './team-admin-access';

/**
 * `owner` is deliberately absent.
 *
 * 0085_organization_seats_lifecycle.sql makes "exactly one owner" a database
 * fact (idx_org_members_single_owner). Ownership therefore moves only through
 * POST /api/settings/organization/transfer-ownership, which demotes and
 * promotes atomically. Accepting `owner` here could only ever produce a unique
 * violation, so it is rejected at the edge with an actionable message.
 */
const AddMemberSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

type MemberWithProfile = OrganizationMemberRow & {
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function formatMember(row: MemberWithProfile, currentUserId: string) {
  return {
    id: `${row.organization_id}:${row.user_id}`,
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email ?? '',
    name: row.display_name ?? row.email ?? row.user_id,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    status: 'active' as const,
    provisionedAt: row.provisioned_at ?? null,
    joinedAt: row.joined_at,
    lastActiveAt: null,
    permissions: [],
    isCurrentUser: row.user_id === currentUserId,
  };
}

/**
 * GET /api/settings/team?organizationId=<uuid>
 * List members of an organization the current user belongs to.
 */
async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    throw createError.validation('organizationId query parameter is required');
  }

  const db = getNeonDb();

  // Verify the requesting user is a member of that org.
  const [requesterMembership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where organization_id = $1 and user_id = $2
     limit 1`,
    [organizationId, userId],
  );

  if (!requesterMembership) {
    throw createError.forbidden('You are not a member of this organization');
  }

  const members = await db.query<MemberWithProfile>(
    `select
       om.organization_id, om.user_id, om.role,
       om.provisioning_source, om.provisioned_at, om.joined_at,
       p.email, p.display_name, p.avatar_url
     from public.organization_members om
     left join public.profiles p on p.id = om.user_id
     where om.organization_id = $1
     order by om.joined_at asc`,
    [organizationId],
  );

  return NextResponse.json({ members: members.map((member) => formatMember(member, userId)) });
}

/**
 * POST /api/settings/team
 * Add an existing AGI account to the organization by email.
 *
 * There is no invitation persistence or email delivery system in this repo,
 * so unknown addresses fail with an actionable message and create no row.
 */
async function handleAddMember(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invite');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => ({}));
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId, email, role } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId, organizationId);

  const member = await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      // Ordering nicety only. Correctness rests on the
      // `organizations_seats_within_license` CHECK and the row lock the seat
      // trigger takes on the organization row (0085) — this advisory lock is
      // NOT the guarantee, because not every membership writer takes it.
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [organizationId],
      );

      const [requesterMembership] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
       where organization_id = $1 and user_id = $2
       limit 1`,
        [organizationId, userId],
      );

      if (!requesterMembership) {
        throw createError.forbidden('You are not a member of this organization');
      }
      if (!['owner', 'admin'].includes(requesterMembership.role)) {
        throw createError.forbidden('Only owners and admins can add team members');
      }

      // Release seats held by invitations that have already lapsed, so a dead
      // invitation can never block a live seat grant.
      await expirePendingInvitations(tx, organizationId);

      const [targetProfile] = await tx.query<
        Pick<ProfileRow, 'id' | 'email' | 'display_name' | 'avatar_url'>
      >(
        `select id, email, display_name, avatar_url
       from public.profiles
       where lower(email) = lower($1)
       limit 1`,
        [email],
      );

      if (!targetProfile) {
        // This route adds an EXISTING account directly. Onboarding someone who
        // has no account yet is what the invitation lifecycle is for, so point
        // there rather than dead-ending. No email is sent from either path —
        // the invitation endpoint returns a link the inviter delivers.
        throw createError.validation(
          'No AGI account uses that email. Send an invitation instead: POST /api/settings/team/invitations returns a link you deliver yourself. No email was sent.',
        );
      }

      const [existing] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
       where organization_id = $1 and user_id = $2
       limit 1`,
        [organizationId, targetProfile.id],
      );

      if (existing) {
        throw createError.conflict('This user is already a member of the organization');
      }

      // NO read-then-write seat check here. `organizations.seats_consumed` is
      // moved by an AFTER INSERT trigger and bounded by the
      // `organizations_seats_within_license` CHECK, so the INSERT below is what
      // enforces the ceiling. Two admins racing for the last seat serialize on
      // the organization row lock and the loser aborts with 23514, which
      // withSeatAccountingErrors turns into an actionable 409. A count read here
      // would let both of them pass.
      const [created] = await tx.query<MemberWithProfile>(
        `insert into public.organization_members
         (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
       values ($1, $2, $3, 'manual', now(), now())
       returning
         organization_id, user_id, role, provisioning_source, provisioned_at, joined_at,
         $4::text as email, $5::text as display_name, $6::text as avatar_url`,
        [
          organizationId,
          targetProfile.id,
          role,
          targetProfile.email ?? email,
          targetProfile.display_name ?? targetProfile.email ?? email,
          targetProfile.avatar_url,
        ],
      );

      if (!created) {
        throw createError.conflict('The team member could not be added');
      }
      return created;
    }),
  );

  logger.info({ userId, organizationId, targetUserId: member.user_id }, 'Team member added');

  // Audit: membership grant. Org-scoped, so it is dual-written to
  // enterprise_audit_events for the org-admin audit export. The target's email
  // is intentionally omitted — the stable user id is enough to trace, and an
  // audit trail should not become a second copy of the directory.
  await recordAuditEvent({
    userId,
    eventType: 'member_invited',
    request,
    organizationId,
    detail: {
      resourceType: 'organization_member',
      resourceId: member.user_id,
      organizationId,
      targetUserId: member.user_id,
      role: member.role,
    },
  });

  return NextResponse.json({ member: formatMember(member, userId) }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleAddMember);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
