import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getOptionalEnv } from '@shared/utils/env';
import {
  DEFAULT_DESKTOP_RELEASE_OWNER,
  DEFAULT_DESKTOP_RELEASE_REPO,
  DESKTOP_CLOUD_TAG_PREFIX,
  compareSemanticVersions,
  fetchLatestDesktopRelease,
} from '@/lib/releases/github-desktop-releases';
import { desktopUpdateHeld } from '@/lib/releases/desktop-update-hold';

const ARCHIVE_ARCHITECTURES: Readonly<Record<string, RegExp>> = {
  arm64: /arm64|aarch64/i,
  x64: /x64|x86_64/i,
};

function noUpdateResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  });
}

async function handleCloudDesktopUpdateFeed(
  request: NextRequest,
  { params }: { params: Promise<{ arch: string; version: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) return rateLimitResponse;

  const { arch, version } = await params;
  const architecture = ARCHIVE_ARCHITECTURES[arch];
  if (!architecture || compareSemanticVersions(version, version) === null) {
    return noUpdateResponse();
  }
  if (await desktopUpdateHeld(request, version)) return noUpdateResponse();

  const release = await fetchLatestDesktopRelease('stable', {
    tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
    owner: getOptionalEnv('DESKTOP_CLOUD_GITHUB_OWNER') ?? DEFAULT_DESKTOP_RELEASE_OWNER,
    repo: getOptionalEnv('DESKTOP_CLOUD_GITHUB_REPO') ?? DEFAULT_DESKTOP_RELEASE_REPO,
  });
  if (!release || compareSemanticVersions(release.version, version) !== 1) {
    return noUpdateResponse();
  }

  const archive = release.assets.find(
    (asset) => asset.name.endsWith('.zip') && architecture.test(asset.name),
  );
  if (!archive) return noUpdateResponse();

  return NextResponse.json(
    {
      url: archive.browserDownloadUrl,
      name: release.version,
      notes: release.notes,
      pub_date: release.publishedAt,
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  );
}

export const GET = withErrorHandler(handleCloudDesktopUpdateFeed);
