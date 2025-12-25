import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';

async function handleGetMe(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const cookieStore = await cookies();

    // Safe environment variable access
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw createError.unauthorized();
    }

    const user = session.user;

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Log subscription fetch errors but don't fail the request
    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is acceptable
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
        subscription?.plan_tier === 'pro' || subscription?.plan_tier === 'enterprise',
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
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      avatar_url: user.user_metadata?.avatar_url || null,
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
