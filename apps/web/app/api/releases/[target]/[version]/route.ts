import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getOptionalEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const runtime = 'edge';

// Map Tauri targets to GitHub asset keywords
// We assume standard Tauri build artifacts:
// - macOS: .app.tar.gz (and .sig)
// - Windows: .nsis.zip (and .sig)
// - Linux: .AppImage.tar.gz (and .sig)
const PLATFORM_MAP: Record<string, (asset: string) => boolean> = {
  'darwin-aarch64': (name) =>
    name.includes('.app.tar.gz') && (name.includes('aarch64') || name.includes('universal')),
  'darwin-x86_64': (name) =>
    name.includes('.app.tar.gz') && (name.includes('x64') || name.includes('universal')),
  'windows-x86_64': (name) =>
    name.includes('.nsis.zip') || (name.includes('setup.exe') && name.endsWith('.zip')), // Allow resilient matching
  'linux-x86_64': (name) => name.includes('.AppImage.tar.gz'),
  'linux-x86_64-appimage': (name) => name.includes('.AppImage.tar.gz'),
};

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
}

function noUpdateResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}

function parseSemver(version: string): [number, number, number] | null {
  // Strip leading "v" and pre-release/build metadata.
  const clean = version.trim().replace(/^v/i, '').split('-')[0]?.split('+')[0] ?? '';
  const parts = clean.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;

  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) {
    // Fallback: if we can't parse, only treat identical strings as "not newer".
    return latest.trim().replace(/^v/i, '') !== current.trim().replace(/^v/i, '');
  }

  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

async function handleReleaseCheck(
  request: NextRequest,
  { params }: { params: Promise<{ target: string; version: string }> },
) {
  // Rate limiting: Allow generous limits for update checks
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { target, version } = await params;

  if (!target || !version) {
    throw createError.validation('Missing target or version parameter');
  }

  // Validate target format
  if (!PLATFORM_MAP[target]) {
    // Unknown target - return empty response (no update)
    return noUpdateResponse();
  }

  // Validate version format (basic semver check)
  if (!parseSemver(version)) {
    throw createError.validation('Invalid version format');
  }

  // 1. Fetch latest release from GitHub
  // Using fetch with caching tailored for releases (revalidate every 5 minutes)
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AGI-Workforce-Updater',
  };

  // Add auth if token exists (for private repos or higher rate limits)
  if (process.env['GITHUB_TOKEN']) {
    headers['Authorization'] = `Bearer ${process.env['GITHUB_TOKEN']}`;
  }

  // Desktop release repo configuration (required for updater)
  // Set these in Vercel/production env:
  // - DESKTOP_GITHUB_OWNER
  // - DESKTOP_GITHUB_REPO
  const OWNER = getOptionalEnv('DESKTOP_GITHUB_OWNER');
  const REPO = getOptionalEnv('DESKTOP_GITHUB_REPO');

  if (!OWNER || !REPO) {
    logger.warn('Desktop release GitHub repository is not configured');
    return noUpdateResponse();
  }

  const GITHUB_API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

  const response = await fetch(GITHUB_API_URL, { headers, next: { revalidate: 300 } });

  if (!response.ok) {
    logger.warn({ status: response.status }, 'GitHub API error during release check');
    return noUpdateResponse(); // No update found if API fails
  }

  const release = (await response.json()) as GitHubRelease;
  const latestVersion = release.tag_name.replace(/^v/, '');

  // 2. Compare versions
  if (!isNewerVersion(latestVersion, version)) {
    return noUpdateResponse(); // Up to date
  }

  // 3. Find matching asset
  const platformMatcher = PLATFORM_MAP[target];

  const binaryAsset = release.assets.find(
    (a) => platformMatcher(a.name) && !a.name.endsWith('.sig'),
  );

  if (!binaryAsset) {
    return noUpdateResponse();
  }

  // 4. Find signature
  // Expecting: asset.name + .sig
  const signatureAsset = release.assets.find((a) => a.name === `${binaryAsset.name}.sig`);

  if (!signatureAsset) {
    logger.warn({ assetName: binaryAsset.name }, 'Signature missing for release asset');
    return noUpdateResponse();
  }

  // 5. Fetch signature content
  const sigResponse = await fetch(signatureAsset.browser_download_url, { headers });
  if (!sigResponse.ok) {
    return noUpdateResponse();
  }
  const signature = await sigResponse.text();

  // 6. Return JSON
  return NextResponse.json({
    version: `v${latestVersion}`,
    notes: release.body,
    pub_date: release.published_at,
    platforms: {
      [target]: {
        url: binaryAsset.browser_download_url,
        signature: signature.trim(),
      },
    },
  });
}

export const GET = withErrorHandler(handleReleaseCheck);
