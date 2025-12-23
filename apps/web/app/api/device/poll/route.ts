import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { device_id } = body;

  if (!device_id) {
    return NextResponse.json({ error: 'Missing device_id' }, { status: 400 });
  }

  const cookieStore = await cookies();

  // Use Service Role for polling to bypass RLS or check unauthenticated
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );

  const { data, error } = await supabase
    .from('device_authorization_codes')
    .select('*')
    .eq('device_id', device_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ status: 'pending' });
  }

  if (data.status === 'approved' && data.user_id) {
    return NextResponse.json({
      status: 'approved',
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: {
        id: data.user_id,
        email: data.user_email,
        name: data.user_name,
      },
    });
  } else if (data.status === 'denied') {
    return NextResponse.json({ status: 'denied' });
  } else if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ status: 'expired' });
  }

  return NextResponse.json({ status: 'pending' });
}
