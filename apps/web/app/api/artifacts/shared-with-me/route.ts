import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ArtifactsSharedWithMeResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getIdentityProvider } from '@/lib/server/identity';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { clampPageSize, decodeKeysetCursor } from '@/lib/identity/pagination';
import {
  isSharedWithViewerCursor,
  listArtifactsSharedWithViewer,
} from '@/lib/services/published-site-viewer-service';

export const runtime = 'nodejs';

const SHARED_PAGE_SIZE = 24;

async function verifiedPrimaryEmail(userId: string): Promise<string | null> {
  const user = await getIdentityProvider().getUser(userId);
  if (!user?.primaryEmail || user.primaryEmailVerification !== 'verified') return null;
  return user.primaryEmail;
}

async function handleList(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = clampPageSize(rawLimit === null ? SHARED_PAGE_SIZE : Number(rawLimit));
  const rawCursor = url.searchParams.get('cursor');
  const cursor = decodeKeysetCursor(rawCursor);
  if (rawCursor !== null && (cursor === null || !isSharedWithViewerCursor(cursor))) {
    throw createError.validation('Invalid cursor');
  }

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const verifiedEmail = await verifiedPrimaryEmail(userId);
  if (!verifiedEmail) {
    const unverified: ArtifactsSharedWithMeResponse = {
      items: [],
      hasMore: false,
      nextCursor: null,
      emailVerified: false,
    };
    return NextResponse.json(unverified);
  }

  const page = await listArtifactsSharedWithViewer(db, { userId, verifiedEmail, limit, cursor });
  const shared: ArtifactsSharedWithMeResponse = {
    items: [...page.items],
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    emailVerified: true,
  };
  return NextResponse.json(shared);
}

export const GET = withErrorHandler(handleList);
