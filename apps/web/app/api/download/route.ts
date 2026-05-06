import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const REPO_OWNER = process.env['DESKTOP_GITHUB_OWNER'] || 'siddharthanagula3';
const REPO_NAME = process.env['DESKTOP_GITHUB_REPO'] || 'agiworkforce-desktop-app';

/**
 * PUBLIC ENDPOINT: Download route for desktop application installers.
 *
 * SECURITY NOTE: This endpoint is intentionally unauthenticated because:
 * 1. Desktop app downloads should be publicly accessible to encourage adoption
 * 2. The download files are already publicly hosted on GitHub releases
 * 3. Authentication happens within the desktop app after installation
 * 4. Rate limiting is applied at 30 requests/minute per IP to prevent abuse
 *
 * If download access needs to be restricted in the future (e.g., for beta builds),
 * add authentication by importing createSupabaseServerClient and checking user session.
 */
async function handleDownload(request: NextRequest) {
  // Rate limiting: 30 requests per minute per IP to prevent abuse
  const rateLimitResponse = await withRateLimit(request, 'download');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // AUDIT-P3-008-018: Log download requests for abuse detection
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');

  logger.info(
    {
      clientIp,
      userAgent: userAgent.substring(0, 200), // Truncate to prevent log injection
      platform,
      timestamp: new Date().toISOString(),
    },
    'Download request received',
  );

  if (!platform || !['mac', 'windows', 'linux'].includes(platform)) {
    throw createError.validation('Invalid platform requested. Must be mac, windows, or linux.');
  }

  // Fetch latest release from GitHub
  const githubResponse = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AGI-Workforce-Downloader',
        ...(process.env['GITHUB_TOKEN']
          ? { Authorization: `Bearer ${process.env['GITHUB_TOKEN']}` }
          : {}),
      },
      next: { revalidate: 0 }, // No cache - always fetch latest release
    },
  );

  if (!githubResponse.ok) {
    // Fallback to static files if GitHub fails
    logger.warn(
      { status: githubResponse.status, platform },
      'GitHub API failed, falling back to static download',
    );
    return fallbackToStatic(platform, request);
  }

  const release = await githubResponse.json();
  const assets = release.assets || [];

  let asset;
  // Match assets to platform
  if (platform === 'mac') {
    // Prioritize .dmg, fallback to .app.tar.gz
    asset =
      assets.find((a: { name: string }) => a.name.endsWith('.dmg')) ||
      assets.find((a: { name: string }) => a.name.endsWith('.app.tar.gz'));
  } else if (platform === 'windows') {
    asset = assets.find(
      (a: { name: string }) =>
        a.name.endsWith('.nsis.zip') || a.name.endsWith('.exe') || a.name.endsWith('.msi'),
    );
  } else if (platform === 'linux') {
    asset = assets.find(
      (a: { name: string }) => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'),
    );
  }

  if (asset && asset.browser_download_url) {
    // Set clean filenames for downloads
    const cleanFilenames: Record<string, string> = {
      mac: 'agiworkforce.dmg',
      windows: 'agiworkforce-setup.exe',
      linux: 'agiworkforce.AppImage',
    };

    const downloadUrl = asset.browser_download_url;
    const filename = cleanFilenames[platform] || asset.name;

    // Fetch the file from GitHub and stream it back with custom filename
    const fileResponse = await fetch(downloadUrl);

    if (!fileResponse.ok) {
      throw createError.serviceUnavailable('Failed to fetch installer from GitHub');
    }

    // SEV-WEB-M-2 fix (2026-05-05): when filename falls back to `asset.name`
    // from GitHub's Releases API, an attacker-controlled release-asset name
    // containing `"` or CR/LF would land in the Content-Disposition header
    // verbatim — header injection / response-splitting risk. Encode per
    // RFC 5987: strip control chars + quotes from the ASCII fallback and use
    // `filename*=UTF-8''<percent-encoded>` for the canonical name. The
    // control-char range `\x00-\x1f` is intentional — RFC 7230 forbids CTLs
    // in header values; this is the only way to express the strip in a regex
    // literal without a programmatic builder.
    // eslint-disable-next-line no-control-regex
    const safeAsciiFilename = filename.replace(/[\r\n"\\\x00-\x1f\x7f]/g, '_');
    const utf8Filename = encodeURIComponent(filename);
    const contentDisposition = `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${utf8Filename}`;

    // Stream the file with custom Content-Disposition header
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

  // No matching asset found in release? Fallback.
  return fallbackToStatic(platform, request);
}

function fallbackToStatic(platform: string, request: Request) {
  // WEB-DOWNLOAD-PLACEHOLDERS fix (2026-05-05): Windows and Linux placeholder files
  // must be removed via git rm commit (they are git-tracked). The route no longer
  // falls back to the placeholder paths when env vars are unset. Windows/Linux
  // real binaries will be added in Q3 2026.
  const downloadUrls: Record<string, string | undefined> = {
    mac: process.env['NEXT_PUBLIC_DOWNLOAD_URL_MAC'] || '/downloads/agiworkforce.dmg',
    windows: process.env['NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS'] || undefined,
    linux: process.env['NEXT_PUBLIC_DOWNLOAD_URL_LINUX'] || undefined,
  };

  const url = downloadUrls[platform];

  if (!url) {
    if (platform === 'windows' || platform === 'linux') {
      return NextResponse.json({ error: 'Coming soon', platform }, { status: 503 });
    }
    throw createError.notFound(`Download for ${platform} is currently unavailable.`);
  }

  const resolvedUrl = url.startsWith('/') ? `${new URL(request.url).origin}${url}` : url;

  return NextResponse.redirect(resolvedUrl, { status: 307 });
}

export const GET = withErrorHandler(handleDownload);
