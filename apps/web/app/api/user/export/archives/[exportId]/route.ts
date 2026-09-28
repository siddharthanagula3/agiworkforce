import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { DATA_EXPORT_ARCHIVE_VOLUME_PARAM } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError, isAppError } from '@/lib/errors';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { getIdentityProvider } from '@/lib/server/identity';
import { getPresignedPrivateDownloadUrl } from '@/lib/server/object-storage';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  DATA_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
  resolveDataExportDownload,
} from '@/lib/server/data-export-archive';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ exportId: string }> };

const UNAUTHORIZED_STATUS = 401;

function isBrowserNavigation(request: NextRequest): boolean {
  return (
    request.headers.get('sec-fetch-mode') === 'navigate' ||
    (request.headers.get('accept') ?? '').includes('text/html')
  );
}

function signInRedirect(request: NextRequest): NextResponse {
  const signInRoute = getIdentityProvider().middleware.signInRoute();
  const url = new URL(signInRoute.path, request.url);
  url.searchParams.set(
    signInRoute.redirectParam,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(url);
}

async function handleDownload(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  let scope: Awaited<ReturnType<typeof getUserScopedDb>>;
  try {
    scope = await getUserScopedDb(request);
  } catch (error) {
    if (
      isAppError(error) &&
      error.statusCode === UNAUTHORIZED_STATUS &&
      isBrowserNavigation(request)
    ) {
      return signInRedirect(request);
    }
    throw error;
  }
  const { db, userId } = scope;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-read', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const { exportId } = await context.params;
  const volume = Number(request.nextUrl.searchParams.get(DATA_EXPORT_ARCHIVE_VOLUME_PARAM) ?? '1');
  if (!Number.isSafeInteger(volume) || volume < 1) {
    throw createError.validation('This export part does not exist.');
  }

  const download = await resolveDataExportDownload(db, userId, exportId, volume);
  const url = await getPresignedPrivateDownloadUrl({
    key: download.key,
    fileName: download.fileName,
    expiresInSeconds: DATA_EXPORT_DOWNLOAD_URL_TTL_SECONDS,
  });
  return NextResponse.redirect(url);
}

export const GET = withPrivateNoStore(withErrorHandler(handleDownload));
