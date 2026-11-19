import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DESKTOP_CLOUD_TAG_PREFIX,
  fetchLatestStableDesktopRelease,
  resolveDesktopCloudReleaseRepository,
  type StableDesktopRelease,
} from '@/lib/releases/github-desktop-releases';
import { isTrustedReleaseAssetUrl } from '@/lib/releases/trusted-release-asset-url';

type MacArchitecture = 'arm64' | 'x64';

const DESKTOP_INSTALLER_FILENAME = 'agiworkforce.dmg';
const DOWNLOAD_PAGE_PATH = '/download';
const MAX_VERSION_LENGTH = 64;
const VERSIONED_CACHE_CONTROL = 'public, max-age=3600';
const LATEST_CACHE_CONTROL = 'no-store';
const INSTALLER_RESPONSE_TIMEOUT_MS = 30_000;
const INSTALLER_STALL_TIMEOUT_MS = 30_000;

function installerFilename(assetName: string): string {
  const name = assetName.replace(/[^\w .()-]/g, '').trim();
  return name.endsWith('.dmg') ? name : DESKTOP_INSTALLER_FILENAME;
}

function macInstallerAsset(release: StableDesktopRelease, architecture: MacArchitecture | null) {
  const installers = release.assets.filter((asset) => asset.name.endsWith('.dmg'));
  const arm64 = installers.find((asset) => /arm64|aarch64/i.test(asset.name)) ?? null;
  const x64 = installers.find((asset) => /x64|x86_64/i.test(asset.name)) ?? null;
  if (architecture === 'arm64') return arm64;
  if (architecture === 'x64') return x64;
  return arm64 ?? x64 ?? installers[0] ?? null;
}

async function fetchInstaller(url: string, transfer: AbortController): Promise<Response> {
  const timer = setTimeout(
    () =>
      transfer.abort(
        new DOMException('The installer host did not respond in time.', 'TimeoutError'),
      ),
    INSTALLER_RESPONSE_TIMEOUT_MS,
  );
  try {
    return await fetch(url, { signal: transfer.signal });
  } finally {
    clearTimeout(timer);
  }
}

// A large installer may take minutes, so the transfer has no total deadline;
// instead it ends when no bytes move for INSTALLER_STALL_TIMEOUT_MS in either
// direction, or when the client goes away, so an idle reader cannot hold the
// upstream request open.
function relayWhileProgressing(
  body: ReadableStream<Uint8Array>,
  transfer: AbortController,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let relay: ReadableStreamDefaultController<Uint8Array> | undefined;
  let stall: ReturnType<typeof setTimeout> | undefined;
  const armStall = () => {
    clearTimeout(stall);
    stall = setTimeout(() => {
      const reason = new DOMException(
        'The installer download stopped making progress.',
        'TimeoutError',
      );
      transfer.abort(reason);
      relay?.error(reason);
    }, INSTALLER_STALL_TIMEOUT_MS);
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        relay = controller;
        armStall();
      },
      async pull(controller) {
        armStall();
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(stall);
          controller.close();
          return;
        }
        controller.enqueue(value);
        armStall();
      },
      async cancel(reason) {
        clearTimeout(stall);
        transfer.abort(reason);
        await reader.cancel(reason).catch(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
}

function unavailable(platform: string) {
  return NextResponse.json({ error: 'Installer unavailable', platform }, { status: 503 });
}

async function handleDownload(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'download');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const userAgent = request.headers.get('user-agent') || 'unknown';

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const app = searchParams.get('app');
  const architecture = searchParams.get('arch');
  const version = searchParams.get('version')?.trim() ?? null;

  logger.info(
    {
      userAgent: userAgent.substring(0, 200),
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
  if (architecture !== null && (platform !== 'mac' || !['arm64', 'x64'].includes(architecture))) {
    throw createError.validation(
      'Invalid architecture requested. macOS installers are arm64 or x64.',
    );
  }
  if (version !== null && (version === '' || version.length > MAX_VERSION_LENGTH)) {
    throw createError.validation('Invalid version requested.');
  }
  if (platform !== 'mac') return unavailable(platform);

  const release = await fetchLatestStableDesktopRelease({
    ...resolveDesktopCloudReleaseRepository(),
    tagPrefix: DESKTOP_CLOUD_TAG_PREFIX,
    revalidateSeconds: 0,
  });
  if (release && version !== null && release.version !== version) {
    const response = NextResponse.redirect(new URL(DOWNLOAD_PAGE_PATH, request.url), 303);
    response.headers.set('Cache-Control', LATEST_CACHE_CONTROL);
    return response;
  }
  const asset = release ? macInstallerAsset(release, architecture as MacArchitecture | null) : null;
  if (!asset) return unavailable(platform);

  const downloadUrl = asset.browserDownloadUrl;
  if (!isTrustedReleaseAssetUrl(downloadUrl)) {
    throw createError.serviceUnavailable('Release asset URL is not trusted');
  }

  const transfer = new AbortController();
  const fileResponse = await fetchInstaller(downloadUrl, transfer);

  if (!fileResponse.ok) {
    transfer.abort();
    throw createError.serviceUnavailable('Failed to fetch installer from GitHub');
  }

  const body = fileResponse.body ? relayWhileProgressing(fileResponse.body, transfer) : null;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': fileResponse.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': fileResponse.headers.get('Content-Length') || '',
      'Content-Disposition': `attachment; filename="${installerFilename(asset.name)}"`,
      'Cache-Control': version === null ? LATEST_CACHE_CONTROL : VERSIONED_CACHE_CONTROL,
    },
  });
}

export const GET = withErrorHandler(handleDownload);
