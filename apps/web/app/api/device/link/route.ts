import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function POST(request: Request) {
  const body = await request.json();
  const { device_id, device_name, device_type } = body;

  if (!device_id) {
    return NextResponse.json({ error: 'Missing device_id' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // Note: In a route handler, we might not need to set cookies for the *response* unless establishing session.
          // For just DB access, this is fine.
        },
        remove() {},
      },
    },
  );

  // Generate a user code (e.g. ABCD-1234)
  const user_code = randomBytes(3).toString('hex').toUpperCase(); // Simple 6 char hex
  const verify_url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://agiworkforce.com'}/device/activate?code=${user_code}`;

  // Store pending link request
  const { error } = await supabase.from('device_authorization_codes').insert({
    device_id,
    device_name,
    device_type,
    user_code,
    status: 'pending',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
  });

  if (error) {
    console.error('Failed to create device code:', error);
    return NextResponse.json({ error: 'Failed to initiate device linking' }, { status: 500 });
  }

  return NextResponse.json({
    link_code: user_code,
    device_id,
    expires_at: Math.floor((Date.now() + 15 * 60 * 1000) / 1000),
    verify_url,
    qr_code_url: null,
  });
}
