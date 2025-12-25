import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';
import { createSupabaseServerClient } from '../../../services/supabase-server';

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
  mac: 'agiworkforce.dmg',
  windows: 'agi-workforce-win.exe',
  linux: 'agi-workforce-linux.AppImage',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'mac';

  if (!['mac', 'windows', 'linux'].includes(platform)) {
    return NextResponse.json(
      { error: 'Invalid platform. Must be mac, windows, or linux.' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Authentication required to download.' }, { status: 401 });
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const activeStatuses = ['active', 'trialing'];
  const hasActiveSubscription = subscription && activeStatuses.includes(subscription.status);

  if (!hasActiveSubscription) {
    return NextResponse.json(
      { error: 'Active subscription required to download.' },
      { status: 403 },
    );
  }

  const info = DOWNLOAD_INFO[platform];
  const externalUrl = process.env[info.envVar];

  if (externalUrl && !externalUrl.startsWith('/')) {
    return NextResponse.redirect(externalUrl, { status: 307 });
  }

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
