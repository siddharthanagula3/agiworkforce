import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');

  if (!platform || !['mac', 'windows', 'linux'].includes(platform)) {
    return NextResponse.json(
      { error: 'Invalid platform requested. Must be mac, windows, or linux.' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      { error: 'Authentication required to download beta binaries.' },
      { status: 401 },
    );
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!subscription || subscription.status !== 'active') {
    return NextResponse.json(
      { error: 'A Pro subscription is required to access the public beta.' },
      { status: 403 },
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
