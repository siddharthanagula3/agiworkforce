import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getEnv, requireEnv } from '@/utils/env';
import { DeviceLinkRequestSchema } from '@/lib/validations/device';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

async function handleDeviceLink(request: NextRequest) {
  // CSRF protection - prevent cross-site device pairing
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Rate limiting - prevent abuse of device code generation
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // SECURITY: Require authenticated session to prevent device-code phishing attacks (CodeRabbit C4 fix)
  // Without authentication, an attacker can pre-seed a device_id, trick a victim into approving,
  // and collect session tokens. Requiring auth ensures only legitimate users can initiate device linking.
  const supabaseAuthUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', '') || requireEnv('SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabaseAuth = createClient(supabaseAuthUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required to link a device' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const accessToken = authHeader.slice(7);
  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseAuth.auth.getUser(accessToken);

  if (authError || !authUser) {
    logger.warn({ error: authError?.message }, 'Unauthenticated device link attempt rejected');
    return NextResponse.json(
      { error: 'Invalid or expired authentication token' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
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

    // Generate device code with 64-bit entropy (8 bytes = 16 hex chars = 2^64 possibilities)
    // Retry on rare uniqueness conflicts to avoid transient pairing failures.
    let link_code = '';
    let upsertError: unknown = null;

    // Validate NEXT_PUBLIC_APP_URL to prevent verification links pointing to wrong domains
    const appUrlRaw = getEnv('NEXT_PUBLIC_APP_URL', 'https://agiworkforce.com');
    let appUrl: string;
    try {
      const parsed = new URL(appUrlRaw);
      if (parsed.protocol !== 'https:') {
        throw new Error(`Expected https: protocol, got ${parsed.protocol}`);
      }
      appUrl = parsed.origin;
    } catch (err) {
      logger.warn({ appUrl: appUrlRaw, err }, 'NEXT_PUBLIC_APP_URL is invalid; using default');
      appUrl = 'https://agiworkforce.com';
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    for (let attempt = 0; attempt < 3; attempt++) {
      link_code = randomBytes(8).toString('hex').toUpperCase();
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

      if (!error) {
        upsertError = null;
        break;
      }

      upsertError = error;
      const isUniqueViolation =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505';
      if (!isUniqueViolation) {
        break;
      }
    }

    if (upsertError) {
      logger.error(
        {
          error: upsertError,
          device_id,
        },
        'Failed to create device code',
      );
      throw createError.internal('Failed to create device authorization code');
    }

    const verify_url = `${appUrl}/verify?code=${encodeURIComponent(link_code)}`;

    // Generate QR code URL using a reliable public service
    // The QR code encodes the verification URL for easy mobile scanning
    const encodedVerifyUrl = encodeURIComponent(verify_url);
    const qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=svg&data=${encodedVerifyUrl}`;

    return NextResponse.json(
      {
        link_code,
        device_id,
        verify_url,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        qr_code_url,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
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

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
