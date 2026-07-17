import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  fetchLatestStableDesktopRelease,
  selectDesktopInstallerAsset,
  type DesktopDownloadPlatform,
} from '@/lib/releases/github-desktop-releases';

const REPO_OWNER = process.env['DESKTOP_GITHUB_OWNER'] || 'siddharthanagula3';
const REPO_NAME = process.env['DESKTOP_GITHUB_REPO'] || 'agiworkforce-desktop-app';

const EXTERNAL_URL_ALLOWED_HOSTS = new Set<string>([
  'downloads.agiworkforce.com',
  'cdn.agiworkforce.com',
  'github.com',
  'objects.githubusercontent.com',
]);

const TRUSTED_GITHUB_RELEASES: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'siddharthanagula3', repo: 'agiworkforce' },
  { owner: REPO_OWNER, repo: REPO_NAME },
];

function isExternalRedirectAllowed(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (!EXTERNAL_URL_ALLOWED_HOSTS.has(parsed.hostname)) return false;

  if (parsed.hostname === 'github.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 4) return false;
    const [owner, repo, kind] = segments;
    if (kind !== 'releases') return false;
    const ownerLower = owner?.toLowerCase() ?? '';
    const repoLower = repo?.toLowerCase() ?? '';
    return TRUSTED_GITHUB_RELEASES.some(
      (pair) => pair.owner.toLowerCase() === ownerLower && pair.repo.toLowerCase() === repoLower,
    );
  }

  return true;
}

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
 * add authentication by calling getClerkAuthUser(request) from lib/api-auth.
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

  const release = await fetchLatestStableDesktopRelease({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    revalidateSeconds: 0,
  });
  if (!release) return fallbackToStatic(platform, request);

  const asset = selectDesktopInstallerAsset(release, platform as DesktopDownloadPlatform);

  if (asset) {
    // Set clean filenames for downloads
    const cleanFilenames: Record<string, string> = {
      mac: 'agiworkforce.dmg',
      windows: 'agiworkforce-setup.exe',
      linux: 'agiworkforce.AppImage',
    };

    const downloadUrl = asset.browserDownloadUrl;
    if (!isExternalRedirectAllowed(downloadUrl)) {
      throw createError.serviceUnavailable('Release asset URL is not trusted');
    }
    const filename = cleanFilenames[platform] || asset.name;

    // Fetch the file from GitHub and stream it back with custom filename
    const fileResponse = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!fileResponse.ok) {
      throw createError.serviceUnavailable('Failed to fetch installer from GitHub');
    }

    // SEV-WEB-M-2 fix (2026-05-05): when filename falls back to `asset.name`
    // from GitHub's Releases API, an attacker-controlled release-asset name
    // containing `"` or CR/LF would land in the Content-Disposition header
    // verbatim · header injection / response-splitting risk. Encode per
    // RFC 5987: strip control chars + quotes from the ASCII fallback and use
    // `filename*=UTF-8''<percent-encoded>` for the canonical name.
    const safeAsciiFilename = Array.from(filename, (char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 || char === '"' || char === '\\' ? '_' : char;
    }).join('');
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
  // Do not fall back to local static placeholders. `public/downloads/` is ignored
  // and not deployed, so every platform needs either a trusted release asset or
  // an explicit NEXT_PUBLIC_DOWNLOAD_URL_* value.
  const downloadUrls: Record<string, string | undefined> = {
    mac: process.env['NEXT_PUBLIC_DOWNLOAD_URL_MAC'] || undefined,
    windows: process.env['NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS'] || undefined,
    linux: process.env['NEXT_PUBLIC_DOWNLOAD_URL_LINUX'] || undefined,
  };

  const url = downloadUrls[platform];

  if (!url) {
    return NextResponse.json({ error: 'Installer unavailable', platform }, { status: 503 });
  }

  if (!url.startsWith('/') && !isExternalRedirectAllowed(url)) {
    throw createError.validation(
      'Download redirect target is not on the allowlist. Set NEXT_PUBLIC_DOWNLOAD_URL_* to an https URL on our download host or trusted GitHub release.',
    );
  }

  const resolvedUrl = url.startsWith('/') ? `${new URL(request.url).origin}${url}` : url;

  return NextResponse.redirect(resolvedUrl, { status: 307 });
}

export const GET = withErrorHandler(handleDownload);
