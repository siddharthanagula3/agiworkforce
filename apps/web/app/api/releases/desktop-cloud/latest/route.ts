import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getOptionalEnv } from '@shared/utils/env';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestDesktopRelease,
} from '@/lib/releases/github-desktop-releases';

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

  const arm64Installer = release?.assets.find(
    (asset) => asset.name.endsWith('.dmg') && /arm64|aarch64/i.test(asset.name),
  );
  const x64Installer = release?.assets.find(
    (asset) => asset.name.endsWith('.dmg') && /x64|x86_64/i.test(asset.name),
  );
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
      architectures: { arm64: Boolean(arm64Installer), x64: Boolean(x64Installer) },
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  );
}

export const GET = withErrorHandler(handleGetLatestCloudDesktopRelease);
