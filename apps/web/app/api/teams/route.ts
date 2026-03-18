/**
 * Teams API
 *
 * GET /api/teams — list teams the authenticated user owns or is a member of
 * POST /api/teams — create a new team (requires CSRF)
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    return data.user;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

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

  const user = await getAuthenticatedUser(request);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch teams the user owns
  const { data: ownedTeams, error: ownedError } = await supabase
    .from('teams')
    .select('id, name, description, owner_id, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (ownedError) {
    logger.error({ error: ownedError, userId: user.id }, 'Failed to fetch owned teams');
    throw createError.internal('Failed to fetch teams');
  }

  // Fetch teams the user is a member of (but does not own)
  const { data: memberships, error: memberError } = await supabase
    .from('team_members')
    .select('team_id, role, joined_at')
    .eq('user_id', user.id);

  if (memberError) {
    logger.error({ error: memberError, userId: user.id }, 'Failed to fetch team memberships');
    throw createError.internal('Failed to fetch teams');
  }

  const memberTeamIds = (memberships || [])
    .map((m) => m['team_id'] as string)
    .filter((id) => !(ownedTeams || []).some((t) => t['id'] === id));

  let memberTeams: Record<string, unknown>[] = [];
  if (memberTeamIds.length > 0) {
    const { data: memberTeamRows, error: memberTeamError } = await supabase
      .from('teams')
      .select('id, name, description, owner_id, created_at, updated_at')
      .in('id', memberTeamIds)
      .order('created_at', { ascending: false });

    if (memberTeamError) {
      logger.error({ error: memberTeamError, userId: user.id }, 'Failed to fetch member teams');
      throw createError.internal('Failed to fetch teams');
    }
    memberTeams = (memberTeamRows || []) as Record<string, unknown>[];
  }

  const membershipByTeamId = Object.fromEntries(
    (memberships || []).map((m) => [m['team_id'], { role: m['role'], joinedAt: m['joined_at'] }]),
  );

  const allTeams = [
    ...(ownedTeams || []).map((t) => ({
      ...mapRowToTeam(t as Record<string, unknown>),
      role: 'owner' as const,
      joinedAt: t['created_at'],
    })),
    ...memberTeams.map((t) => ({
      ...mapRowToTeam(t),
      role: membershipByTeamId[t['id'] as string]?.role ?? 'viewer',
      joinedAt: membershipByTeamId[t['id'] as string]?.joinedAt ?? t['created_at'],
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

  const user = await getAuthenticatedUser(request);

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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: body.name.trim(),
      description: (body.description ?? '').trim(),
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create team');
    throw createError.internal('Failed to create team');
  }

  return NextResponse.json(
    {
      team: {
        ...mapRowToTeam(data as Record<string, unknown>),
        role: 'owner',
        joinedAt: (data as Record<string, unknown>)['created_at'],
      },
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGetTeams);
export const POST = withErrorHandler(handleCreateTeam);
