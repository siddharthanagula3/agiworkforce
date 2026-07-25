import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ReleaseRow } from '@/lib/server/neon-types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@shared/utils/env';
import {
  compareSemanticVersions,
  DESKTOP_RELEASE_PLATFORMS,
  fetchLatestStableDesktopRelease,
  parseSemanticVersion,
  selectSignedDesktopUpdaterAsset,
  type DesktopReleasePlatform,
} from '@/lib/releases/github-desktop-releases';

const VALID_PLATFORMS = DESKTOP_RELEASE_PLATFORMS;

// AUDIT-FIX STB-11: `releases.channel` is free-form text with no seeded
// allowlist, so this validates shape rather than membership — enough to reject
// non-strings and injection-shaped values without breaking a channel an
// operator adds later.
const CHANNEL_SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;
type Platform = DesktopReleasePlatform;

interface UpdateCheckRequest {
  current_version: string;
  platform: Platform;
  channel?: string;
}

interface UpdateCheckResponse {
  update_available: boolean;
  current_version: string;
  latest_version: string | null;
  is_critical: boolean;
  download_url: string | null;
  release_notes: string | null;
  pub_date: string | null;
  file_size_bytes: number | null;
}

interface ReleaseRecord {
  version: string;
  download_url: string;
  notes: string | null;
  pub_date: string;
  file_size_bytes: number | null;
  is_critical: boolean;
}

function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareSemanticVersions(latestVersion, currentVersion) === 1;
}

/**
 * Get latest release from database
 */
async function getLatestRelease(
  platform: Platform,
  channel: string = 'stable',
): Promise<ReleaseRecord | null> {
  const neonUrl = getOptionalEnv('DATABASE_URL') ?? getOptionalEnv('AGI_DATABASE_URL');

  if (!neonUrl) {
    logger.warn('Neon database not configured for release checks');
    return null;
  }

  try {
    const db = getNeonDb();
    type ReleaseQueryRow = Pick<
      ReleaseRow,
      'version' | 'download_url' | 'notes' | 'pub_date' | 'file_size_bytes' | 'is_critical'
    >;
    const rows = await db.query<ReleaseQueryRow>(
      'select version, download_url, notes, pub_date, file_size_bytes, is_critical from releases where platform = $1 and channel = $2 and is_prerelease = false order by pub_date desc limit 1',
      [platform, channel],
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0] as ReleaseRecord;
  } catch (error) {
    logger.error({ error, platform }, 'Failed to fetch latest release');
    return null;
  }
}

/**
 * Fallback: Get latest version from GitHub
 */
async function getLatestReleaseFromGitHub(platform: Platform): Promise<ReleaseRecord | null> {
  const release = await fetchLatestStableDesktopRelease();
  if (!release) return null;
  const updaterAsset = selectSignedDesktopUpdaterAsset(release, platform);
  if (!updaterAsset) return null;

  return {
    version: release.version,
    download_url: `https://agiworkforce.com/api/releases/latest/${platform}`,
    notes: release.notes,
    pub_date: release.publishedAt,
    file_size_bytes: updaterAsset.binary.size,
    is_critical: false,
  };
}

/**
 * POST /api/releases/check
 *
 * Check if an update is available for the given version and platform.
 *
 * Request body:
 * {
 *   "current_version": "1.0.3",
 *   "platform": "darwin-aarch64",
 *   "channel": "stable" // optional, defaults to "stable"
 * }
 */
