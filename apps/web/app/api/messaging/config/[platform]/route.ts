/**
 * Single Messaging Platform Config API
 *
 * GET /api/messaging/config/[platform] - Get config for one platform
 * DELETE /api/messaging/config/[platform] - Remove a messaging connection
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

const VALID_PLATFORMS = ['whatsapp', 'telegram', 'slack'] as const;

type RouteContext = { params: Promise<{ platform: string }> };

async function handleGetPlatformConfig(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('messaging_connections')
    .select('id, platform, config, is_active, connected_at, updated_at')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .single();

  if (error || !data) {
    throw createError.notFound('Messaging connection not found');
  }

  return NextResponse.json({ connection: data });
}

async function handleDeletePlatformConfig(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('messaging_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', platform);

  if (error) {
    logger.error({ error, userId: user.id, platform }, 'Failed to delete messaging connection');
    throw createError.internal('Failed to delete messaging connection');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetPlatformConfig);
export const DELETE = withErrorHandler(handleDeletePlatformConfig);
