import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestStableDesktopRelease,
  selectDesktopInstallerAsset,
  type DesktopDownloadPlatform,
  type StableDesktopRelease,
} from '@/lib/releases/github-desktop-releases';
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

const REPO_OWNER = process.env['DESKTOP_GITHUB_OWNER'] || 'siddharthanagula3';
const REPO_NAME = process.env['DESKTOP_GITHUB_REPO'] || 'agiworkforce-desktop-app';
const CLOUD_REPO_OWNER = process.env['DESKTOP_CLOUD_GITHUB_OWNER'] || 'siddharthanagula3';
const CLOUD_REPO_NAME = process.env['DESKTOP_CLOUD_GITHUB_REPO'] || 'agiworkforce';

function selectCloudMacInstallerAsset(
  release: StableDesktopRelease,
  architecture: 'arm64' | 'x64' | null,
) {
  if (architecture === 'arm64') {
    return (
      release.assets.find((a) => a.name.endsWith('.dmg') && /arm64|aarch64/i.test(a.name)) ?? null
    );
  }
  if (architecture === 'x64') {
    return (
      release.assets.find((a) => a.name.endsWith('.dmg') && /x64|x86_64/i.test(a.name)) ?? null
    );
  }
  return (
    release.assets.find((a) => a.name.endsWith('.dmg') && /arm64|aarch64/i.test(a.name)) ??
    release.assets.find((a) => a.name.endsWith('.dmg') && /x64|x86_64/i.test(a.name)) ??
    release.assets.find((a) => a.name.endsWith('.dmg')) ??
    null
  );
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
      userAgent: userAgent.substring(0, 200), // Truncate to prevent log injection
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
  if (app === 'cloud' && platform !== 'mac') {
    throw createError.validation('The AGI Cloud desktop app is currently macOS only.');
  }
  if (architecture !== null && (app !== 'cloud' || !['arm64', 'x64'].includes(architecture))) {
    throw createError.validation(
      'Invalid architecture requested. AGI Cloud supports arm64 or x64 installers.',
    );
  }

  const release =
    app === 'cloud'
      ? await fetchLatestStableDesktopRelease({
          owner: CLOUD_REPO_OWNER,
          repo: CLOUD_REPO_NAME,
          tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
          revalidateSeconds: 0,
        })
      : await fetchLatestStableDesktopRelease({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          revalidateSeconds: 0,
        });
  if (!release) return fallbackToStatic(platform, request, app);

  const asset =
    app === 'cloud'
      ? selectCloudMacInstallerAsset(release, architecture as 'arm64' | 'x64' | null)
      : selectDesktopInstallerAsset(release, platform as DesktopDownloadPlatform);

  if (asset) {
    const cleanFilenames: Record<string, string> = {
      mac: app === 'cloud' ? 'agiworkforce-cloud.dmg' : 'agiworkforce.dmg',
      windows: 'agiworkforce-setup.exe',
      linux: 'agiworkforce.AppImage',
    };

    const downloadUrl = asset.browserDownloadUrl;
    if (!isTrustedReleaseAssetUrl(downloadUrl)) {
      throw createError.serviceUnavailable('Release asset URL is not trusted');
    }
    const filename = cleanFilenames[platform] || asset.name;

    const fileResponse = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!fileResponse.ok) {
      throw createError.serviceUnavailable('Failed to fetch installer from GitHub');
    }

    const safeAsciiFilename = Array.from(filename, (char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 || char === '"' || char === '\\' ? '_' : char;
    }).join('');
    const utf8Filename = encodeURIComponent(filename);
    const contentDisposition = `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${utf8Filename}`;

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers: {
        'Content-Type': fileResponse.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': fileResponse.headers.get('Content-Length') || '',
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  }

  return fallbackToStatic(platform, request, app);
}

function fallbackToStatic(platform: string, request: Request, app: string | null = null) {
  if (app === 'cloud') {
    return NextResponse.json({ error: 'Installer unavailable', platform, app }, { status: 503 });
  }
  const downloadUrls: Record<string, string | undefined> = {
    mac: process.env['NEXT_PUBLIC_DOWNLOAD_URL_MAC'] || undefined,
    windows: process.env['NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS'] || undefined,
    linux: process.env['NEXT_PUBLIC_DOWNLOAD_URL_LINUX'] || undefined,
  };

  const url = downloadUrls[platform];

  if (!url) {
    return NextResponse.json({ error: 'Installer unavailable', platform }, { status: 503 });
  }

  if (!url.startsWith('/') && !isTrustedReleaseAssetUrl(url)) {
    throw createError.validation(
      'Download redirect target is not on the allowlist. Set NEXT_PUBLIC_DOWNLOAD_URL_* to an https URL on our download host or trusted GitHub release.',
    );
  }

  const resolvedUrl = url.startsWith('/') ? `${new URL(request.url).origin}${url}` : url;

  return NextResponse.redirect(resolvedUrl, { status: 307 });
}

export const GET = withErrorHandler(handleDownload);
