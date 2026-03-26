/**
 * Team Members API
 *
 * POST /api/teams/[id]/members — invite a member (CSRF, admin or owner only)
 *   Body: { email: string; role: 'admin' | 'editor' | 'viewer' }
 *
 * PUT /api/teams/[id]/members — update a member's role (CSRF, admin or owner only)
 *   Body: { memberId: string; role: 'admin' | 'editor' | 'viewer' }
 *
 * DELETE /api/teams/[id]/members — remove a member (CSRF, admin or owner only)
 *   Query: ?memberId=<uuid>
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/api-auth';

const VALID_ROLES = ['admin', 'editor', 'viewer'] as const;
type TeamRole = (typeof VALID_ROLES)[number];

/**
 * Verify the requesting user has admin or owner access to the team.
 * Returns 'owner' | 'admin' or throws a forbidden error.
 */
async function requireAdminAccess(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
): Promise<'owner' | 'admin'> {
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, owner_id')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw createError.notFound('Team not found');
  }

  const teamRow = team as Record<string, unknown>;
  if (teamRow['owner_id'] === userId) {
    return 'owner';
  }

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  const memberRole = (membership as Record<string, unknown> | null)?.['role'];
  if (memberRole !== 'admin') {
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
// POST /api/teams/[id]/members — invite a member
// ---------------------------------------------------------------------------

async function handleInviteMember(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await requireAdminAccess(supabase, teamId, user.id);

  // Look up the invitee by email using a targeted profiles query (O(1) index
  // lookup) instead of loading all users via listUsers() which is O(n) and
  // degrades as the user base grows.
  const normalizedEmail = body.email.trim().toLowerCase();
  const { data: inviteeProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileError) {
    logger.error({ error: profileError, teamId }, 'Failed to look up user profile for invite');
    throw createError.internal('Failed to invite member');
  }

  // If no matching Supabase user exists we still create the record, leaving
  // user_id as a placeholder UUID (same email used as lookup key). In a full
  // production flow you would send an invitation email; here we gracefully
  // allow the invite even if the account is not yet created — the RLS policy
  // uses user_id for access control so the invite is inert until the user
  // registers with that email.
  const inviteeUserId = inviteeProfile?.id ?? '00000000-0000-0000-0000-000000000000';
  const inviteeName = name || normalizedEmail.split('@')[0] || '';

  // Check for duplicate membership
  const { data: existing } = await supabase
    .from('team_members')
    .select('id, role')
    .eq('team_id', teamId)
    .eq('email', body.email.trim().toLowerCase())
    .maybeSingle();

  if (existing) {
    throw createError.validation('This user is already a member of the team');
  }

  const { data: member, error: insertError } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      user_id: inviteeUserId,
      email: body.email.trim().toLowerCase(),
      name: inviteeName,
      role,
    })
    .select()
    .single();

  if (insertError) {
    logger.error({ error: insertError, userId: user.id, teamId }, 'Failed to invite member');
    throw createError.internal('Failed to invite member');
  }

  return NextResponse.json(
    { member: mapRowToMember(member as Record<string, unknown>) },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// PUT /api/teams/[id]/members — update a member's role
// ---------------------------------------------------------------------------

async function handleUpdateMemberRole(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const callerAccess = await requireAdminAccess(supabase, teamId, user.id);

  // Fetch the target member record
  const { data: targetMember, error: memberError } = await supabase
    .from('team_members')
    .select('id, team_id, user_id, role')
    .eq('id', body.memberId)
    .eq('team_id', teamId)
    .single();

  if (memberError || !targetMember) {
    throw createError.notFound('Member not found in this team');
  }

  const targetRow = targetMember as Record<string, unknown>;

  // An admin cannot promote another member to admin — only the owner can do that.
  if (callerAccess === 'admin' && body.role === 'admin') {
    throw createError.forbidden('Only the team owner can promote members to admin');
  }

  // Prevent an admin from demoting another admin (only owner can do that).
  if (callerAccess === 'admin' && targetRow['role'] === 'admin') {
    throw createError.forbidden("Only the team owner can change another admin's role");
  }

  const { data: updated, error: updateError } = await supabase
    .from('team_members')
    .update({ role: body.role })
    .eq('id', body.memberId)
    .select()
    .single();

  if (updateError) {
    logger.error(
      { error: updateError, userId: user.id, teamId, memberId: body.memberId },
      'Failed to update member role',
    );
    throw createError.internal('Failed to update member role');
  }

  return NextResponse.json({ member: mapRowToMember(updated as Record<string, unknown>) });
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/[id]/members — remove a member
// ---------------------------------------------------------------------------

async function handleRemoveMember(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get('memberId');

  if (!memberId || typeof memberId !== 'string') {
    throw createError.validation('memberId query parameter is required');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const callerAccess = await requireAdminAccess(supabase, teamId, user.id);

  // Fetch the target member record
  const { data: targetMember, error: memberError } = await supabase
    .from('team_members')
    .select('id, team_id, user_id, role')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .single();

  if (memberError || !targetMember) {
    throw createError.notFound('Member not found in this team');
  }

  const targetRow = targetMember as Record<string, unknown>;

  // An admin cannot remove another admin — only the owner can do that.
  if (callerAccess === 'admin' && targetRow['role'] === 'admin') {
    throw createError.forbidden('Only the team owner can remove an admin');
  }

  const { error: deleteError } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId);

  if (deleteError) {
    logger.error(
      { error: deleteError, userId: user.id, teamId, memberId },
      'Failed to remove member',
    );
    throw createError.internal('Failed to remove member');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleInviteMember);
export const PUT = withErrorHandler(handleUpdateMemberRole);
export const DELETE = withErrorHandler(handleRemoveMember);
