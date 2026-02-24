import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/services/supabase-server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';

async function handleSyncSubscription(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'sync-subscription');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    let userId: string | null = null;
    let email: string | null = null;

    // Support Bearer tokens (desktop/mobile) and cookie sessions (web)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, flowType: 'pkce' },
      });

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        logger.warn({ error }, 'sync-subscription: bearer token auth failed');
        throw createError.unauthorized('Invalid authentication token');
      }

      userId = data.user.id;
      email = data.user.email ?? null;
    } else {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw createError.unauthorized('Please sign in to continue');
      }

      userId = user.id;
      email = user.email ?? null;
    }

    if (!userId || !email) {
      throw createError.unauthorized('Unable to resolve user identity');
    }

    const subscription = await SubscriptionService.syncWithStripe(userId, email);

    return NextResponse.json(
      {
        success: !!subscription,
        subscription,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in /api/sync-subscription',
    );
    throw error;
  }
}

export const POST = withErrorHandler(handleSyncSubscription);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
