/**
 * Single Messaging Platform Config API
 *
 * GET /api/messaging/config/[platform] - Get config for one platform
 * DELETE /api/messaging/config/[platform] - Remove a messaging connection
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

type RouteContext = { params: Promise<{ platform: string }> };

async function handleGetPlatformConfig(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  const db = getNeonDb();

  const [data] = await db.query<MessagingConnectionRow>(
    `select id, platform, config, is_active, connected_at, updated_at
     from messaging_connections
     where user_id = $1 and platform = $2
     limit 1`,
    [userId, platform],
  );

  if (!data) {
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

  const { userId } = await getClerkAuthUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  const db = getNeonDb();

  try {
    await db.execute('delete from messaging_connections where user_id = $1 and platform = $2', [
      userId,
      platform,
    ]);
  } catch (err) {
    logger.error({ err, userId, platform }, 'Failed to delete messaging connection');
    throw createError.internal('Failed to delete messaging connection');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetPlatformConfig);
export const DELETE = withErrorHandler(handleDeletePlatformConfig);
