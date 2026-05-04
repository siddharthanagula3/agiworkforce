import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/services/supabase-server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { encryptToken } from '@/lib/device-token-crypto';

const DeviceApproveRequestSchema = z.object({
  code: z
    .string()
    .min(1, 'code is required')
    .max(64, 'code is too long')
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => /^[A-F0-9]+$/.test(v), 'code must be a hex string'),
  action: z.enum(['approve', 'deny']).optional(),
});

async function handleDeviceApprove(request: NextRequest): Promise<NextResponse> {
  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Reuse the device-link limiter; this endpoint is also security-sensitive.
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const supabase = await createSupabaseServerClient();
    // Use getUser() for server-side JWT validation - getSession() reads from
    // the cookie without server verification and must not be trusted for auth.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      throw createError.unauthorized('Please sign in to continue');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw createError.validation('Invalid JSON in request body');
    }

    const parsed = DeviceApproveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw createError.validation('Invalid request body', parsed.error);
    }

    const code = parsed.data.code;
    const action = parsed.data.action ?? 'approve';

    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Ensure the code exists and hasn't expired
    const { data: record, error: fetchError } = await admin
      .from('device_authorization_codes')
      .select('device_id, status, expires_at')
      .eq('user_code', code)
      .single();

    if (fetchError || !record) {
      throw createError.validation('Invalid or expired device code');
    }

    if (new Date(record.expires_at) < new Date()) {
      await admin
        .from('device_authorization_codes')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('device_id', record.device_id);
      throw createError.validation('This device code has expired');
    }

    if (record.status !== 'pending') {
      // Already processed (approved/denied/consumed/revoked/expired)
      throw createError.conflict('This device code has already been processed');
    }

    const nowIso = new Date().toISOString();

    if (action === 'deny') {
      const { error: updateError, data: updated } = await admin
        .from('device_authorization_codes')
        .update({
          status: 'denied',
          user_id: user.id,
          denied_at: nowIso,
          updated_at: nowIso,
          // Ensure no tokens remain
          access_token: null,
          refresh_token: null,
          user_email: user.email ?? null,
          user_name:
            (user.user_metadata?.['full_name'] as string | undefined) ||
            user.email?.split('@')[0] ||
            null,
        })
        .eq('device_id', record.device_id)
        .eq('status', 'pending')
        .select('status')
        .maybeSingle();

      if (updateError || !updated) {
        throw createError.conflict('This device code has already been processed');
      }

      return NextResponse.json(
        { success: true, status: 'denied' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Approve: store the current session tokens (encrypted) for the device to retrieve exactly once.
    // Identity was already verified via getUser() above; getSession() is used only to retrieve
    // the raw token strings that the device needs to authenticate.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const refreshToken = session?.refresh_token;

    if (!accessToken || !refreshToken) {
      throw createError.internal('Missing session tokens');
    }

    // Encrypt tokens at rest - the poll endpoint will decrypt on retrieval
    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = encryptToken(refreshToken);

    const userEmail = user.email ?? null;
    const userName =
      (user.user_metadata?.['full_name'] as string | undefined) || userEmail?.split('@')[0] || null;

    const { error: updateError, data: updated } = await admin
      .from('device_authorization_codes')
      .update({
        status: 'approved',
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        authorized_at: nowIso,
        updated_at: nowIso,
      })
      .eq('device_id', record.device_id)
      .eq('status', 'pending')
      .select('status')
      .maybeSingle();

    if (updateError || !updated) {
      throw createError.conflict('This device code has already been processed');
    }

    return NextResponse.json(
      { success: true, status: 'approved' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in /api/device/approve',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDeviceApprove);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
