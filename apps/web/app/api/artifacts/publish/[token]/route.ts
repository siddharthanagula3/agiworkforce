import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  unpublishArtifactRecord,
} from '@/lib/services/published-artifact-service';

/**
 * DELETE /api/artifacts/publish/[token] — take a published artifact offline.
 *
 * Unpublishing is the ONLY removal path for a published artifact: migration
 * 0095 ships no TTL because no expiry policy has been approved (founder-pending
 * for CAP-015). That makes this route the user's whole story for undoing a
 * publish, so it is owner-scoped twice — `user_id = $2` in the statement and
 * the owner-only RLS policy under `getUserScopedDb`.
 *
 * A token that does not exist and a token owned by someone else both return
 * 404, so this endpoint cannot be used to probe whether a given token is live.
 */

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleUnpublish(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  // Shape-check before any auth or database work: a malformed token can never
  // match a minted one, so there is nothing to look up.
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const deleted = await unpublishArtifactRecord(db, { userId, token });

  if (!deleted) {
    // Deliberately indistinguishable from "never existed" — see the header.
    throw createError.notFound('Published artifact not found');
  }

  return NextResponse.json({ success: true, token });
}

export const DELETE = withErrorHandler(handleUnpublish);
