import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getOptionalEnv } from '@/utils/env';

// Valid platforms for desktop releases
const VALID_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'darwin-universal',
  'windows-x86_64',
  'linux-x86_64',
] as const;

type Platform = (typeof VALID_PLATFORMS)[number];

// Tauri update manifest format
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

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  assets: GitHubAsset[];
  prerelease: boolean;
}

// Platform to GitHub asset name mapping
const PLATFORM_ASSET_MATCHERS: Record<Platform, (name: string) => boolean> = {
  'darwin-aarch64': (name) =>
    name.includes('.app.tar.gz') && (name.includes('aarch64') || name.includes('universal')),
  'darwin-x86_64': (name) =>
    name.includes('.app.tar.gz') && (name.includes('x64') || name.includes('universal')),
  'darwin-universal': (name) => name.includes('.app.tar.gz') && name.includes('universal'),
  'windows-x86_64': (name) => name.includes('.nsis.zip') || name.includes('setup.exe'),
  'linux-x86_64': (name) => name.includes('.AppImage.tar.gz'),
};

/**
 * Get release from database
 */
async function getReleaseFromDatabase(
  platform: Platform,
  channel: string = 'stable',
): Promise<ReleaseRecord | null> {
  const supabaseUrl = getOptionalEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('releases')
      .select('*')
      .eq('platform', platform)
      .eq('channel', channel)
      .eq('is_prerelease', false)
      .order('pub_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // PGRST116 = no rows found, not an error
      if (error.code !== 'PGRST116') {
        logger.warn({ error, platform }, 'Database query error for release');
      }
      return null;
    }

    return data as ReleaseRecord;
  } catch (error) {
    logger.error({ error, platform }, 'Failed to fetch release from database');
    return null;
  }
}

/**
 * Fallback: Get release from GitHub Releases API
 */
async function getReleaseFromGitHub(platform: Platform): Promise<ReleaseRecord | null> {
  const owner = getOptionalEnv('DESKTOP_GITHUB_OWNER');
  const repo = getOptionalEnv('DESKTOP_GITHUB_REPO');

  if (!owner || !repo) {
    logger.warn('GitHub repository not configured for releases');
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
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'GitHub API error');
      return null;
    }

    const release = (await response.json()) as GitHubRelease;
    const matcher = PLATFORM_ASSET_MATCHERS[platform];

    // Find binary asset
    const binaryAsset = release.assets.find((a) => matcher(a.name) && !a.name.endsWith('.sig'));

    if (!binaryAsset) {
      logger.warn(
        { platform, assets: release.assets.map((a) => a.name) },
        'No matching asset found',
      );
      return null;
    }

    // Find signature asset
    const sigAsset = release.assets.find((a) => a.name === `${binaryAsset.name}.sig`);

    if (!sigAsset) {
      logger.warn({ assetName: binaryAsset.name }, 'Signature missing for asset');
      return null;
    }

    // Fetch signature content
    const sigResponse = await fetch(sigAsset.browser_download_url, { headers });
    if (!sigResponse.ok) {
      logger.warn({ status: sigResponse.status }, 'Failed to fetch signature');
      return null;
    }

    const signature = await sigResponse.text();

    return {
      id: '', // Not available from GitHub
      version: release.tag_name.replace(/^v/, ''),
      platform,
      download_url: binaryAsset.browser_download_url,
      signature: signature.trim(),
      notes: release.body,
      pub_date: release.published_at,
      file_size_bytes: null,
      is_critical: false,
    };
  } catch (error) {
    logger.error({ error, platform }, 'Failed to fetch release from GitHub');
    return null;
  }
}

/**
 * Record download analytics (non-blocking)
 */
async function recordDownload(releaseId: string, request: NextRequest): Promise<void> {
  if (!releaseId) return;

  const supabaseUrl = getOptionalEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) return;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const userAgent = request.headers.get('user-agent') || null;
    const country = request.headers.get('cf-ipcountry') || null;
    const referrer = request.headers.get('referer') || null;

    await supabase.rpc('record_release_download', {
      p_release_id: releaseId,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_country_code: country,
      p_referrer: referrer,
    });
  } catch (error) {
    // Non-blocking - log and continue
    logger.warn({ error, releaseId }, 'Failed to record download analytics');
  }
}

/**
 * GET /api/releases/latest/:platform
 *
 * Returns Tauri-compatible update manifest for the specified platform.
 * First checks database, then falls back to GitHub Releases API.
 */
async function handleGetLatestRelease(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
): Promise<NextResponse> {
  // Rate limiting - generous for update checks
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { platform } = await params;

  // Validate platform
  if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
    throw createError.validation(
      `Invalid platform. Valid platforms: ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  const validPlatform = platform as Platform;

  // Get channel from query params (default: stable)
  const url = new URL(request.url);
  const VALID_CHANNELS = ['stable', 'beta'] as const;
  const rawChannel = url.searchParams.get('channel') || 'stable';
  const channel = VALID_CHANNELS.includes(rawChannel as (typeof VALID_CHANNELS)[number])
    ? rawChannel
    : 'stable';

  // Try database first
  let release = await getReleaseFromDatabase(validPlatform, channel);

  // Fall back to GitHub if database doesn't have the release
  if (!release) {
    release = await getReleaseFromGitHub(validPlatform);
  }

  // No release found
  if (!release) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No release found for this platform' } },
      { status: 404 },
    );
  }

  // Record download analytics (non-blocking)
  recordDownload(release.id, request).catch(() => {});

  // Build Tauri-compatible update manifest
  const manifest: TauriUpdateManifest = {
    version: release.version.startsWith('v') ? release.version : `v${release.version}`,
    notes: release.notes || `Release ${release.version}`,
    pub_date: release.pub_date,
    platforms: {
      [validPlatform]: {
        signature: release.signature,
        url: release.download_url,
      },
    },
  };

  // Add cache headers
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300'); // 5 minute cache
  headers.set('Content-Type', 'application/json');

  // Add release metadata headers
  if (release.is_critical) {
    headers.set('X-Release-Critical', 'true');
  }
  if (release.file_size_bytes) {
    headers.set('X-Release-Size', release.file_size_bytes.toString());
  }

  return NextResponse.json(manifest, { headers });
}

export const GET = withErrorHandler(handleGetLatestRelease);
