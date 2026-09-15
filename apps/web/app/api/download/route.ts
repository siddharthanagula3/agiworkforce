import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestStableDesktopRelease,
  resolveDesktopCloudReleaseRepository,
  type StableDesktopRelease,
} from '@/lib/releases/github-desktop-releases';
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

type MacArchitecture = 'arm64' | 'x64';

const DESKTOP_INSTALLER_FILENAME = 'agiworkforce.dmg';

function macInstallerAsset(release: StableDesktopRelease, architecture: MacArchitecture | null) {
  const installers = release.assets.filter((asset) => asset.name.endsWith('.dmg'));
  const arm64 = installers.find((asset) => /arm64|aarch64/i.test(asset.name)) ?? null;
  const x64 = installers.find((asset) => /x64|x86_64/i.test(asset.name)) ?? null;
  if (architecture === 'arm64') return arm64;
  if (architecture === 'x64') return x64;
  return arm64 ?? x64 ?? installers[0] ?? null;
}

function unavailable(platform: string) {
  return NextResponse.json({ error: 'Installer unavailable', platform }, { status: 503 });
}

async function handleDownload(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'download');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const app = searchParams.get('app');
  const architecture = searchParams.get('arch');

  logger.info(
    {
      clientIp,
      userAgent: userAgent.substring(0, 200),
      platform,
      app,
      architecture,
      timestamp: new Date().toISOString(),
    },
    'Download request received',
  );

  if (!platform || !['mac', 'windows', 'linux'].includes(platform)) {
    throw createError.validation('Invalid platform requested. Must be mac, windows, or linux.');
  }
  if (app !== null && app !== 'cloud') {
    throw createError.validation('Invalid app requested. Omit the parameter or use app=cloud.');
  }
  if (architecture !== null && (platform !== 'mac' || !['arm64', 'x64'].includes(architecture))) {
    throw createError.validation(
      'Invalid architecture requested. macOS installers are arm64 or x64.',
    );
  }
  if (platform !== 'mac') return unavailable(platform);

  const release = await fetchLatestStableDesktopRelease({
    ...resolveDesktopCloudReleaseRepository(),
    tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
    revalidateSeconds: 0,
  });
  const asset = release ? macInstallerAsset(release, architecture as MacArchitecture | null) : null;
  if (!asset) return unavailable(platform);

  const downloadUrl = asset.browserDownloadUrl;
  if (!isTrustedReleaseAssetUrl(downloadUrl)) {
    throw createError.serviceUnavailable('Release asset URL is not trusted');
  }

  const fileResponse = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!fileResponse.ok) {
    throw createError.serviceUnavailable('Failed to fetch installer from GitHub');
  }

  return new NextResponse(fileResponse.body, {
    status: 200,
    headers: {
      'Content-Type': fileResponse.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': fileResponse.headers.get('Content-Length') || '',
      'Content-Disposition': `attachment; filename="${DESKTOP_INSTALLER_FILENAME}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export const GET = withErrorHandler(handleDownload);
