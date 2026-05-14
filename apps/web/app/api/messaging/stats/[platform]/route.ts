/**
 * Messaging Stats API
 *
 * GET /api/messaging/stats/[platform] - Get message stats for a platform
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/api-auth';

const VALID_PLATFORMS = ['whatsapp', 'telegram', 'slack'] as const;

type RouteContext = { params: Promise<{ platform: string }> };

async function handleGetStats(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // Authenticate the user to ensure they have access
  await getAuthenticatedUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  // Return mock stats for now - actual message tracking comes in a later phase
  return NextResponse.json({
    messagesSent: 0,
    messagesReceived: 0,
    lastActive: null,
  });
}

export const GET = withErrorHandler(handleGetStats);
