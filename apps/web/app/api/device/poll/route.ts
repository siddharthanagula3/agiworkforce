import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getEnv, requireEnv } from '@/utils/env';
import { DevicePollRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

async function handleDevicePoll(request: NextRequest) {
  // Rate limiting - use device_id as identifier
  let deviceId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    deviceId = body?.device_id;
  } catch {
    // Will be caught by validation below
  }

  const rateLimitResponse = await withRateLimit(
    request,
    'device-poll',
    deviceId ? `device:${deviceId}` : undefined,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createError.validation('Invalid JSON in request body');
    }

    const validationResult = DevicePollRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw createError.validation('Invalid request body', validationResult.error);
    }

    const { device_id, device_fingerprint } = validationResult.data;

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

    // Device ownership verification: ensure the fingerprint matches
    if (data.device_fingerprint && data.device_fingerprint !== device_fingerprint) {
      logger.warn(
        {
          deviceId: device_id,
          expectedFingerprint: data.device_fingerprint,
          providedFingerprint: device_fingerprint,
        },
        'Device fingerprint mismatch - potential unauthorized access attempt',
      );
      throw createError.forbidden('Device fingerprint does not match');
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
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        deviceId,
      },
      'Error in device/poll',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDevicePoll);
