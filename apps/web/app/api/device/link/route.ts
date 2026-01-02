import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getEnv, requireEnv } from '@/utils/env';
import { DeviceLinkRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

async function handleDeviceLink(request: NextRequest) {
  // Rate limiting - prevent abuse of device code generation
  const rateLimitResponse = await withRateLimit(request, 'device-link');
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

    const validationResult = DeviceLinkRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw createError.validation('Invalid request body', validationResult.error);
    }

    const { device_id, device_name, device_type } = validationResult.data;

    const cookieStore = await cookies();

    // Safe environment variable access
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce', // Use PKCE flow for enhanced security
      },
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

    // Generate device code with higher entropy (5 bytes = 10 hex chars = 2^40 possibilities)
    // This makes brute-force attacks infeasible even within the 15-minute window
    const user_code = randomBytes(5).toString('hex').toUpperCase();
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
      logger.error(
        {
          error,
          device_id,
        },
        'Failed to create device code',
      );
      throw createError.internal('Failed to create device authorization code');
    }

    logger.info(
      {
        device_id,
        device_name,
        device_type,
        user_code,
      },
      'Device authorization code created',
    );

    return NextResponse.json(
      {
        user_code,
        verify_url,
        expires_in: 900, // 15 minutes in seconds
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in device/link',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDeviceLink);
