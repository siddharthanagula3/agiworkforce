import { NextResponse } from 'next/server';

export const runtime = 'edge';

const REPO_OWNER = process.env.DESKTOP_GITHUB_OWNER || 'siddharthanagula3';
const REPO_NAME = process.env.DESKTOP_GITHUB_REPO || 'agiworkforce-desktop-app';

/**
 * PUBLIC ENDPOINT: Download route for desktop application installers.
 *
 * SECURITY NOTE: This endpoint is intentionally unauthenticated because:
 * 1. Desktop app downloads should be publicly accessible to encourage adoption
 * 2. The download files are already publicly hosted on GitHub releases
 * 3. Authentication happens within the desktop app after installation
 * 4. Rate limiting is handled by GitHub's API and CDN infrastructure
 *
 * If download access needs to be restricted in the future (e.g., for beta builds),
 * add authentication by importing createSupabaseServerClient and checking user session.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');

  if (!platform || !['mac', 'windows', 'linux'].includes(platform)) {
    return NextResponse.json(
      { error: 'Invalid platform requested. Must be mac, windows, or linux.' },
      { status: 400 },
    );
  }

  try {
    // Fetch latest release from GitHub
    const githubResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AGI-Workforce-Downloader',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        next: { revalidate: 0 }, // No cache - always fetch latest release
      },
    );

    if (!githubResponse.ok) {
      // Fallback to static files if GitHub fails
      return fallbackToStatic(platform, request);
    }

    const release = await githubResponse.json();
    const assets = release.assets || [];

    let asset;
    // Match assets to platform
    if (platform === 'mac') {
      // Prioritize .dmg, fallback to .app.tar.gz
      asset =
        assets.find((a: any) => a.name.endsWith('.dmg')) ||
        assets.find((a: any) => a.name.endsWith('.app.tar.gz'));
    } else if (platform === 'windows') {
      asset = assets.find(
        (a: any) =>
          a.name.endsWith('.nsis.zip') || a.name.endsWith('.exe') || a.name.endsWith('.msi'),
      );
    } else if (platform === 'linux') {
      asset = assets.find((a: any) => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'));
    }

    if (asset && asset.browser_download_url) {
      return NextResponse.redirect(asset.browser_download_url, { status: 307 });
    }

    // No matching asset found in release? Fallback.
    return fallbackToStatic(platform, request);
  } catch (error) {
    console.error('Download redirect failed:', error);
    return fallbackToStatic(platform, request);
  }
}

function fallbackToStatic(platform: string, request: Request) {
  const downloadUrls: Record<string, string | undefined> = {
    mac: process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC || '/downloads/agiworkforce.dmg',
    windows: process.env.NEXT_PUBLIC_DOWNLOAD_URL_WINDOWS || '/downloads/agi-workforce-win.exe',
    linux: process.env.NEXT_PUBLIC_DOWNLOAD_URL_LINUX || '/downloads/agi-workforce-linux.AppImage',
  };

  let url = downloadUrls[platform];

  if (!url) {
    return NextResponse.json(
      { error: `Download for ${platform} is currently unavailable.` },
      { status: 404 },
    );
  }

  if (url.startsWith('/')) {
    const origin = new URL(request.url).origin;
    url = `${origin}${url}`;
  }

  return NextResponse.redirect(url, { status: 307 });
}
