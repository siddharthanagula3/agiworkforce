/**
 * Single Memory API
 *
 * GET /api/memory/[id] - Get a single memory by ID
 * PUT /api/memory/[id] - Update memory content
 * DELETE /api/memory/[id] - Soft delete a memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client: .eq('user_id') not needed — DB enforces via RLS.
  const { userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  const { data, error } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (error || !data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({
    memory: {
      id: data.id,
      content: data.content,
      category: data.category,
      source: data.source,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

async function handleUpdateMemory(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client: .eq('user_id') not needed — DB enforces via RLS.
  const { userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  let body: { content?: string };
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

  const { data, error } = await supabase
    .from('user_memories')
    .update({
      content: body.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({
    memory: {
      id: data.id,
      content: data.content,
      category: data.category,
      source: data.source,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

async function handleDeleteMemory(request: NextRequest, context: RouteContext) {
  // AUDIT-008-006: CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-bound client: .eq('user_id') not needed — DB enforces via RLS.
  const { userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const { id } = await context.params;

  const { error } = await supabase
    .from('user_memories')
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('is_deleted', false);

  if (error) {
    logger.error({ error, memoryId: id }, 'Failed to delete memory');
    throw createError.internal('Failed to delete memory');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetMemory);
export const PUT = withErrorHandler(handleUpdateMemory);
export const DELETE = withErrorHandler(handleDeleteMemory);
