import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv, requireEnv } from '@/utils/env';
import { DevicePollRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { decryptToken } from '@/lib/device-token-crypto';

async function handleDevicePoll(request: NextRequest) {
  // Parse body once and reuse - request.json() can only be called once
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  // Rate limiting - use device_id as identifier
  const deviceId = (parsedBody as Record<string, unknown>)?.device_id as string | undefined;

  const rateLimitResponse = await withRateLimit(
    request,
    'device-poll',
    deviceId ? `device:${deviceId}` : undefined,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Validate the already-parsed request body
    const body = parsedBody;

    const validationResult = DevicePollRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw createError.validation('Invalid request body', validationResult.error);
    }

    const { device_id, device_fingerprint } = validationResult.data;

    // Safe environment variable access
    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', '') || requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // AUDIT-008-008: Use explicit column selection instead of SELECT *
    const { data, error } = await supabase
      .from('device_authorization_codes')
      .select('device_id, device_fingerprint, status, user_id, expires_at, updated_at')
      .eq('device_id', device_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Expiry check first (also treat already-consumed codes as expired)
    if (data.status === 'consumed' || new Date(data.expires_at) < new Date()) {
      if (data.status === 'pending') {
        // Best-effort: mark pending codes as expired
        await supabase
          .from('device_authorization_codes')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('device_id', device_id);
      }
      return NextResponse.json({ status: 'expired' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Device ownership verification: if a fingerprint was recorded, require a matching fingerprint.
    if (data.device_fingerprint) {
      if (!device_fingerprint || data.device_fingerprint !== device_fingerprint) {
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
    }

    if (data.status === 'approved' && data.user_id) {
      // Atomically consume tokens (approved -> consumed) and return them exactly once.
      // This prevents double-poll races from leaking tokens multiple times.
      const { data: consumedRows, error: consumeError } = await supabase.rpc(
        'consume_device_authorization_tokens',
        { p_device_id: device_id },
      );

      if (consumeError) {
        logger.error(
          { error: consumeError, deviceId: device_id },
          'Failed to consume device tokens',
        );
        throw createError.internal('Failed to consume device authorization tokens');
      }

      const consumed = (Array.isArray(consumedRows) ? consumedRows[0] : consumedRows) as {
        status?: string;
        user_id?: string | null;
        user_email?: string | null;
        user_name?: string | null;
        access_token?: string | null;
        refresh_token?: string | null;
      } | null;

      if (!consumed?.status) {
        return NextResponse.json(
          { status: 'pending' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (consumed.status === 'expired' || consumed.status === 'consumed') {
        return NextResponse.json(
          { status: 'expired' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (consumed.status === 'denied' || consumed.status === 'revoked') {
        return NextResponse.json(
          { status: 'denied' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (consumed.status !== 'approved') {
        return NextResponse.json(
          { status: 'pending' },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (!consumed.access_token || !consumed.refresh_token || !consumed.user_id) {
        logger.warn(
          { deviceId: device_id, status: consumed.status },
          'Device code approved but tokens missing after consumption',
        );
        return NextResponse.json({ status: 'pending' });
      }

      // Decrypt tokens that were encrypted at rest by the approve endpoint
      let accessToken: string;
      let refreshToken: string;
      try {
        accessToken = decryptToken(consumed.access_token);
        refreshToken = decryptToken(consumed.refresh_token);
      } catch (decryptError) {
        logger.error(
          {
            error: decryptError instanceof Error ? decryptError.message : String(decryptError),
            deviceId: device_id,
          },
          'Failed to decrypt device tokens — they may have been stored before encryption was enabled',
        );
        throw createError.internal('Failed to decrypt device authorization tokens');
      }

      return NextResponse.json(
        {
          status: 'approved',
          access_token: accessToken,
          refresh_token: refreshToken,
          user: {
            id: consumed.user_id,
            email: consumed.user_email,
            name: consumed.user_name,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } else if (data.status === 'denied') {
      return NextResponse.json({ status: 'denied' }, { headers: { 'Cache-Control': 'no-store' } });
    } else if (data.status === 'revoked') {
      return NextResponse.json({ status: 'denied' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ status: 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
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

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
