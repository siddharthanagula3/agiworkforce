/**
 * Per-message operations
 *
 * PATCH /api/chat/conversations/[id]/messages/[messageId]
 *   Merges a patch into message.metadata. Currently used for user reactions
 *   (thumbsUp | thumbsDown | null) but intentionally generic so other metadata
 *   fields can be patched in future without a schema change.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const PatchMessageSchema = z.object({
  reaction: z.enum(['thumbsUp', 'thumbsDown']).nullable().optional(),
});

async function handlePatchMessage(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id: conversationId, messageId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const result = PatchMessageSchema.safeParse(rawBody);
  if (!result.success) {
    throw createError.validation('Invalid request body', result.error);
  }
  const patch = result.data;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Fetch current metadata so we can merge (preserves existing fields)
  const { data: row, error: fetchError } = await client
    .from('messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !row) {
    throw createError.notFound('Message not found');
  }

  const merged = { ...(row.metadata ?? {}), ...patch };

  const { error: updateError } = await client
    .from('messages')
    .update({ metadata: merged })
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  if (updateError) {
    throw createError.internal('Failed to update message');
  }

  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandler(handlePatchMessage);
