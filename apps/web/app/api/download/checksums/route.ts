import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestStableDesktopRelease,
  resolveDesktopCloudReleaseRepository,
  type StableDesktopRelease,
} from '@/lib/releases/github-desktop-releases';
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

export const CHECKSUM_ASSET_NAME = 'SHA256SUMS';
const CHECKSUM_LINE = /^([0-9a-f]{64})\s+\*?(\S+)$/;
const MAX_CHECKSUM_BYTES = 64 * 1024;

export interface InstallerChecksum {
  name: string;
  architecture: 'arm64' | 'x64' | null;
  sha256: string;
}

function architectureOf(name: string): InstallerChecksum['architecture'] {
  if (/arm64|aarch64/i.test(name)) return 'arm64';
  if (/x64|x86_64/i.test(name)) return 'x64';
  return null;
}

export function parseChecksumFile(body: string): InstallerChecksum[] {
  const checksums: InstallerChecksum[] = [];
  for (const line of body.split('\n')) {
    const match = CHECKSUM_LINE.exec(line.trim());
    if (!match) continue;
    const name = match[2]!.split('/').pop() ?? '';
    if (!name.endsWith('.dmg')) continue;
    checksums.push({ name, architecture: architectureOf(name), sha256: match[1]! });
  }
  return checksums;
}

async function readChecksumAsset(release: StableDesktopRelease): Promise<string | null> {
  const asset = release.assets.find((candidate) => candidate.name === CHECKSUM_ASSET_NAME);
  if (!asset || !isTrustedReleaseAssetUrl(asset.browserDownloadUrl)) return null;
  const response = await fetch(asset.browserDownloadUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const body = await response.text();
  return body.length > MAX_CHECKSUM_BYTES ? null : body;
}

/**
 * The published checksum for each installer this release actually carries. A
 * release without a checksum asset answers 404 rather than an empty list, so
 * the page can never show a verification step there is nothing to verify with.
 */
async function handleChecksums(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'release-latest');
  if (rateLimitResponse) return rateLimitResponse;

  const release = await fetchLatestStableDesktopRelease({
    ...resolveDesktopCloudReleaseRepository(),
    tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
    revalidateSeconds: 300,
  });
  const body = release ? await readChecksumAsset(release) : null;
  const checksums = body === null ? [] : parseChecksumFile(body);
  if (!release || checksums.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No published installer checksum is available' } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { version: release.version, algorithm: 'sha256', installers: checksums },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  );
}

export const GET = withErrorHandler(handleChecksums);
