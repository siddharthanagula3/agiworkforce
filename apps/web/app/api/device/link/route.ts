import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
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

    const { device_id, device_name, device_type, device_fingerprint } = validationResult.data;
    const resolvedDeviceType = device_type || 'desktop';

    // Safe environment variable access
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Generate device code with higher entropy (5 bytes = 10 hex chars = 2^40 possibilities)
    // This makes brute-force attacks infeasible even within the 15-minute window
    const link_code = randomBytes(5).toString('hex').toUpperCase();
    const appUrl = getEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
    const verify_url = `${appUrl}/verify?code=${link_code}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Upsert by device_id (device_id is unique). This supports re-linking without throwing.
    const { error } = await supabase.from('device_authorization_codes').upsert(
      {
        device_id,
        device_name: device_name || null,
        device_type: resolvedDeviceType,
        device_fingerprint: device_fingerprint || null,
        user_code: link_code,
        status: 'pending',
        user_id: null,
        user_email: null,
        user_name: null,
        access_token: null,
        refresh_token: null,
        authorized_at: null,
        consumed_at: null,
        denied_at: null,
        revoked_at: null,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'device_id' },
    );

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

    return NextResponse.json(
      {
        link_code,
        device_id,
        verify_url,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        qr_code_url: null,
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
