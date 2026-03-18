/**
 * Single Project API
 *
 * GET /api/projects/[id] - Get a single project by ID
 * PUT /api/projects/[id] - Update project fields
 * DELETE /api/projects/[id] - Delete a project
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
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetProject(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('user_projects')
    .select(
      'id, name, description, instructions, color, is_archived, metadata, created_at, updated_at',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
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
  });
}

async function handleUpdateProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    color?: string;
    isArchived?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw createError.validation('Name must be a non-empty string');
    }
    if (body.name.trim().length > 200) {
      throw createError.validation('Name must be 200 characters or less');
    }
  }

  if (body.description !== undefined && body.description.length > 2_000) {
    throw createError.validation('Description must be 2,000 characters or less');
  }

  if (body.instructions !== undefined && body.instructions.length > 10_000) {
    throw createError.validation('Instructions must be 10,000 characters or less');
  }

  // Build the update payload with only the fields that were provided
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates['name'] = body.name.trim();
  if (body.description !== undefined) updates['description'] = body.description.trim();
  if (body.instructions !== undefined) updates['instructions'] = body.instructions.trim();
  if (body.color !== undefined) updates['color'] = body.color.trim();
  if (body.isArchived !== undefined) updates['is_archived'] = body.isArchived;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('user_projects')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
    project: {
      id: data['id'],
      name: data['name'],
      description: data['description'],
      instructions: data['instructions'],
      color: data['color'],
      isArchived: data['is_archived'],
      metadata: data['metadata'],
      createdAt: data['created_at'],
      updatedAt: data['updated_at'],
    },
  });
}

async function handleDeleteProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('user_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    logger.error({ error, projectId: id }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetProject);
export const PUT = withErrorHandler(handleUpdateProject);
export const DELETE = withErrorHandler(handleDeleteProject);
