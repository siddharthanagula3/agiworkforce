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
import jwt from 'jsonwebtoken';
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

// ===========================================================================
// P0-G — gateway mint of per-request Supabase JWTs (Wave 1, 2026-05-08)
// ===========================================================================
//
// Why this exists
//   The api-gateway issues its own HS256 access tokens (issuer
//   `agiworkforce-api-gateway`, signed with `JWT_SECRET`). Those JWTs are
//   meaningless to Supabase — passing one to `getUserClient(jwt)` results
//   in an immediate 401 from the PostgREST layer because the signature
//   doesn't verify against `SUPABASE_JWT_SECRET`. So the gateway can't
//   route through the same `getUserClient(req.user.jwt)` path the web
//   surface uses.
//
// Architecture decision (team-lead, 2026-05-08): the gateway mints a
// SHORT-LIVED Supabase-shaped JWT per request, using `SUPABASE_JWT_SECRET`,
// claiming `sub = req.user.userId` and `role = 'authenticated'`. RLS
// policies that read `auth.uid()` then resolve to the same user identity
// the gateway already verified.
//
// Why this is privilege-neutral
//   The gateway already holds `SUPABASE_SERVICE_ROLE_KEY` — strictly more
//   powerful than the ability to mint an `authenticated`-role JWT. Adding
//   `SUPABASE_JWT_SECRET` doesn't increase the gateway's blast radius;
//   it just gives it a less-privileged tool to use.
//
// Verification gate (2026-05-08, services-fix):
//   - Confirmed `userId` in gateway-issued JWTs traces to
//     `device_authorization_codes.user_id` which has FK
//     `device_authorization_codes_user_id_fkey -> auth.users(id)`.
//   - The legacy register/login paths in routes/auth.ts reference
//     `public.users` which doesn't exist in production — those paths
//     are dead. Live auth flow is device-auth.
//
// Token lifetime: 60s. Cache window: 50s (10s safety margin so a cached
// token always has at least 10s left when handed to PostgREST).
//
// Future improvement: when refresh-token flow lands, add a mode that
// pulls a real Supabase access token instead of minting one. The helper
// signature stays the same.

const SUPABASE_TOKEN_TTL_SECONDS = 60;
const SUPABASE_TOKEN_CACHE_TTL_MS = 50_000;
const supabaseJwtCache = new Map<string, { token: string; cachedAt: number }>();

// Periodic cleanup so a long-running process with millions of distinct
// userIds doesn't grow the cache unboundedly. Mirrors the pattern in
// middleware/auth.ts:46.
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of supabaseJwtCache) {
    if (now - entry.cachedAt > SUPABASE_TOKEN_CACHE_TTL_MS) {
      supabaseJwtCache.delete(userId);
    }
  }
}, 300_000).unref?.();

/**
 * Mint a short-lived Supabase-shaped JWT for the given user.
 *
 * Claims (must match what GoTrue/PostgREST expect):
 *   sub          — auth.users.id (drives `auth.uid()` in RLS)
 *   role         — 'authenticated' (drives `auth.role()` in RLS)
 *   aud          — 'authenticated' (Supabase audience claim)
 *   iat / exp    — short window so leaked tokens decay quickly
 *
 * Cached for ~50s per userId so high-throughput routes don't pay the
 * sign() cost on every query.
 *
 * Exported for tests and for routes that need the raw token (e.g. when
 * forwarding to a downstream Supabase RPC); most callers should use
 * `getUserScopedClient(userId)` instead.
 */
export function mintSupabaseJwt(userId: string): string {
  if (!userId) {
    throw new Error('mintSupabaseJwt: userId is required');
  }

  const cached = supabaseJwtCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < SUPABASE_TOKEN_CACHE_TTL_MS) {
    return cached.token;
  }

  const secret = requireEnv('SUPABASE_JWT_SECRET');
  const token = jwt.sign(
    {
      sub: userId,
      role: 'authenticated',
      aud: 'authenticated',
    },
    secret,
    { algorithm: 'HS256', expiresIn: SUPABASE_TOKEN_TTL_SECONDS },
  );
  supabaseJwtCache.set(userId, { token, cachedAt: Date.now() });
  return token;
}

/**
 * Returns an RLS-bound Supabase client scoped to the given user.
 *
 * Mints a per-user Supabase JWT via `mintSupabaseJwt(userId)` and
 * passes it through `getUserClient(jwt)`. Use this from any route
 * handler that needs RLS-enforced DB ops on behalf of an authenticated
 * caller — it replaces the previous pattern of importing the
 * service-role `supabase` singleton from `lib/supabase.ts`.
 *
 * @param userId - `req.user.userId` from the auth middleware. MUST be
 *                 the user's `auth.users.id` (true on the device-auth
 *                 path; verified 2026-05-08 via FK introspection).
 */
export function getUserScopedClient(userId: string): SupabaseClient {
  return getUserClient(mintSupabaseJwt(userId));
}

/**
 * Test seam — drop the in-process JWT cache. Production code never needs
 * this; tests use it to avoid stale cached tokens between cases.
 */
export function _resetSupabaseJwtCacheForTests(): void {
  supabaseJwtCache.clear();
}
