import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  compareSemanticVersions,
  desktopReleaseChannelForVersion,
  fetchDesktopAssetSignature,
  fetchLatestDesktopRelease,
  selectSignedDesktopUpdaterAsset,
  type DesktopReleasePlatform,
} from '@/lib/releases/github-desktop-releases';

const TARGET_PLATFORMS: Readonly<Record<string, DesktopReleasePlatform>> = {
  'darwin-aarch64': 'darwin-aarch64',
  'darwin-x86_64': 'darwin-x86_64',
  'windows-x86_64': 'windows-x86_64',
  'linux-x86_64': 'linux-x86_64',
  'linux-x86_64-appimage': 'linux-x86_64',
};

function noUpdateResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
  });
}

async function handleReleaseCheck(
  request: NextRequest,
  { params }: { params: Promise<{ target: string; version: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { target, version } = await params;
  if (!target || !version) {
    throw createError.validation('Missing target or version parameter');
  }

  const platform = TARGET_PLATFORMS[target];
  if (!platform) return noUpdateResponse();
  const channel = desktopReleaseChannelForVersion(version);
  if (!channel) {
    throw createError.validation('Invalid version format');
  }

  const release = await fetchLatestDesktopRelease(channel);
  if (!release || compareSemanticVersions(release.version, version) !== 1) {
    return noUpdateResponse();
  }

  const updaterAsset = selectSignedDesktopUpdaterAsset(release, platform);
  if (!updaterAsset) {
    logger.warn({ platform, tagName: release.tagName }, 'Signed desktop updater asset missing');
    return noUpdateResponse();
  }

  const signature = await fetchDesktopAssetSignature(updaterAsset.signature);
  if (!signature) return noUpdateResponse();

  return NextResponse.json({
    version: release.version,
    notes: release.notes,
    pub_date: release.publishedAt,
    platforms: {
      [target]: {
        url: updaterAsset.binary.browserDownloadUrl,
        signature,
      },
    },
  });
}

export const GET = withErrorHandler(handleReleaseCheck);
