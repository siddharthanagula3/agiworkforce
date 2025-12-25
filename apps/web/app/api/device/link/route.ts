import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
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

/**
 * Validate device_name format and length
 */
function validateDeviceName(deviceName: string | undefined): { valid: boolean; error?: string } {
  if (deviceName === undefined || deviceName === null) {
    return { valid: true }; // Optional field
  }

  if (typeof deviceName !== 'string') {
    return { valid: false, error: 'device_name must be a string' };
  }

  if (deviceName.length > 200) {
    return { valid: false, error: 'device_name must be 200 characters or less' };
  }

  // Allow most printable characters except control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(deviceName)) {
    return {
      valid: false,
      error: 'device_name contains invalid control characters',
    };
  }

  return { valid: true };
}

/**
 * Validate device_type format
 */
function validateDeviceType(deviceType: string | undefined): { valid: boolean; error?: string } {
  if (deviceType === undefined || deviceType === null) {
    return { valid: true }; // Optional field
  }

  if (typeof deviceType !== 'string') {
    return { valid: false, error: 'device_type must be a string' };
  }

  if (deviceType.length > 50) {
    return { valid: false, error: 'device_type must be 50 characters or less' };
  }

  // Allow alphanumeric, dashes, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceType)) {
    return {
      valid: false,
      error:
        'device_type contains invalid characters. Only alphanumeric, dashes, and underscores are allowed.',
    };
  }

  return { valid: true };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { device_id, device_name, device_type } = body;

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 });
    }

    // Validate all inputs
    const deviceIdValidation = validateDeviceId(device_id);
    if (!deviceIdValidation.valid) {
      return NextResponse.json({ error: deviceIdValidation.error }, { status: 400 });
    }

    const deviceNameValidation = validateDeviceName(device_name);
    if (!deviceNameValidation.valid) {
      return NextResponse.json({ error: deviceNameValidation.error }, { status: 400 });
    }

    const deviceTypeValidation = validateDeviceType(device_type);
    if (!deviceTypeValidation.valid) {
      return NextResponse.json({ error: deviceTypeValidation.error }, { status: 400 });
    }

    const cookieStore = await cookies();

    // Safe environment variable access
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // No-op for server-side
        },
        remove() {},
      },
    });

    const user_code = randomBytes(3).toString('hex').toUpperCase();
    const appUrl = getEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
    const verify_url = `${appUrl}/verify?code=${user_code}`;

    const { error } = await supabase.from('device_authorization_codes').insert({
      device_id,
      device_name: device_name || null,
      device_type: device_type || null,
      user_code,
      status: 'pending',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error('[device/link] Failed to create device code:', error);
      return NextResponse.json({ error: 'Failed to initiate device linking' }, { status: 500 });
    }

    return NextResponse.json({
      link_code: user_code,
      device_id,
      expires_at: Math.floor((Date.now() + 15 * 60 * 1000) / 1000),
      verify_url,
      qr_code_url: null,
    });
  } catch (error) {
    console.error('[device/link] Error:', error);
    // Don't expose internal error details to client
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
