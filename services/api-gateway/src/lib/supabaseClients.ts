/**
 * Canonical Supabase server-side clients for the api-gateway service per
 * docs/plans/UNIFIED_LAUNCH_PLAN.md §1 (WEB-RLS-BYPASS mitigation, mirrored
 * to api-gateway in Wave 1.5 prevention layer).
 *
 * Mirror of `apps/web/lib/supabase-server.ts` — same security policy and
 * helper shape so call sites can be migrated identically across surfaces.
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
 * Uses `SUPABASE_ANON_KEY` + the user's JWT in the Authorization header.
 * RLS policies are enforced. This is the SAFE default for any DB op that
 * should only see/modify the requesting user's rows.
 *
 * Use for:
 *   - Reading the user's own subscription, credits, settings
 *   - Writing the user's own messages, conversations, projects
 *   - Any operation that should fail if RLS forbids it
 *
 * ## Migration plan (Wave 1 P0-G)
 *
 * The api-gateway routes (`cloudChat`, `chat`, `credits`, `pair`,
 * `deviceAuth`, `desktop`, etc.) currently import the legacy
 * `supabase` singleton from `./supabase.ts` — that singleton uses the
 * service-role key and bypasses RLS. Routes are CURRENTLY SAFE because
 * every query filters by `.eq('user_id', userId)`, but a regression that
 * drops the filter would silently leak across tenants.
 *
 * Migration: each route handler that authenticates a user JWT (via the
 * `requireAuth` middleware) should swap `supabase` for
 * `getUserClient(req.user.jwt)`. Routes that legitimately run without
 * user context (e.g. webhook receivers, internal worker queues) keep
 * using `getServiceClient()` explicitly.
 *
 * That migration is scheduled for Wave 1 P0-G; this file lands in the
 * prevention-layer wave so the helpers exist BEFORE any route is
 * migrated.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '../env';

let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = requireEnv('SUPABASE_URL');
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
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}
