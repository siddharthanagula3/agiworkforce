/**
 * Projects API
 *
 * GET /api/projects - List all projects for the authenticated user
 * POST /api/projects - Create a new project
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

async function handleGetProjects(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  const { data, error } = await supabase
    .from('user_projects')
    .select(
      'id, name, description, instructions, color, is_archived, metadata, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch projects');
    throw createError.internal('Failed to fetch projects');
  }

  return NextResponse.json({
    projects: (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      instructions: p.instructions,
      color: p.color,
      isArchived: p.is_archived,
      metadata: p.metadata,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  });
}

async function handleCreateProject(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    color?: string;
  };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw createError.validation('Name is required');
  }

  if (body.name.trim().length > 200) {
    throw createError.validation('Name must be 200 characters or less');
  }

  if (body.description !== undefined && body.description.length > 2_000) {
    throw createError.validation('Description must be 2,000 characters or less');
  }

  if (body.instructions !== undefined && body.instructions.length > 10_000) {
    throw createError.validation('Instructions must be 10,000 characters or less');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('user_projects')
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() ?? '',
      instructions: body.instructions?.trim() ?? '',
      color: body.color?.trim() || '#3b82f6',
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create project');
    throw createError.internal('Failed to create project');
  }

  return NextResponse.json(
    {
      project: {
        id: data.id,
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        color: data.color,
        isArchived: data.is_archived,
        metadata: data.metadata,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGetProjects);
export const POST = withErrorHandler(handleCreateProject);
