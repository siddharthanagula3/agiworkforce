import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

const DOWNLOAD_URL_ENV: Record<string, string> = {
  mac: 'NEXT_PUBLIC_DOWNLOAD_URL_MAC',
  windows: 'NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS',
  linux: 'NEXT_PUBLIC_DOWNLOAD_URL_LINUX',
};

async function handleDownloadBeta(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'download-beta');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'mac';

  const envVar = DOWNLOAD_URL_ENV[platform];
  if (!envVar) {
    throw createError.validation('Invalid platform. Must be mac, windows, or linux.');
  }

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  const { entitled } = await resolveEntitlementBundle(db, userId);
  if (!entitled) {
    throw createError.forbidden('Active subscription required to download.');
  }

  const externalUrl = process.env[envVar];
  if (!externalUrl) {
    throw createError.notFound(`Download for ${platform} is currently unavailable.`);
  }
  if (!isTrustedReleaseAssetUrl(externalUrl)) {
    throw createError.validation(
      'Download redirect target is not on the allowlist. ' +
        'Set NEXT_PUBLIC_DOWNLOAD_URL_* to an https URL on our own download host or a github.com release.',
    );
  }
  return NextResponse.redirect(externalUrl, { status: 307 });
}

export const GET = withErrorHandler(handleDownloadBeta);
