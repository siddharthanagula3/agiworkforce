/**
 * Share API — POST /api/share
 *
 * Creates a shareable link for a conversation session.
 * Returns a token, URL, expiry, and message count.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient as createServerClient } from '@/utils/supabase/server';

const CreateShareSchema = z.object({
  title: z.string().min(1).max(200).default('Shared Session'),
  model_id: z.string().optional(),
  provider: z.string().optional(),
  messages: z.array(z.record(z.string(), z.unknown())).default([]),
});

// Sanitize messages — strip local absolute paths from display_args to avoid leaking local FS info
function sanitizeMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg['display_args'] && typeof msg['display_args'] === 'string') {
      return {
        ...msg,
        display_args: (msg['display_args'] as string).replace(
          /\/[^\s"']*(\/[^\s"']+)+/g,
          '[local-path]',
        ),
      };
    }
    return msg;
  });
}

async function handleCreateShare(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  // Auth via SSR client (cookie-based)
  const supabaseServer = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser();
  if (authError || !user) {
    throw createError.unauthorized();
  }

  // Validate body
  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is fine — defaults applied by schema
  }

  const parsed = CreateShareSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const { title, model_id, provider, messages } = parsed.data;

  // Generate 24-char base64url token (144 bits entropy)
  const token = randomBytes(18).toString('base64url');

  const sanitizedMessages = sanitizeMessages(messages);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Use service role client for the insert (bypasses RLS owner_id check on server)
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('shared_sessions')
    .insert({
      token,
      owner_id: user.id,
      title,
      model_id,
      provider,
      messages: sanitizedMessages,
      total_messages: sanitizedMessages.length,
      expires_at: expiresAt,
    })
    .select('token, expires_at, total_messages')
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create shared session');
    throw createError.internal('Failed to create share');
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const shareUrl = `${appUrl}/share/${data.token}`;

  return NextResponse.json(
    {
      shareUrl,
      token: data.token,
      expiresAt: data.expires_at,
      messageCount: data.total_messages,
    },
    { status: 201 },
  );
}

export const POST = withErrorHandler(handleCreateShare);
