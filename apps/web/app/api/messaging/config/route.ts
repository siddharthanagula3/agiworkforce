/**
 * Messaging Config API
 *
 * GET /api/messaging/config - List user's messaging connections
 * POST /api/messaging/config - Create/update a messaging connection
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

async function handleGetConfig(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('messaging_connections')
    .select('id, platform, is_active, connected_at, updated_at')
    .eq('user_id', user.id)
    .order('connected_at', { ascending: false });

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch messaging connections');
    throw createError.internal('Failed to fetch messaging connections');
  }

  return NextResponse.json({ connections: data || [] });
}

async function handlePostConfig(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  let body: { platform?: string; config?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const { platform, config } = body;

  if (!platform || !VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  if (!config || typeof config !== 'object') {
    throw createError.validation('Config must be a non-null object');
  }

  // Limit config size to prevent abuse
  const configKeys = Object.keys(config);
  if (configKeys.length > 20) {
    throw createError.validation('Config must have 20 or fewer keys');
  }
  for (const [key, value] of Object.entries(config)) {
    if (key.length > 100 || (typeof value === 'string' && value.length > 2000)) {
      throw createError.validation('Config key/value size limit exceeded');
    }
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('messaging_connections')
    .upsert(
      {
        user_id: user.id,
        platform,
        config,
        is_active: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    )
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id, platform }, 'Failed to upsert messaging connection');
    throw createError.internal('Failed to save messaging connection');
  }

  return NextResponse.json({ connection: data }, { status: 201 });
}

export const GET = withErrorHandler(handleGetConfig);
export const POST = withErrorHandler(handlePostConfig);
