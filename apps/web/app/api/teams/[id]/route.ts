/**
 * Individual Team API
 *
 * GET /api/teams/[id] - fetch a single team with its members
 * PUT /api/teams/[id] - update team name/description (CSRF, admin or owner only)
 * DELETE /api/teams/[id] - delete a team (CSRF, owner only)
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/api-auth';

function mapRowToTeam(row: Record<string, unknown>) {
  return {
    id: row['id'],
    name: row['name'],
    description: row['description'] ?? '',
    ownerId: row['owner_id'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
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
// GET /api/teams/[id]
// ---------------------------------------------------------------------------

async function handleGetTeam(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, description, owner_id, created_at, updated_at')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw createError.notFound('Team not found');
  }

  const teamRow = team as Record<string, unknown>;
  const isOwner = teamRow['owner_id'] === user.id;

  // Check if the user is a member
  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    logger.error({ error: membershipError, userId: user.id, teamId }, 'Failed to check membership');
    throw createError.internal('Failed to fetch team');
  }

  if (!isOwner && !membership) {
    throw createError.forbidden('You do not have access to this team');
  }

  // Fetch members
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('id, team_id, user_id, email, name, role, joined_at')
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    logger.error({ error: membersError, userId: user.id, teamId }, 'Failed to fetch team members');
    throw createError.internal('Failed to fetch team members');
  }

  const userRole = isOwner ? 'owner' : (membership?.['role'] ?? 'viewer');

  return NextResponse.json({
    team: {
      ...mapRowToTeam(teamRow),
      role: userRole,
      members: (members || []).map((m) => mapRowToMember(m as Record<string, unknown>)),
    },
  });
}

// ---------------------------------------------------------------------------
// PUT /api/teams/[id]
// ---------------------------------------------------------------------------

async function handleUpdateTeam(
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

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw createError.validation('Name must be a non-empty string');
    }
    if (body.name.length > 100) {
      throw createError.validation('Name must be 100 characters or less');
    }
  }
  if (
    body.description !== undefined &&
    typeof body.description === 'string' &&
    body.description.length > 500
  ) {
    throw createError.validation('Description must be 500 characters or less');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify team exists and user has admin or owner access
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, owner_id')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw createError.notFound('Team not found');
  }

  const teamRow = team as Record<string, unknown>;
  const isOwner = teamRow['owner_id'] === user.id;

  if (!isOwner) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .maybeSingle();

    const memberRole = (membership as Record<string, unknown> | null)?.['role'];
    if (memberRole !== 'admin') {
      throw createError.forbidden('Only team owners and admins can update team settings');
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData['name'] = body.name.trim();
  if (body.description !== undefined) updateData['description'] = body.description.trim();

  if (Object.keys(updateData).length === 0) {
    throw createError.validation('No fields to update');
  }

  const { data: updated, error: updateError } = await supabase
    .from('teams')
    .update(updateData)
    .eq('id', teamId)
    .select()
    .single();

  if (updateError) {
    logger.error({ error: updateError, userId: user.id, teamId }, 'Failed to update team');
    throw createError.internal('Failed to update team');
  }

  return NextResponse.json({
    team: mapRowToTeam(updated as Record<string, unknown>),
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/[id]
// ---------------------------------------------------------------------------

async function handleDeleteTeam(
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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only the owner may delete the team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, owner_id')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw createError.notFound('Team not found');
  }

  const teamRow = team as Record<string, unknown>;
  if (teamRow['owner_id'] !== user.id) {
    throw createError.forbidden('Only the team owner can delete this team');
  }

  const { error: deleteError } = await supabase.from('teams').delete().eq('id', teamId);

  if (deleteError) {
    logger.error({ error: deleteError, userId: user.id, teamId }, 'Failed to delete team');
    throw createError.internal('Failed to delete team');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetTeam);
export const PUT = withErrorHandler(handleUpdateTeam);
export const DELETE = withErrorHandler(handleDeleteTeam);
