/**
 * Messaging Test Connection API
 *
 * POST /api/messaging/test/[platform] - Test connection to a messaging platform
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getAuthenticatedUser } from '@/lib/api-auth';

const VALID_PLATFORMS = ['whatsapp', 'telegram', 'slack'] as const;

type RouteContext = { params: Promise<{ platform: string }> };

/**
 * Validate that the config has the required fields for a given platform.
 */
function validatePlatformConfig(
  platform: string,
  config: Record<string, unknown>,
): { valid: boolean; error?: string } {
  switch (platform) {
    case 'whatsapp': {
      if (
        !config['phone'] ||
        typeof config['phone'] !== 'string' ||
        config['phone'].trim().length === 0
      ) {
        return { valid: false, error: 'WhatsApp requires a phone number' };
      }
      return { valid: true };
    }
    case 'telegram': {
      if (
        !config['token'] ||
        typeof config['token'] !== 'string' ||
        config['token'].trim().length === 0
      ) {
        return { valid: false, error: 'Telegram requires a bot token' };
      }
      return { valid: true };
    }
    case 'slack': {
      if (
        !config['workspaceUrl'] ||
        typeof config['workspaceUrl'] !== 'string' ||
        config['workspaceUrl'].trim().length === 0
      ) {
        return { valid: false, error: 'Slack requires a workspace URL' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: 'Unknown platform' };
  }
}

async function handleTestConnection(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  await getAuthenticatedUser(request);
  const { platform } = await context.params;

  if (!VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
    throw createError.validation('Invalid platform. Must be one of: whatsapp, telegram, slack');
  }

  let body: { config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const config = body.config ?? {};
  const validation = validatePlatformConfig(platform, config);

  if (!validation.valid) {
    return NextResponse.json({
      success: false,
      error: validation.error,
    });
  }

  // In a future phase, this would actually attempt to connect to the platform API.
  // For now, config field validation is sufficient to confirm the config shape is correct.
  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleTestConnection);
