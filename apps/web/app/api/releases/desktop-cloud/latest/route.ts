import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getOptionalEnv } from '@shared/utils/env';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestDesktopRelease,
} from '@/lib/releases/github-desktop-releases';

/**
 * GET /api/releases/desktop-cloud/latest
 *
 * Availability probe for the AGI Cloud desktop shell (the Electron app,
 * released under `v-cloud-desktop-*` tags by
 * .github/workflows/release-desktop-cloud.yml). Used by the public download
 * page to decide whether to show the macOS download button. This is NOT the
 * auto-update feed — electron-updater's feed lands under
 * /api/releases/electron/mac/* in a later phase.
 */
async function handleGetLatestCloudDesktopRelease(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const release = await fetchLatestDesktopRelease('stable', {
    tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
    owner: getOptionalEnv('DESKTOP_CLOUD_GITHUB_OWNER') ?? 'siddharthanagula3',
    repo: getOptionalEnv('DESKTOP_CLOUD_GITHUB_REPO') ?? 'agiworkforce',
  });

  const macInstaller = release?.assets.find(
    (asset) => asset.name.endsWith('.dmg') && /arm64|aarch64|x64|x86_64/i.test(asset.name),
  );
  if (!release || !macInstaller) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No cloud desktop release is published' } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      version: release.version,
      publishedAt: release.publishedAt,
      platforms: { mac: true },
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  );
}

export const GET = withErrorHandler(handleGetLatestCloudDesktopRelease);
