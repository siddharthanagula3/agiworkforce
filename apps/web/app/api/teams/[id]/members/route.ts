/**
 * Team Members API
 *
 * POST /api/teams/[id]/members - invite a member (CSRF, admin or owner only)
 *   Body: { email: string; role: 'admin' | 'editor' | 'viewer' }
 *
 * PUT /api/teams/[id]/members - update a member's role (CSRF, admin or owner only)
 *   Body: { memberId: string; role: 'admin' | 'editor' | 'viewer' }
 *
 * DELETE /api/teams/[id]/members - remove a member (CSRF, admin or owner only)
 *   Query: ?memberId=<uuid>
 */

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { TeamRow, TeamMemberRow } from '@/lib/server/neon-types';

const VALID_ROLES = ['admin', 'editor', 'viewer'] as const;
type TeamRole = (typeof VALID_ROLES)[number];

/**
 * Verify the requesting user has admin or owner access to the team.
 * Returns 'owner' | 'admin' or throws a forbidden error.
 */
async function requireAdminAccess(
  db: DatabaseAdapter,
  teamId: string,
  userId: string,
): Promise<'owner' | 'admin'> {
  const [team] = await db.query<Pick<TeamRow, 'id' | 'owner_id'>>(
    `select id, owner_id from teams where id = $1 limit 1`,
    [teamId],
  );

  if (!team) {
    throw createError.notFound('Team not found');
  }

  if (team.owner_id === userId) {
    return 'owner';
  }

  const [membership] = await db.query<Pick<TeamMemberRow, 'role'>>(
    `select role from team_members where team_id = $1 and user_id = $2 limit 1`,
    [teamId, userId],
  );

  if (membership?.role !== 'admin') {
    throw createError.forbidden('Only team owners and admins can manage members');
  }

  return 'admin';
}

function mapRowToMember(row: Record<string, unknown>) {
  return {
    id: row['id'],
    teamId: row['team_id'],
    userId: row['user_id'],
    email: row['email'],
    name: row['name'] ?? '',
    role: row['role'],
    joinedAt: row['joined_at'],
  };
}

// ---------------------------------------------------------------------------
// POST /api/teams/[id]/members - invite a member
// ---------------------------------------------------------------------------

