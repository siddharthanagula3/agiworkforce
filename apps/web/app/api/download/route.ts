import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');

  if (!platform || !['mac', 'windows', 'linux'].includes(platform)) {
    return NextResponse.json(
      { error: 'Invalid platform requested. Must be mac, windows, or linux.' },
      { status: 400 },
    );
  }

  const downloadUrls: Record<string, string | undefined> = {
    mac: process.env.NEXT_PUBLIC_DOWNLOAD_URL_MAC || '/downloads/agi-workforce-mac.dmg',
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

  return NextResponse.redirect(url, {
    status: 307,
  });
}
