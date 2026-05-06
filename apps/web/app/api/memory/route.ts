/**
 * Memory API
 *
 * GET /api/memory - List all memories for the authenticated user
 * POST /api/memory - Create a new memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

async function handleGetMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client: no .eq('user_id') filter needed — DB enforces it.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  // [H7 fix] Clamp both bounds: limit must be 1-100, offset must be 0-10000
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  const { data, error } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch memories');
    throw createError.internal('Failed to fetch memories');
  }

  return NextResponse.json({
    memories: (data || []).map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
  });
}

async function handleCreateMemory(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client for all DB ops. user_id still needed for INSERT (RLS can't infer it).
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  let body: { content?: string; category?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    throw createError.validation('Content is required');
  }

  if (body.content.length > 10_000) {
    throw createError.validation('Content must be 10,000 characters or less');
  }

  const validSources = ['mobile', 'desktop', 'web', 'auto'];
  const source = validSources.includes(body.source ?? '') ? body.source : 'web';

  const { data, error } = await supabase
    .from('user_memories')
    .insert({
      user_id: user.id,
      content: body.content.trim(),
      category: body.category?.trim() || null,
      source,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create memory');
    throw createError.internal('Failed to create memory');
  }

  return NextResponse.json(
    {
      memory: {
        id: data.id,
        content: data.content,
        category: data.category,
        source: data.source,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGetMemories);
export const POST = withErrorHandler(handleCreateMemory);
