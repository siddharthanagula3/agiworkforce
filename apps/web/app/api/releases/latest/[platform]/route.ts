import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { hashIpAddress } from '@/lib/server/ip-hash';
import type { ReleaseRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@shared/utils/env';
import {
  DESKTOP_RELEASE_PLATFORMS,
  fetchDesktopAssetSignature,
  fetchLatestDesktopRelease,
  isDesktopReleaseChannel,
  parseSemanticVersion,
  selectSignedDesktopUpdaterAsset,
  type DesktopReleasePlatform,
  type DesktopReleaseChannel,
} from '@/lib/releases/github-desktop-releases';

const VALID_PLATFORMS = DESKTOP_RELEASE_PLATFORMS;
const RELEASE_DOWNLOAD_IP_DOMAIN = 'release-download';
type Platform = DesktopReleasePlatform;

interface TauriUpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: {
    [key: string]: {
      signature: string;
      url: string;
    };
  };
}

interface ReleaseRecord {
  id: string;
  version: string;
  platform: string;
  download_url: string;
  signature: string;
  notes: string | null;
  pub_date: string;
  file_size_bytes: number | null;
  is_critical: boolean;
}

async function getReleaseFromDatabase(
  platform: Platform,
  channel: DesktopReleaseChannel = 'stable',
): Promise<ReleaseRecord | null> {
  const neonUrl = getOptionalEnv('DATABASE_URL') ?? getOptionalEnv('AGI_DATABASE_URL');

  if (!neonUrl) {
    return null;
  }

  try {
    const db = getNeonDb();
    const rows = await db.query<ReleaseRow>(
      "select * from releases where platform = $1 and channel = $2 and is_prerelease = ($2 <> 'stable') order by pub_date desc limit 1",
      [platform, channel],
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as unknown as ReleaseRecord;
  } catch (error) {
    logger.error({ error, platform }, 'Failed to fetch release from database');
    return null;
  }
}

async function getReleaseFromGitHub(
  platform: Platform,
  channel: DesktopReleaseChannel,
): Promise<ReleaseRecord | null> {
  const release = await fetchLatestDesktopRelease(channel);
  if (!release) return null;
  const updaterAsset = selectSignedDesktopUpdaterAsset(release, platform);
  if (!updaterAsset) return null;
  const signature = await fetchDesktopAssetSignature(updaterAsset.signature);
  if (!signature) return null;

  return {
    id: '',
    version: release.version,
    platform,
    download_url: updaterAsset.binary.browserDownloadUrl,
    signature,
    notes: release.notes,
    pub_date: release.publishedAt,
    file_size_bytes: updaterAsset.binary.size,
    is_critical: false,
  };
}

async function recordDownload(releaseId: string, request: NextRequest): Promise<void> {
  if (!releaseId) return;

  const neonUrl = getOptionalEnv('DATABASE_URL') ?? getOptionalEnv('AGI_DATABASE_URL');
  if (!neonUrl) return;

  try {
    const db = getNeonDb();

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip')?.trim() ||
      null;

    const userAgent = request.headers.get('user-agent') || null;
    const country = request.headers.get('cf-ipcountry') || null;
    const region = request.headers.get('x-vercel-ip-country-region') || null;
    const referrer = request.headers.get('referer') || null;

    await db.execute('select record_release_download($1, $2, $3, $4, $5, $6)', [
      releaseId,
      ip ? hashIpAddress(ip, RELEASE_DOWNLOAD_IP_DOMAIN) : null,
      userAgent,
      country,
      region,
      referrer,
    ]);
  } catch (error) {
    logger.warn({ error, releaseId }, 'Failed to record download analytics');
  }
}

async function handleGetLatestRelease(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { platform } = await params;

  if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
    throw createError.validation(
      `Invalid platform. Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  const validPlatform = platform as Platform;

  const url = new URL(request.url);
  const rawChannel = url.searchParams.get('channel') || 'stable';
  if (!isDesktopReleaseChannel(rawChannel)) {
    throw createError.validation('Invalid channel. Expected stable, beta, or nightly.');
  }
  const channel = rawChannel;

  let release = await getReleaseFromDatabase(validPlatform, channel);

  if (!release) {
    release = await getReleaseFromGitHub(validPlatform, channel);
  }

  if (!release) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No release found for this platform' } },
      { status: 404 },
    );
  }

  recordDownload(release.id, request).catch((e: unknown) => {
    console.error('[Releases] Failed to record download:', e);
  });

  const parsedVersion = parseSemanticVersion(release.version);
  if (!parsedVersion) {
    logger.error({ version: release.version }, 'Release record has an invalid semantic version');
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No valid release found for this platform' } },
      { status: 404 },
    );
  }

  const manifest: TauriUpdateManifest = {
    version: parsedVersion.normalized,
    notes: release.notes || `Release ${release.version}`,
    pub_date: release.pub_date,
    platforms: {
      [validPlatform]: {
        signature: release.signature,
        url: release.download_url,
      },
    },
  };

  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  headers.set('Content-Type', 'application/json');

  if (release.is_critical) {
    headers.set('X-Release-Critical', 'true');
  }
  if (release.file_size_bytes) {
    headers.set('X-Release-Size', release.file_size_bytes.toString());
  }

  return NextResponse.json(manifest, { headers });
}

export const GET = withErrorHandler(handleGetLatestRelease);
