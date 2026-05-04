/**
 * Shared Conversations API
 *
 * POST /api/shared - Store a packaged conversation and return its public URL.
 * GET  /api/shared?token=<token> - Retrieve a stored conversation by token.
 *
 * POST requires no authentication - the share token acts as the capability.
 * The conversation is stored in the `shared_conversations` Supabase table and
 * expires after 30 days (enforced by the GET handler and a DB cron job).
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';

// Maximum size in bytes for the messages payload (~2 MB).
const MAX_MESSAGES_BYTES = 2 * 1024 * 1024;
// UUID v4 pattern used to validate incoming tokens.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Maximum allowed title length.
const MAX_TITLE_LEN = 500;

function getAdminClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw createError.internal('Supabase is not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** POST /api/shared - upload a packaged conversation */
async function handlePost(request: NextRequest) {
  // Rate-limit uploads to prevent abuse.
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  if (typeof body !== 'object' || body === null) {
    throw createError.validation('Request body must be a JSON object');
  }

  const { token, messages, title } = body as Record<string, unknown>;

  if (typeof token !== 'string' || !UUID_V4_RE.test(token)) {
    throw createError.validation('token must be a valid UUID v4 string');
  }

  if (typeof messages !== 'string') {
    throw createError.validation('messages must be a JSON string');
  }

  if (new TextEncoder().encode(messages).length > MAX_MESSAGES_BYTES) {
    throw createError.validation('messages payload exceeds 2 MB limit');
  }

  // Validate messages is parseable JSON before storing.
  try {
    JSON.parse(messages);
  } catch {
    throw createError.validation('messages must be valid JSON');
  }

  const safeTitle =
    typeof title === 'string' ? title.slice(0, MAX_TITLE_LEN) : 'Shared Conversation';

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const supabase = getAdminClient();
  const { error } = await supabase.from('shared_conversations').insert({
    token,
    messages_json: messages,
    title: safeTitle,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    // Duplicate token - return the existing URL instead of erroring.
    if (error.code === '23505') {
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
      return NextResponse.json({ url: `${appUrl}/shared/${token}` });
    }
    logger.error({ error, token }, 'Failed to store shared conversation');
    throw createError.internal('Failed to store conversation');
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const url = `${appUrl}/shared/${token}`;
  return NextResponse.json({ url }, { status: 201 });
}

/** GET /api/shared?token=<token> - retrieve a stored conversation */
async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const token = request.nextUrl.searchParams.get('token');

  if (!token || !UUID_V4_RE.test(token)) {
    throw createError.validation('token query parameter must be a valid UUID v4 string');
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('shared_conversations')
    .select('messages_json, title, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    logger.error({ error, token }, 'Failed to fetch shared conversation');
    throw createError.internal('Failed to fetch conversation');
  }

  if (!data) {
    throw createError.notFound('Shared conversation not found');
  }

  if (new Date(data.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This shared link has expired' }, { status: 410 });
  }

  let messages: unknown;
  try {
    messages = JSON.parse(data.messages_json as string);
  } catch {
    throw createError.internal('Stored conversation data is malformed');
  }

  return NextResponse.json({
    messages,
    title: data.title,
  });
}

export const POST = withErrorHandler(handlePost);
export const GET = withErrorHandler(handleGet);