async function handleInviteMember(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  let body: { email?: string; role?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.email || typeof body.email !== 'string' || body.email.trim().length === 0) {
    throw createError.validation('Email is required');
  }
  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    throw createError.validation('Invalid email address');
  }
  if (body.email.length > 254) {
    throw createError.validation('Email must be 254 characters or less');
  }

  const role: TeamRole =
    typeof body.role === 'string' && (VALID_ROLES as readonly string[]).includes(body.role)
      ? (body.role as TeamRole)
      : 'viewer';

  const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : '';

  await requireAdminAccess(db, teamId, userId);

  // Look up the invitee by email using a targeted profiles query (O(1) index
  // lookup) instead of loading all users via listUsers() which is O(n) and
  // degrades as the user base grows.
  const normalizedEmail = body.email.trim().toLowerCase();
  let inviteeProfile: { id: string; email: string | null } | undefined;
  try {
    const [row] = await db.query<{ id: string; email: string | null }>(
      `select id, email from profiles where email = $1 limit 1`,
      [normalizedEmail],
    );
    inviteeProfile = row;
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to look up user profile for invite');
    throw createError.internal('Failed to invite member');
  }

  // If no matching user exists we still create the record, leaving
  // user_id as a placeholder UUID (same email used as lookup key). In a full
  // production flow you would send an invitation email; here we gracefully
  // allow the invite even if the account is not yet created - the RLS policy
  // uses user_id for access control so the invite is inert until the user
  // registers with that email.
  const inviteeUserId = inviteeProfile?.id ?? '00000000-0000-0000-0000-000000000000';
  const inviteeName = name || normalizedEmail.split('@')[0] || '';

  // Check for duplicate membership
  const [existing] = await db.query<{ id: string; role: string }>(
    `select id, role from team_members where team_id = $1 and email = $2 limit 1`,
    [teamId, body.email.trim().toLowerCase()],
  );

  if (existing) {
    throw createError.validation('This user is already a member of the team');
  }

  let member: TeamMemberRow;
  try {
    const [inserted] = await db.query<TeamMemberRow>(
      `insert into team_members (team_id, user_id, email, name, role)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [teamId, inviteeUserId, body.email.trim().toLowerCase(), inviteeName, role],
    );
    if (!inserted) throw new Error('No row returned');
    member = inserted;
  } catch (error) {
    logger.error({ error, userId, teamId }, 'Failed to invite member');
    throw createError.internal('Failed to invite member');
  }

  return NextResponse.json(
    { member: mapRowToMember(member as unknown as Record<string, unknown>) },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// PUT /api/teams/[id]/members - update a member's role
// ---------------------------------------------------------------------------

async function handleUpdateMemberRole(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  let body: { memberId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.memberId || typeof body.memberId !== 'string') {
    throw createError.validation('memberId is required');
  }
  if (!body.role || !(VALID_ROLES as readonly string[]).includes(body.role)) {
    throw createError.validation('role must be one of: admin, editor, viewer');
  }

  const callerAccess = await requireAdminAccess(db, teamId, userId);

  // Fetch the target member record
  const [targetMember] = await db.query<Pick<TeamMemberRow, 'id' | 'team_id' | 'user_id' | 'role'>>(
    `select id, team_id, user_id, role from team_members where id = $1 and team_id = $2 limit 1`,
    [body.memberId, teamId],
  );

  if (!targetMember) {
    throw createError.notFound('Member not found in this team');
  }

  // An admin cannot promote another member to admin - only the owner can do that.
  if (callerAccess === 'admin' && body.role === 'admin') {
    throw createError.forbidden('Only the team owner can promote members to admin');
  }

  // Prevent an admin from demoting another admin (only owner can do that).
  if (callerAccess === 'admin' && targetMember.role === 'admin') {
    throw createError.forbidden("Only the team owner can change another admin's role");
  }

  let updated: TeamMemberRow;
  try {
    const [row] = await db.query<TeamMemberRow>(
      `update team_members set role = $1 where id = $2 returning *`,
      [body.role, body.memberId],
    );
    if (!row) throw new Error('No row returned');
    updated = row;
  } catch (error) {
    logger.error(
      { error, userId, teamId, memberId: body.memberId },
      'Failed to update member role',
    );
    throw createError.internal('Failed to update member role');
  }

  return NextResponse.json({
    member: mapRowToMember(updated as unknown as Record<string, unknown>),
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/[id]/members - remove a member
// ---------------------------------------------------------------------------

async function handleRemoveMember(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get('memberId');

  if (!memberId || typeof memberId !== 'string') {
    throw createError.validation('memberId query parameter is required');
  }

  const callerAccess = await requireAdminAccess(db, teamId, userId);

  // Fetch the target member record
  const [targetMember] = await db.query<Pick<TeamMemberRow, 'id' | 'team_id' | 'user_id' | 'role'>>(
    `select id, team_id, user_id, role from team_members where id = $1 and team_id = $2 limit 1`,
    [memberId, teamId],
  );

  if (!targetMember) {
    throw createError.notFound('Member not found in this team');
  }

  // An admin cannot remove another admin - only the owner can do that.
  if (callerAccess === 'admin' && targetMember.role === 'admin') {
    throw createError.forbidden('Only the team owner can remove an admin');
  }

  try {
    await db.execute(`delete from team_members where id = $1 and team_id = $2`, [memberId, teamId]);
  } catch (error) {
    logger.error({ error, userId, teamId, memberId }, 'Failed to remove member');
    throw createError.internal('Failed to remove member');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleInviteMember);
export const PUT = withErrorHandler(handleUpdateMemberRole);
export const DELETE = withErrorHandler(handleRemoveMember);
