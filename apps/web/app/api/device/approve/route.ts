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
  // Reuse the device-link limiter; this endpoint is also security-sensitive.
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
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
          user_id: session.user.id,
          denied_at: nowIso,
          updated_at: nowIso,
          // Ensure no tokens remain
          access_token: null,
          refresh_token: null,
          user_email: session.user.email ?? null,
          user_name:
            (session.user.user_metadata?.['full_name'] as string | undefined) ||
            session.user.email?.split('@')[0] ||
            null,
        })
        .eq('device_id', record.device_id)
        .eq('status', 'pending')
        .select('status')
        .maybeSingle();

      if (updateError || !updated) {
        throw createError.conflict('This device code has already been processed');
      }

      return NextResponse.json({ success: true, status: 'denied' }, { status: 200 });
    }

    // Approve: store the current session tokens for the device to retrieve exactly once.
    const accessToken = session.access_token;
    const refreshToken = session.refresh_token;

    if (!accessToken || !refreshToken) {
      throw createError.internal('Missing session tokens');
    }

    const userEmail = session.user.email ?? null;
    const userName =
      (session.user.user_metadata?.['full_name'] as string | undefined) ||
      userEmail?.split('@')[0] ||
      null;

    const { error: updateError, data: updated } = await admin
      .from('device_authorization_codes')
      .update({
        status: 'approved',
        user_id: session.user.id,
        user_email: userEmail,
        user_name: userName,
        access_token: accessToken,
        refresh_token: refreshToken,
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

    return NextResponse.json({ success: true, status: 'approved' }, { status: 200 });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in /api/device/approve',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleDeviceApprove);
