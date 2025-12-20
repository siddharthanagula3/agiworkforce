import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';

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
  mac: 'agi-workforce-mac.dmg',
  windows: 'agi-workforce-win.exe',
  linux: 'agi-workforce-linux.AppImage',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'mac';

  // Validate platform
  if (!['mac', 'windows', 'linux'].includes(platform)) {
    return NextResponse.json(
      { error: 'Invalid platform. Must be mac, windows, or linux.' },
      { status: 400 },
    );
  }

  const info = DOWNLOAD_INFO[platform];
  const externalUrl = process.env[info.envVar];

  // If external URL is configured (CDN, S3, etc.), redirect to it
  if (externalUrl && !externalUrl.startsWith('/')) {
    return NextResponse.redirect(externalUrl, { status: 307 });
  }

  // Serve from local public/downloads folder
  try {
    const filePath = path.join(process.cwd(), 'public', 'downloads', FILE_PATHS[platform]);
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
    return NextResponse.json(
      { error: `Download for ${platform} is currently unavailable.` },
      { status: 404 },
    );
  }
}
