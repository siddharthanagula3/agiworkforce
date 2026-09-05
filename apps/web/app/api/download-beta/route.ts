import 'server-only';

import { readFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';

const DOWNLOAD_INFO: Record<string, { filename: string; contentType: string; envVar: string }> = {
  mac: {
    filename: 'AGI-Workforce.dmg',
    contentType: 'application/x-apple-diskimage',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_MAC',
  },
  windows: {
    filename: 'AGI-Workforce-Setup.exe',
    contentType: 'application/x-msdownload',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS',
  },
  linux: {
    filename: 'AGI-Workforce.AppImage',
    contentType: 'application/x-executable',
    envVar: 'NEXT_PUBLIC_DOWNLOAD_URL_LINUX',
  },
};

const FILE_PATHS: Record<string, string> = {
  mac: 'agiworkforce.dmg',
  windows: 'agi-workforce-win.exe',
  linux: 'agi-workforce-linux.AppImage',
};

const EXTERNAL_URL_ALLOWED_HOSTS = new Set<string>([
  'downloads.agiworkforce.com',
  'cdn.agiworkforce.com',
  'github.com',
  'objects.githubusercontent.com', // GitHub release-asset CDN (signed URLs)
]);

const TRUSTED_GITHUB_RELEASES: ReadonlyArray<{ owner: string; repo: string }> = [
  { owner: 'siddharthanagula3', repo: 'agiworkforce' },
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
    const matched = TRUSTED_GITHUB_RELEASES.some(
      (pair) => pair.owner.toLowerCase() === ownerLower && pair.repo.toLowerCase() === repoLower,
    );
    if (!matched) return false;
  }
  return true;
}

async function handleDownloadBeta(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'download-beta');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'mac';

  if (!['mac', 'windows', 'linux'].includes(platform)) {
    throw createError.validation('Invalid platform. Must be mac, windows, or linux.');
  }

  const info = DOWNLOAD_INFO[platform];
  const filePlatformPath = FILE_PATHS[platform];
  if (!info || !filePlatformPath) {
    throw createError.notFound(`Download for platform "${platform}" is not configured.`);
  }

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  const [subscription] = await db.query<Pick<SubscriptionRow, 'status'>>(
    'select status from subscriptions where user_id = $1 limit 1',
    [userId],
  );

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  if (!hasActiveSubscription) {
    throw createError.forbidden('Active subscription required to download.');
  }

  const externalUrl = process.env[info.envVar];

  if (externalUrl && !externalUrl.startsWith('/')) {
    if (!isExternalRedirectAllowed(externalUrl)) {
      throw createError.validation(
        'Download redirect target is not on the allowlist. ' +
          'Set NEXT_PUBLIC_DOWNLOAD_URL_* to an https URL on our own download host or a github.com release.',
      );
    }
    return NextResponse.redirect(externalUrl, { status: 307 });
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'downloads', filePlatformPath);
    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': info.contentType,
        'Content-Disposition': `attachment; filename="${info.filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    throw createError.notFound(`Download for ${platform} is currently unavailable.`);
  }
}

export const GET = withErrorHandler(handleDownloadBeta);
