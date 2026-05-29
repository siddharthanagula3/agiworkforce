/**
 * Individual Team API
 *
 * GET /api/teams/[id] - fetch a single team with its members
 * PUT /api/teams/[id] - update team name/description (CSRF, admin or owner only)
 * DELETE /api/teams/[id] - delete a team (CSRF, owner only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { TeamRow, TeamMemberRow } from '@/lib/server/neon-types';

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  const [team] = await db.query<TeamRow>(
    `select id, name, description, owner_id, created_at, updated_at
     from teams where id = $1 limit 1`,
    [teamId],
  );

  if (!team) {
    throw createError.notFound('Team not found');
  }

  const isOwner = team.owner_id === userId;

  // Check if the user is a member
  let membership: Pick<TeamMemberRow, 'role'> | undefined;
  try {
    const [row] = await db.query<Pick<TeamMemberRow, 'role'>>(
      `select role from team_members where team_id = $1 and user_id = $2 limit 1`,
      [teamId, userId],
    );
    membership = row;
  } catch (error) {
    logger.error({ error, userId, teamId }, 'Failed to check membership');
    throw createError.internal('Failed to fetch team');
  }

  if (!isOwner && !membership) {
    throw createError.forbidden('You do not have access to this team');
  }

  // Fetch members
  let members: TeamMemberRow[];
  try {
    members = await db.query<TeamMemberRow>(
      `select id, team_id, user_id, email, name, role, joined_at
       from team_members where team_id = $1 order by joined_at asc`,
      [teamId],
    );
  } catch (error) {
    logger.error({ error, userId, teamId }, 'Failed to fetch team members');
    throw createError.internal('Failed to fetch team members');
  }

  const userRole = isOwner ? 'owner' : (membership?.role ?? 'viewer');

  return NextResponse.json({
    team: {
      ...mapRowToTeam(team as unknown as Record<string, unknown>),
      role: userRole,
      members: members.map((m) => mapRowToMember(m as unknown as Record<string, unknown>)),
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
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

  // Verify team exists and user has admin or owner access
  const [team] = await db.query<Pick<TeamRow, 'id' | 'owner_id'>>(
    `select id, owner_id from teams where id = $1 limit 1`,
    [teamId],
  );

  if (!team) {
    throw createError.notFound('Team not found');
  }

  const isOwner = team.owner_id === userId;

  if (!isOwner) {
    const [memberRow] = await db.query<Pick<TeamMemberRow, 'role'>>(
      `select role from team_members where team_id = $1 and user_id = $2 limit 1`,
      [teamId, userId],
    );
    if (memberRow?.role !== 'admin') {
      throw createError.forbidden('Only team owners and admins can update team settings');
    }
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    params.push(body.name.trim());
    setClauses.push(`name = $${params.length}`);
  }
  if (body.description !== undefined) {
    params.push(body.description.trim());
    setClauses.push(`description = $${params.length}`);
  }

  if (setClauses.length === 0) {
    throw createError.validation('No fields to update');
  }

  params.push(teamId);
  const idIdx = params.length;

  let updated: TeamRow;
  try {
    const [row] = await db.query<TeamRow>(
      `update teams set ${setClauses.join(', ')} where id = $${idIdx} returning *`,
      params,
    );
    if (!row) throw new Error('No row returned');
    updated = row;
  } catch (error) {
    logger.error({ error, userId, teamId }, 'Failed to update team');
    throw createError.internal('Failed to update team');
  }

  return NextResponse.json({
    team: mapRowToTeam(updated as unknown as Record<string, unknown>),
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: teamId } = await context.params;

  if (!teamId || typeof teamId !== 'string') {
    throw createError.validation('Invalid team ID');
  }

  // Only the owner may delete the team
  const [team] = await db.query<Pick<TeamRow, 'id' | 'owner_id'>>(
    `select id, owner_id from teams where id = $1 limit 1`,
    [teamId],
  );

  if (!team) {
    throw createError.notFound('Team not found');
  }

  if (team.owner_id !== userId) {
    throw createError.forbidden('Only the team owner can delete this team');
  }

  try {
    await db.execute(`delete from teams where id = $1`, [teamId]);
  } catch (error) {
    logger.error({ error, userId, teamId }, 'Failed to delete team');
    throw createError.internal('Failed to delete team');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetTeam);
export const PUT = withErrorHandler(handleUpdateTeam);
export const DELETE = withErrorHandler(handleDeleteTeam);
