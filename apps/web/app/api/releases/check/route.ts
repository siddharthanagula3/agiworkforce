import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@/utils/env';

// Valid platforms
const VALID_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'darwin-universal',
  'windows-x86_64',
  'linux-x86_64',
] as const;

type Platform = (typeof VALID_PLATFORMS)[number];

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

/**
 * Parse semantic version string
 */
function parseSemver(version: string): [number, number, number] | null {
  // Strip leading "v" and pre-release/build metadata
  const clean = version.trim().replace(/^v/i, '').split('-')[0]?.split('+')[0] ?? '';
  const parts = clean.split('.');

  if (parts.length < 1 || parts.length > 3) return null;

  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;

  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

/**
 * Compare two semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) {
    // Fallback to string comparison if parsing fails
    return a.localeCompare(b);
  }

  for (let i = 0; i < 3; i++) {
    const aVal = parsedA[i] ?? 0;
    const bVal = parsedB[i] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }

  return 0;
}

/**
 * Check if an update is available
 */
function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareSemver(latestVersion, currentVersion) > 0;
}

/**
 * Get latest release from database
 */
async function getLatestRelease(
  platform: Platform,
  channel: string = 'stable',
): Promise<ReleaseRecord | null> {
  const supabaseUrl = getOptionalEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Supabase not configured for release checks');
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('releases')
      .select('version, download_url, notes, pub_date, file_size_bytes, is_critical')
      .eq('platform', platform)
      .eq('channel', channel)
      .eq('is_prerelease', false)
      .order('pub_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') {
        logger.warn({ error, platform, channel }, 'Database query error');
      }
      return null;
    }

    return data as ReleaseRecord;
  } catch (error) {
    logger.error({ error, platform }, 'Failed to fetch latest release');
    return null;
  }
}

/**
 * Fallback: Get latest version from GitHub
 */
async function getLatestReleaseFromGitHub(): Promise<{
  version: string;
  notes: string;
  pub_date: string;
} | null> {
  const owner = getOptionalEnv('DESKTOP_GITHUB_OWNER');
  const repo = getOptionalEnv('DESKTOP_GITHUB_REPO');

  if (!owner || !repo) {
    return null;
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AGI-Workforce-Updater',
  };

  const githubToken = getOptionalEnv('GITHUB_TOKEN');
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers,
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return null;
    }

    const release = await response.json();
    return {
      version: release.tag_name.replace(/^v/, ''),
      notes: release.body,
      pub_date: release.published_at,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch from GitHub');
    return null;
  }
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

  // Validate required fields
  if (!current_version) {
    throw createError.validation('current_version is required');
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
  if (!parseSemver(current_version)) {
    throw createError.validation('Invalid version format. Expected semantic version (e.g., 1.0.0)');
  }

  // Get latest release
  let latest = await getLatestRelease(platform, channel);

  // Fall back to GitHub if database is empty
  if (!latest) {
    const githubRelease = await getLatestReleaseFromGitHub();
    if (githubRelease) {
      latest = {
        version: githubRelease.version,
        download_url: `https://agiworkforce.com/api/releases/latest/${platform}`,
        notes: githubRelease.notes,
        pub_date: githubRelease.pub_date,
        file_size_bytes: null,
        is_critical: false,
      };
    }
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
  if (!parseSemver(current_version)) {
    throw createError.validation('Invalid version format. Expected semantic version (e.g., 1.0.0)');
  }

  // Get latest release
  let latest = await getLatestRelease(platform, channel);

  // Fall back to GitHub
  if (!latest) {
    const githubRelease = await getLatestReleaseFromGitHub();
    if (githubRelease) {
      latest = {
        version: githubRelease.version,
        download_url: `https://agiworkforce.com/api/releases/latest/${platform}`,
        notes: githubRelease.notes,
        pub_date: githubRelease.pub_date,
        file_size_bytes: null,
        is_critical: false,
      };
    }
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
