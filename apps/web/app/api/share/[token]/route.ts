/**
 * Share Token API
 *
 * GET  /api/share/[token] - fetch a shared session (public, rate-limited)
 * DELETE /api/share/[token] - revoke a shared session (owner only)
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient as createServerClient } from '@/utils/supabase/server';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

type RouteContext = { params: Promise<{ token: string }> };

async function handleGetShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('shared_sessions')
    .select(
      'id, token, title, model_id, provider, messages, total_messages, expires_at, created_at',
    )
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    throw createError.notFound('Shared session not found or expired');
  }

  return NextResponse.json(data);
}

async function handleDeleteShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const supabaseServer = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser();
  if (authError || !user) {
    throw createError.unauthorized();
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('shared_sessions')
    .delete()
    .eq('token', token)
    .eq('owner_id', user.id);

  if (error) {
    logger.error({ error, token, userId: user.id }, 'Failed to revoke shared session');
    throw createError.internal('Failed to revoke share');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetShare);
export const DELETE = withErrorHandler(handleDeleteShare);