async function handleUpdateCheck(request: NextRequest): Promise<NextResponse> {
  // Rate limiting - generous for update checks
  const rateLimitResponse = await withRateLimit(request, 'release-check');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Parse request body
  let body: UpdateCheckRequest;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { current_version, platform, channel = 'stable' } = body;

  // AUDIT-FIX STB-11: `channel` was the one field on this route with no type
  // check and no allowlist, and it flowed straight into a SQL parameter. This
  // handler is unauthenticated (rate limit only), so it was the only
  // pre-auth-reachable unvalidated input in the API. An arbitrary string also
  // silently bypassed the GitHub fallback below, which is gated on
  // `channel === 'stable'`.
  if (typeof channel !== 'string' || !CHANNEL_SLUG_RE.test(channel)) {
    throw createError.validation(
      'Invalid channel. Expected a short lowercase slug (e.g. "stable", "beta").',
    );
  }

  // Validate required fields
  if (typeof current_version !== 'string' || !current_version) {
    throw createError.validation('current_version is required');
  }

  if (typeof platform !== 'string') {
    throw createError.validation('platform must be a string');
  }

  if (!platform) {
    throw createError.validation('platform is required');
  }

  if (!VALID_PLATFORMS.includes(platform)) {
    throw createError.validation(
      `Invalid platform. Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  // Validate version format
  if (!parseSemanticVersion(current_version)) {
    throw createError.validation('Invalid version format. Expected semantic version (e.g., 1.0.0)');
  }

  // Get latest release
  let latest = await getLatestRelease(platform, channel);

  // Fall back to GitHub if database is empty
  if (!latest && channel === 'stable') {
    latest = await getLatestReleaseFromGitHub(platform);
  }

  // Build response
  const response: UpdateCheckResponse = {
    update_available: false,
    current_version,
    latest_version: null,
    is_critical: false,
    download_url: null,
    release_notes: null,
    pub_date: null,
    file_size_bytes: null,
  };

  if (latest) {
    const updateAvailable = isUpdateAvailable(current_version, latest.version);

    response.update_available = updateAvailable;
    response.latest_version = latest.version;
    response.is_critical = latest.is_critical;

    if (updateAvailable) {
      response.download_url = latest.download_url;
      response.release_notes = latest.notes;
      response.pub_date = latest.pub_date;
      response.file_size_bytes = latest.file_size_bytes;
    }
  }

  // Add cache headers - short cache for update checks
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=60'); // 1 minute cache
  headers.set('Content-Type', 'application/json');

  return NextResponse.json(response, { headers });
}

/**
 * GET /api/releases/check
 *
 * Alternative GET endpoint for update checks using query parameters.
 *
 * Query params:
 * - version: Current version (required)
 * - platform: Target platform (required)
 * - channel: Release channel (optional, defaults to "stable")
 */
async function handleGetUpdateCheck(request: NextRequest): Promise<NextResponse> {
  // Rate limiting - generous for update checks
  const rateLimitResponse = await withRateLimit(request, 'release-check');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const current_version = url.searchParams.get('version');
  const platform = url.searchParams.get('platform') as Platform | null;
  const channel = url.searchParams.get('channel') || 'stable';

  if (!CHANNEL_SLUG_RE.test(channel)) {
    throw createError.validation(
      'Invalid channel. Expected a short lowercase slug (e.g. "stable", "beta").',
    );
  }

  // Validate required params
  if (!current_version) {
    throw createError.validation('version query parameter is required');
  }

  if (!platform) {
    throw createError.validation('platform query parameter is required');
  }

  if (!VALID_PLATFORMS.includes(platform)) {
    throw createError.validation(
      `Invalid platform. Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  // Validate version format
  if (!parseSemanticVersion(current_version)) {
    throw createError.validation('Invalid version format. Expected semantic version (e.g., 1.0.0)');
  }

  // Get latest release
  let latest = await getLatestRelease(platform, channel);

  // Fall back to GitHub
  if (!latest && channel === 'stable') {
    latest = await getLatestReleaseFromGitHub(platform);
  }

  // Build response
  const response: UpdateCheckResponse = {
    update_available: false,
    current_version,
    latest_version: null,
    is_critical: false,
    download_url: null,
    release_notes: null,
    pub_date: null,
    file_size_bytes: null,
  };

  if (latest) {
    const updateAvailable = isUpdateAvailable(current_version, latest.version);

    response.update_available = updateAvailable;
    response.latest_version = latest.version;
    response.is_critical = latest.is_critical;

    if (updateAvailable) {
      response.download_url = latest.download_url;
      response.release_notes = latest.notes;
      response.pub_date = latest.pub_date;
      response.file_size_bytes = latest.file_size_bytes;
    }
  }

  // Cache headers
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=60');
  headers.set('Content-Type', 'application/json');

  return NextResponse.json(response, { headers });
}

export const GET = withErrorHandler(handleGetUpdateCheck);
export const POST = withErrorHandler(handleUpdateCheck);
