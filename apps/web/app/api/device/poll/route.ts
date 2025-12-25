import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getEnv, requireEnv } from '@/utils/env';

/**
 * Validate device_id format and length
 */
function validateDeviceId(deviceId: string): { valid: boolean; error?: string } {
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: 'device_id must be a non-empty string' };
  }

  if (deviceId.length > 255) {
    return { valid: false, error: 'device_id must be 255 characters or less' };
  }

  // Allow alphanumeric, dashes, underscores, and dots
  if (!/^[a-zA-Z0-9._-]+$/.test(deviceId)) {
    return {
      valid: false,
      error:
        'device_id contains invalid characters. Only alphanumeric, dashes, underscores, and dots are allowed.',
    };
  }

  return { valid: true };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { device_id } = body;

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 });
    }

    // Validate device_id format and length
    const validation = validateDeviceId(device_id);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const cookieStore = await cookies();

    // Safe environment variable access
    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', '') || requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createServerClient(supabaseUrl, serviceRoleKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });

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
  } catch (error) {
    console.error('[device/poll] Error:', error);
    // Don't expose internal error details to client
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
