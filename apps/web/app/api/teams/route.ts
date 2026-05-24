/**
 * Teams API
 *
 * GET /api/teams - list teams the authenticated user owns or is a member of
 * POST /api/teams - create a new team (requires CSRF)
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

// ---------------------------------------------------------------------------
// GET /api/teams
// ---------------------------------------------------------------------------

async function handleGetTeams(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  // Fetch teams the user owns
  let ownedTeams: TeamRow[];
  try {
    ownedTeams = await db.query<TeamRow>(
      `select id, name, description, owner_id, created_at, updated_at
       from teams
       where owner_id = $1
       order by created_at desc`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch owned teams');
    throw createError.internal('Failed to fetch teams');
  }

  // Fetch teams the user is a member of (but does not own)
  let memberships: Pick<TeamMemberRow, 'team_id' | 'role' | 'joined_at'>[];
  try {
    memberships = await db.query<Pick<TeamMemberRow, 'team_id' | 'role' | 'joined_at'>>(
      `select team_id, role, joined_at from team_members where user_id = $1`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch team memberships');
    throw createError.internal('Failed to fetch teams');
  }

  const ownedIds = new Set(ownedTeams.map((t) => t.id));
  const memberTeamIds = memberships.map((m) => m.team_id).filter((id) => !ownedIds.has(id));

  let memberTeams: TeamRow[] = [];
  if (memberTeamIds.length > 0) {
    try {
      const placeholders = memberTeamIds.map((_, i) => `$${i + 1}`).join(', ');
      memberTeams = await db.query<TeamRow>(
        `select id, name, description, owner_id, created_at, updated_at
         from teams
         where id in (${placeholders})
         order by created_at desc`,
        memberTeamIds,
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch member teams');
      throw createError.internal('Failed to fetch teams');
    }
  }

  const membershipByTeamId = Object.fromEntries(
    memberships.map((m) => [m.team_id, { role: m.role, joinedAt: m.joined_at }]),
  );

  const allTeams = [
    ...ownedTeams.map((t) => ({
      ...mapRowToTeam(t as unknown as Record<string, unknown>),
      role: 'owner' as const,
      joinedAt: t.created_at,
    })),
    ...memberTeams.map((t) => ({
      ...mapRowToTeam(t as unknown as Record<string, unknown>),
      role: membershipByTeamId[t.id]?.role ?? 'viewer',
      joinedAt: membershipByTeamId[t.id]?.joinedAt ?? t.created_at,
    })),
  ];

  return NextResponse.json({ teams: allTeams });
}

// ---------------------------------------------------------------------------
// POST /api/teams
// ---------------------------------------------------------------------------

async function handleCreateTeam(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw createError.validation('Name is required');
  }
  if (body.name.length > 100) {
    throw createError.validation('Name must be 100 characters or less');
  }
  if (body.description && typeof body.description === 'string' && body.description.length > 500) {
    throw createError.validation('Description must be 500 characters or less');
  }

  let data: TeamRow;
  try {
    const [inserted] = await db.query<TeamRow>(
      `insert into teams (name, description, owner_id)
       values ($1, $2, $3)
       returning *`,
      [body.name.trim(), (body.description ?? '').trim(), userId],
    );
    if (!inserted) throw new Error('No row returned');
    data = inserted;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create team');
    throw createError.internal('Failed to create team');
  }

  return NextResponse.json(
    {
      team: {
        ...mapRowToTeam(data as unknown as Record<string, unknown>),
        role: 'owner',
        joinedAt: data.created_at,
      },
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGetTeams);
export const POST = withErrorHandler(handleCreateTeam);
