import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-server';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { canAccessManualModelSelection } from '@agiworkforce/types';

async function handleGetMe(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Auth: supports both Clerk session (cookie) and Bearer token paths.
    const { userId, email } = await getClerkAuthUser(request);

    // Service-role client for DB reads. The queries below filter by userId so
    // there is no cross-tenant data leak even without RLS.
    const userClient = getServiceClient();

    // Three independent reads — fan out in parallel.
    const [subscription, credits, routing_preferences] = await Promise.all([
      SubscriptionService.getSubscription(userClient, userId).catch(
        (subscriptionError: unknown) => {
          logger.warn({ userId, error: subscriptionError }, 'Error fetching subscription');
          return null;
        },
      ),
      CreditService.getBalance(userClient, userId).catch((creditError: unknown) => {
        logger.warn({ error: creditError, userId }, 'Failed to get credit balance');
        return null;
      }),
      (async (): Promise<{ us_only?: boolean; geo_overlay?: string }> => {
        try {
          const { data: profileRow } = await userClient
            .from('profiles')
            .select('routing_preferences')
            .eq('id', userId)
            .maybeSingle();
          const raw = (profileRow as { routing_preferences?: unknown } | null)?.routing_preferences;
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as { us_only?: boolean; geo_overlay?: string };
          }
          return {};
        } catch (prefsError) {
          logger.warn(
            { userId, error: prefsError },
            'Failed to fetch routing_preferences — defaulting to {}',
          );
          return {};
        }
      })(),
    ]);

    const feature_flags = {
      beta_features: true,
      advanced_model_access: canAccessManualModelSelection(subscription?.plan_tier),
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

    return NextResponse.json({
      id: userId,
      email: email ?? null,
      name: email?.split('@')[0] || 'User',
      avatar_url: null,
      created_at: null,
      updated_at: Date.now() / 1000,
      plan,
      feature_flags,
      credits,
      routing_preferences,
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
