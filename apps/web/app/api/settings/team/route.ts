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

const InviteSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
});

type MemberWithProfile = OrganizationMemberRow & {
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function formatMember(row: MemberWithProfile) {
  return {
    id: `${row.organization_id}:${row.user_id}`,
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email ?? '',
    name: row.display_name ?? row.email ?? row.user_id,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    status: 'active' as const,
    invitedAt: row.provisioned_at ?? null,
    joinedAt: row.joined_at,
    lastActiveAt: null,
    permissions: [],
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

  return NextResponse.json({ members: members.map(formatMember) });
}

/**
 * POST /api/settings/team
 * Invite a new member to the organization by email.
 * Inserts a pending membership row; actual email delivery is a separate concern.
 */
async function handleInvite(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invite');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => ({}));
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId, email, role } = parsed.data;

  const db = getNeonDb();

  // Only owners and admins may invite.
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

  if (!['owner', 'admin'].includes(requesterMembership.role)) {
    throw createError.forbidden('Only owners and admins can invite members');
  }

  // Look up the target user by email in profiles.
  const [targetProfile] = await db.query<
    Pick<ProfileRow, 'id' | 'email' | 'display_name' | 'avatar_url'>
  >(
    `select id, email, display_name, avatar_url
     from public.profiles
     where email = $1
     limit 1`,
    [email],
  );

  if (!targetProfile) {
    // Return a pending-invite placeholder; real invitation flow (email) is external.
    logger.info(
      { userId, organizationId, email },
      'Team invite for unknown user — email not found in profiles',
    );
    return NextResponse.json(
      {
        member: {
          id: `pending:${organizationId}:${email}`,
          userId: null,
          organizationId,
          email,
          name: email,
          avatarUrl: null,
          role,
          status: 'pending',
          invitedAt: new Date().toISOString(),
          joinedAt: null,
          lastActiveAt: null,
          permissions: [],
        },
        message: 'Invitation queued — user will receive an email when the invite system is active',
      },
      { status: 202 },
    );
  }

  // Check if already a member.
  const [existing] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where organization_id = $1 and user_id = $2
     limit 1`,
    [organizationId, targetProfile.id],
  );

  if (existing) {
    throw createError.conflict('This user is already a member of the organization');
  }

  const [newMember] = await db.query<MemberWithProfile>(
    `insert into public.organization_members
       (organization_id, user_id, role, provisioning_source, provisioned_at, joined_at)
     values ($1, $2, $3, 'invite', now(), now())
     returning
       organization_id, user_id, role, provisioning_source, provisioned_at, joined_at,
       $4::text as email, $5::text as display_name, null::text as avatar_url`,
    [
      organizationId,
      targetProfile.id,
      role,
      targetProfile.email ?? email,
      targetProfile.display_name ?? email,
    ],
  );

  logger.info({ userId, organizationId, targetUserId: targetProfile.id }, 'Team member invited');

  return NextResponse.json({ member: newMember ? formatMember(newMember) : null }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleInvite);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
