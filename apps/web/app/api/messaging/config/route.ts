/**
 * Messaging Config API
 *
 * GET /api/messaging/config - List user's messaging connections
 * POST /api/messaging/config - Create/update a messaging connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import type { MessagingConnectionRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';

const VALID_PLATFORMS = ['whatsapp', 'telegram', 'slack'] as const;

async function handleGetConfig(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const connections = await db.query<
    Pick<MessagingConnectionRow, 'id' | 'platform' | 'is_active' | 'connected_at' | 'updated_at'>
  >(
    `select id, platform, is_active, connected_at, updated_at
     from messaging_connections
     where user_id = $1
     order by connected_at desc`,
    [userId],
  );

  return NextResponse.json({ connections });
}

async function handlePostConfig(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

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

  const db = getNeonDb();
  const now = new Date().toISOString();

  const [data] = await db.query<MessagingConnectionRow>(
    `insert into messaging_connections (user_id, platform, config, is_active, connected_at, updated_at)
     values ($1, $2, $3::jsonb, true, $4, $5)
     on conflict (user_id, platform)
     do update set
       config = excluded.config,
       is_active = true,
       connected_at = excluded.connected_at,
       updated_at = excluded.updated_at
     returning *`,
    [userId, platform, JSON.stringify(config), now, now],
  );

  if (!data) {
    logger.error({ userId, platform }, 'Failed to upsert messaging connection');
    throw createError.internal('Failed to save messaging connection');
  }

  return NextResponse.json({ connection: data }, { status: 201 });
}

export const GET = withErrorHandler(handleGetConfig);
export const POST = withErrorHandler(handlePostConfig);
