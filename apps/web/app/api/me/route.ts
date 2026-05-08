import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  createAuthClient,
  createDatabaseClient,
  SupabaseDatabaseAdapter,
  type AuthAdapter,
  type VerifiedJwt,
} from '@agiworkforce/data-layer';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { canAccessManualModelSelection } from '@agiworkforce/types';

/**
 * # /api/me — vertical-slice migration to @agiworkforce/data-layer
 *
 * This route is the proof-of-concept for the data-layer abstraction. The
 * pattern documented here is the template for migrating the remaining ~90
 * API routes one PR at a time.
 *
 * ## What changed
 *
 * Before: route imported `createClient` from `@supabase/supabase-js` and
 * `getUserClient` from `@/lib/supabase-server` directly. Swapping Supabase
 * out required editing every route.
 *
 * After: route uses `createAuthClient()` (an `AuthAdapter`) to verify
 * Bearer JWTs and `createDatabaseClient().withUser(jwt).raw()` to obtain
 * the RLS-bound `SupabaseClient` the service classes still expect.
 *
 * ## Migration path for other routes
 *
 * 1. Replace `getUserClient(jwt)` with
 *    `createDatabaseClient().withUser(jwt)` (gives a `DatabaseAdapter`).
 * 2. If a downstream service (e.g. `SubscriptionService.getSubscription`)
 *    still requires a `SupabaseClient`, cast the adapter to
 *    `SupabaseDatabaseAdapter` and call `.raw()`. This is intentionally
 *    a temporary escape hatch — when we migrate the service to take a
 *    `DatabaseAdapter` directly, the cast goes away.
 * 3. Replace direct `createClient(...).auth.getUser(token)` calls with
 *    `createAuthClient().verifyJwt(token)`.
 * 4. Cookie-based auth (browser flows) remains via `@supabase/ssr`'s
 *    `createServerClient` — that's a UI concern, not a data-layer concern,
 *    so we deliberately do NOT abstract it. When migrating away from
 *    Supabase Auth for cookie flows, swap to the new IdP's SSR helper.
 *
 * Track migrated routes in `docs/SCALING.md` §"Vertical-slice migration log".
 */
async function handleGetMe(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    let verifiedUser: VerifiedJwt | null = null;
    let userClient: SupabaseClient | null = null;

    // Check for Bearer token in Authorization header (desktop/mobile app)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Auth: vendor-portable JWT verification.
      const auth: AuthAdapter = createAuthClient();
      verifiedUser = await auth.verifyJwt(token);

      if (!verifiedUser) {
        logger.warn('Bearer token authentication failed');
        throw createError.unauthorized('Invalid authentication token');
      }

      // DB: vendor-portable RLS-bound database. The escape hatch `.raw()`
      // hands us back the underlying SupabaseClient because the existing
      // service classes (SubscriptionService, CreditService) still expect
      // one. When those services are migrated to take a DatabaseAdapter,
      // we'll drop the cast + raw() call.
      const db = createDatabaseClient();
      const userDb = db.withUser(token);
      userClient = await (userDb as SupabaseDatabaseAdapter).raw();
    } else {
      // Cookie-based authentication (web app SSR). This stays on the
      // Supabase SSR client because the cookie flow is identity-provider
      // specific — when we migrate Auth, we'll swap this for the new IdP's
      // SSR helper. The data-layer interface intentionally does NOT
      // abstract cookie flows.
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

      const cookieVerified: VerifiedJwt = {
        userId: cookieUser.id,
        raw: cookieUser as unknown as Record<string, unknown>,
      };
      if (cookieUser.email) {
        cookieVerified.email = cookieUser.email;
      }
      verifiedUser = cookieVerified;
      // The SSR client is already RLS-bound via cookie session.
      userClient = supabase;
    }

    if (!verifiedUser || !userClient) {
      throw createError.unauthorized();
    }

    // Surface the raw user object (preserved from the auth provider) for
    // downstream profile fields. We narrow once instead of repeatedly.
    const rawUser = (verifiedUser.raw ?? {}) as {
      id?: string;
      email?: string;
      created_at?: string;
      updated_at?: string;
      user_metadata?: { full_name?: string; avatar_url?: string };
    };

    const userId = verifiedUser.userId;
    const userEmail = verifiedUser.email ?? rawUser.email;

    // Three independent reads — fan out in parallel (Vercel rule
    // `async-parallel`). Each promise has its own try/catch so a transient
    // failure on one (e.g. credit balance) doesn't take down the whole
    // /api/me response. Routing preferences default to `{}` on any error.
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

    const createdAt = rawUser.created_at ? new Date(rawUser.created_at).getTime() / 1000 : null;
    const updatedAt = rawUser.updated_at
      ? new Date(rawUser.updated_at).getTime() / 1000
      : Date.now() / 1000;

    return NextResponse.json({
      id: userId,
      email: userEmail ?? null,
      name: rawUser.user_metadata?.full_name || userEmail?.split('@')[0] || 'User',
      avatar_url: rawUser.user_metadata?.avatar_url || null,
      created_at: createdAt,
      updated_at: updatedAt,
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
