import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';

/**
 * Canonical Supabase server-side clients per docs/plans/UNIFIED_LAUNCH_PLAN.md §1
 * (WEB-RLS-BYPASS mitigation).
 *
 * # Security policy
 *
 * Two clients exist; pick the right one for the operation:
 *
 * ## `getServiceClient()` — bypass RLS
 *
 * Uses `SUPABASE_SERVICE_ROLE_KEY`. Bypasses ALL row-level security policies.
 * Use ONLY for:
 *   - JWT verification (`auth.getUser(token)`)
 *   - Stripe webhook handlers (no user context)
 *   - Cron jobs / background workers (no user context)
 *   - Admin endpoints explicitly running outside user context
 *
 * MUST NOT be used to read or write user-scoped data on behalf of an
 * authenticated request. If you find yourself calling this from a route
 * handler that received a user JWT, you almost certainly want
 * `getUserClient(userJwt)` instead.
 *
 * ## `getUserClient(userJwt)` — RLS-bound
 *
 * Uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` + the user's JWT in the Authorization
 * header. RLS policies are enforced. This is the SAFE default for any DB op
 * that should only see/modify the requesting user's rows.
 *
 * Use for:
 *   - Reading the user's own subscription, credits, settings
 *   - Writing the user's own messages, conversations, projects
 *   - Any operation that should fail if RLS forbids it
 *
 * ## Migration plan
 *
 * The 7 service files (subscription-service, credit-service, audit-service,
 * api-key-service, organization-service, security-monitoring-service,
 * notification-service) currently each define a private `getSupabaseClient()`
 * that returns a service-role client. They are CURRENTLY SAFE because every
 * query filters by `.eq('user_id', userId)`, but a regression that drops the
 * filter would silently leak across tenants.
 *
 * Migration: each service method that takes a `userId` should accept a
 * `SupabaseClient` parameter (passed by the caller, constructed from the
 * caller's user JWT). Service methods that legitimately run without user
 * context (Stripe webhook → SubscriptionService.upsertFromStripe) keep using
 * the service-role client explicitly.
 */

let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/**
 * Returns a Supabase client scoped to a specific user via their JWT.
 * RLS policies are enforced — queries only see rows the user can access.
 *
 * @param userJwt - The user's access token from the Authorization header
 *                  (without the "Bearer " prefix)
 */
export function getUserClient(userJwt: string): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}
