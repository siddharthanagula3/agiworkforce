import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import type { User } from '@supabase/supabase-js';

async function handleGetMe(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    let user: User | null = null;

    // Check for Bearer token in Authorization header (desktop/mobile app)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Create a regular Supabase client to verify the JWT token
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          flowType: 'pkce',
        },
      });

      const { data, error: authError } = await supabase.auth.getUser(token);

      if (authError || !data.user) {
        logger.warn({ error: authError }, 'Bearer token authentication failed');
        throw createError.unauthorized('Invalid authentication token');
      }

      user = data.user;
    } else {
      // Fall back to cookie-based authentication (web app)
      const cookieStore = await cookies();

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          flowType: 'pkce',
        },
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },

          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch {
              // ignore cookie setting errors
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch {
              // ignore cookie removal errors
            }
          },
        },
      });

      const {
        data: { user: cookieUser },
        error: cookieAuthError,
      } = await supabase.auth.getUser();

      if (cookieAuthError || !cookieUser) {
        throw createError.unauthorized();
      }

      user = cookieUser;
    }

    if (!user) {
      throw createError.unauthorized();
    }

    // Fetch subscription using SubscriptionService (uses service role, works for both auth methods)
    let subscription = null;
    try {
      subscription = await SubscriptionService.getSubscription(user.id);
    } catch (subscriptionError) {
      logger.warn(
        {
          userId: user.id,
          error: subscriptionError,
        },
        'Error fetching subscription',
      );
    }

    const feature_flags = {
      beta_features: true,
      advanced_model_access:
        subscription?.plan_tier === 'pro' ||
        subscription?.plan_tier === 'max' ||
        subscription?.plan_tier === 'enterprise',
    };

    const plan = {
      tier: subscription?.plan_tier || 'free',
      display_name:
        (subscription?.plan_tier || 'free').charAt(0).toUpperCase() +
        (subscription?.plan_tier || 'free').slice(1),
      status: subscription?.status || 'none',
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end).getTime() / 1000
        : null,
    };

    // Get credit balance
    let credits = null;
    try {
      credits = await CreditService.getBalance(user.id);
    } catch (creditError) {
      logger.warn(
        {
          error: creditError,
          userId: user.id,
        },
        'Failed to get credit balance',
      );
      // Don't fail the request if credit balance fetch fails
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.['full_name'] || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.['avatar_url'] || null,
      created_at: new Date(user.created_at).getTime() / 1000,
      updated_at: user.updated_at ? new Date(user.updated_at).getTime() / 1000 : Date.now() / 1000,
      plan,
      feature_flags,
      credits,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in /api/me',
    );
    throw error;
  }
}

export const GET = withErrorHandler(handleGetMe);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
