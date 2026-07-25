/**
 * Shared Conversations API
 *
 * POST /api/shared - Store a packaged conversation and return its public URL.
 * GET  /api/shared?token=<token> - Retrieve a stored conversation by token.
 *
 * POST requires an authenticated user and records them as the owner.
 * GET is intentionally public — the unguessable token IS the capability, which
 * is the point of a share link.
 *
 * The conversation is stored in the Neon `shared_conversations` table and
 * expires after 30 days (enforced by the GET handler and a DB cron job).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SharedConversationRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';

// Maximum size in bytes for the messages payload (~2 MB).
const MAX_MESSAGES_BYTES = 2 * 1024 * 1024;
// UUID v4 pattern used to validate incoming tokens.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Maximum allowed title length.
const MAX_TITLE_LEN = 500;

function getDb() {
  return getNeonDb();
}

/** POST /api/shared - upload a packaged conversation */
async function handlePost(request: NextRequest) {
  // AUDIT-FIX BUG-19: this endpoint publishes caller-supplied content at a
  // first-party https://agiworkforce.com/shared/<token> URL. Leaving it
  // anonymous made the product's own domain a ready-made host for fabricated
  // "AI conversations" — a phishing and disinformation primitive carrying the
  // brand's TLS and reputation — and left growth bounded only by a per-IP
  // limit. It also meant shares had no owner, so account deletion and data
  // export could not reach them.
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  // Rate-limit uploads to prevent abuse. Now keyed per user rather than per IP,
  // so a shared NAT does not pool one budget across unrelated people.
  const rateLimitResponse = await withRateLimit(request, 'share-create', `user:${userId}`);
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

  const db = getDb();
  try {
    await db.execute(
      'insert into shared_conversations (token, messages_json, title, expires_at, user_id) values ($1, $2, $3, $4, $5)',
      [token, messages, safeTitle, expiresAt.toISOString(), userId],
    );
  } catch (err: unknown) {
    // Duplicate token (23505) - return the existing URL instead of erroring.
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === '23505') {
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
      return NextResponse.json({ url: `${appUrl}/shared/${token}` });
    }
    logger.error({ error: err, token }, 'Failed to store shared conversation');
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

  const db = getDb();
  type ConvRow = Pick<SharedConversationRow, 'messages_json' | 'title' | 'expires_at'>;
  let rows: ConvRow[];
  try {
    rows = await db.query<ConvRow>(
      'select messages_json, title, expires_at from shared_conversations where token = $1 limit 1',
      [token],
    );
  } catch (err) {
    logger.error({ error: err, token }, 'Failed to fetch shared conversation');
    throw createError.internal('Failed to fetch conversation');
  }

  const data = rows[0];
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
