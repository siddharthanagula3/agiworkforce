import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { BILLING_PLAN_PRODUCT_LIMITS, getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { logger } from './logger';
import { logRateLimitExceeded } from './security-audit';

// SEV-WEB-13 / WEB-36 (audit 2026-05-19): Redis is REQUIRED in production
// Vercel deployments. In-memory rate-limiting is per-function-instance, so
// an attacker fanning out across N warm instances multiplies their effective
// limit by N. Fail fast at module init when the deploy is missing Redis env
// vars in a production-ish environment. Local dev and Vercel preview are
// still allowed to run without Redis (failClosed configs already absorb that
// safely for security-sensitive routes).
//
// FIX (Codex P1, 2026-05-20): scope by *phase*, not by *Vercel*. The previous
// patch over-narrowed the guard to `VERCEL_ENV === 'production'`, which
// removed the runtime protection from self-hosted/horizontally-scaled prod
// deployments (AWS / GCP / Fly / bare Node) · exactly the topology this
// guard was created for. Instead, distinguish build-time from runtime via
// Next.js's canonical `NEXT_PHASE`: `phase-production-build` is the build,
// anything else (`phase-production-server`, undefined) is runtime. CI and
// local builds set the build phase too, so they skip the throw without
// needing Vercel-specific knowledge; production cold-starts on ANY runtime
// (Vercel or self-hosted) hit the throw if Redis isn't wired up.
// Accept either name pair, PREFERRING Vercel's KV-integration names. The Vercel
// Marketplace "Upstash for Redis" integration injects KV_REST_API_URL /
// KV_REST_API_TOKEN and keeps them in sync with the live database, whereas the
// native UPSTASH_* names here were added manually and went stale (pointing at a
// deleted DB) — the recurring SEV-WEB-13 root cause. Preferring the managed KV_*
// means a stale manual UPSTASH_* can't shadow the live database, and `||` (not
// `??`) still lets an empty KV_* fall through to a real UPSTASH_* value.
const redisRestUrl = process.env['KV_REST_API_URL'] || process.env['UPSTASH_REDIS_REST_URL'];
const redisRestToken = process.env['KV_REST_API_TOKEN'] || process.env['UPSTASH_REDIS_REST_TOKEN'];
const hasRedisEnv = !!redisRestUrl && !!redisRestToken;
const vercelEnv = process.env['VERCEL_ENV']; // 'production' | 'preview' | 'development' | undefined
const isNextBuildPhase = process.env['NEXT_PHASE'] === 'phase-production-build';
const isProductionRuntime =
  !isNextBuildPhase &&
  vercelEnv !== 'preview' &&
  (vercelEnv === 'production' || process.env['NODE_ENV'] === 'production');

if (isProductionRuntime && !hasRedisEnv) {
  // Loud, fail-fast error at runtime cold-start so the function errors out
  // visibly rather than silently allowing N× rate limits in serverless.
  throw new Error(
    'SEV-WEB-13: Redis REST credentials are required in production — set ' +
      'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the Vercel KV ' +
      'integration names KV_REST_API_URL + KV_REST_API_TOKEN). In-memory rate ' +
      'limiting is ineffective across function instances. Set them on the ' +
      'agiworkforce project (Production + Preview) and redeploy.',
  );
}

// Initialize Redis client (falls back to in-memory if not configured · only
// safe in local dev / Vercel preview after the production guard above).
const redis = hasRedisEnv ? new Redis({ url: redisRestUrl!, token: redisRestToken! }) : null;

// AUDIT-008-016: Rate limit configurations per endpoint
// failClosed: true = block requests when Redis unavailable (security-sensitive endpoints)
// failClosed: false = allow requests when Redis unavailable (business-critical endpoints)
// In production serverless environments, in-memory rate limiting is ineffective as each
// function instance has its own memory space. For security-sensitive endpoints, we fail
// closed (block requests) when Redis is unavailable to prevent abuse.
export const rateLimitConfigs = {
  checkout: {
    limit: 15,
    window: '1 m', // 15 requests per minute (allows retries and page refreshes)
    failClosed: false, // Allow checkout even if Redis fails - business critical
  },
  'device-link': {
    limit: 10,
    window: '1 m', // 10 device codes per minute (prevents abuse)
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'device-poll': {
    limit: 10,
    window: '1 s', // 10 requests per second
    failClosed: false,
  },
  'mobile-push-token': {
    limit: 30,
    window: '1 m', // 30 push-token updates per minute (mirrors api-gateway limiter)
    failClosed: false,
  },
  'mobile-feedback': {
    limit: 10,
    window: '1 h', // 10 feedback submissions per hour — generous for real use, blocks spam
    failClosed: false, // Don't block a user's feedback submission if Redis fails
  },
  'mobile-content-report': {
    limit: 20,
    window: '1 h', // 20 GenAI content reports per hour — generous for real triage use, blocks spam
    failClosed: false, // Don't block a trust-and-safety report if Redis fails
  },
  'mobile-iap-verify': {
    limit: 10,
    window: '1 m', // 10 verify attempts per minute — allows retries, blocks receipt-replay abuse
    failClosed: true, // Security-sensitive (billing writes): block if Redis fails
  },
  'claim-offer': {
    limit: 3,
    window: '1 h', // 3 requests per hour
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  me: {
    limit: 60,
    window: '1 m', // 60 requests per minute
    failClosed: false,
  },
  'credits-balance': {
    limit: 60,
    window: '1 m', // 60 requests per minute (same as /me endpoint)
    failClosed: false,
  },
  'usage-deduct': {
    limit: 120,
    window: '1 m', // 120 deductions per minute per user (high-frequency post-LLM calls)
    failClosed: false, // Allow deduction even if Redis fails - billing not blocked by rate limiter
  },
  portal: {
    limit: 10,
    window: '1 m', // 10 portal requests per minute
    failClosed: false,
  },
  upgrade: {
    limit: 5,
    window: '1 m', // 5 mid-cycle upgrade requests per minute
    failClosed: false,
  },
  'health-check': {
    limit: 30,
    window: '1 m', // 30 requests per minute to prevent enumeration
    failClosed: false,
  },
  download: {
    limit: 30,
    window: '1 m', // 30 download requests per minute per IP
    failClosed: false,
  },
  'download-beta': {
    limit: 10,
    window: '1 m', // 10 beta download requests per minute per IP
    failClosed: false,
  },
  // Release check endpoints - generous limits for auto-update checks
  'release-check': {
    limit: 60,
    window: '1 m', // 60 update checks per minute per IP
    failClosed: false,
  },
  'release-latest': {
    limit: 60,
    window: '1 m', // 60 manifest fetches per minute per IP
    failClosed: false,
  },
  // 2FA / TOTP endpoints - strict limits to prevent brute force on 6-digit codes
  '2fa-verify': {
    limit: 5,
    window: '15 m', // 5 verify/validate attempts per 15 minutes per user
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  '2fa-setup': {
    limit: 10,
    window: '1 h', // 10 setup attempts per hour (re-enroll scenarios)
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  // Authentication endpoints - stricter limits to prevent brute force
  'auth-login': {
    limit: 5,
    window: '15 m', // 5 login attempts per 15 minutes per IP
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'auth-signup': {
    limit: 3,
    window: '1 h', // 3 signup attempts per hour per IP (prevent mass account creation)
    failClosed: true,
  },
  'auth-password-reset': {
    limit: 3,
    window: '1 h', // 3 password reset attempts per hour
    failClosed: true,
  },
  'auth-verify': {
    limit: 10,
    window: '1 m', // 10 verification attempts per minute
    failClosed: true,
  },
  // API key operations - critical security endpoints
  'api-key-create': {
    limit: 5,
    window: '1 h', // 5 API key creations per hour
    failClosed: true,
  },
  'api-key-revoke': {
    limit: 10,
    window: '1 m', // 10 revocations per minute (allow cleanup)
    failClosed: true,
  },
  // GDPR endpoints - sensitive data operations
  'user-data-delete': {
    limit: 3,
    window: '1 h', // 3 deletion requests per hour - irreversible operation
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'user-data-export': {
    limit: 5,
    window: '1 h', // 5 export requests per hour - data portability
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  // Chat API endpoints
  'chat-conversation': {
    limit: 60,
    window: '1 m', // 60 conversation operations per minute
    failClosed: false,
  },
  'chat-message': {
    limit: 20,
    window: '1 m', // 20 messages per minute (to prevent API abuse)
    failClosed: false,
  },
  'uploads-presign': {
    limit: 30,
    window: '1 m', // 30 presigned-upload requests per minute per user
    failClosed: false,
  },
  'files-serve': {
    limit: 120,
    window: '1 m', // generated-file byte serving; a transcript can render many inline files
    failClosed: false,
  },
  // LLM completion endpoints - critical for cost control and abuse prevention
  'llm-completion-ip': {
    limit: 1500,
    window: '1 m', // Broad pre-auth abuse ceiling; shared networks must not share the user quota
    failClosed: true,
  },
  'llm-completion': {
    limit: 30,
    window: '1 m', // 30 LLM requests per minute per user
    failClosed: true, // Security-sensitive: LLM API calls are expensive
  },
  // GOV-22: an 'llm-streaming' config (20/min, failClosed) used to sit here and
  // was referenced by no route — streaming has always been governed solely by
  // 'llm-completion' above (applied in app/api/llm/v1/chat/completions/lib/
  // auth-gate.ts). A config that reads as implemented and is not is worse than
  // absent, so it is removed rather than left as false assurance. If streaming
  // must be governed separately, add the key back AND apply it in auth-gate.ts
  // in the same change.
  // Media generation endpoints - expensive operations
  'image-generation': {
    limit: 10,
    window: '1 m', // 10 image generation requests per minute (expensive operation)
    failClosed: true, // Security-sensitive: AI image generation is costly
  },
  'video-generation': {
    limit: 5,
    window: '1 m', // 5 video generation requests per minute (very expensive)
    failClosed: true, // Security-sensitive: AI video generation is very costly
  },
  'video-status': {
    limit: 30,
    window: '1 m', // 30 status poll requests per minute (allow frequent polling)
    failClosed: false, // Not sensitive: just querying status
  },
  'prompt-completion': {
    limit: 60,
    window: '1 m', // 60 ghost-text completions per minute (debounced on client side)
    failClosed: false, // Non-critical: missing completions is acceptable
  },
  'audio-transcription': {
    limit: 20,
    window: '1 m', // 20 transcription requests per minute (audio processing is resource-intensive)
    failClosed: true, // Security-sensitive: transcription involves external API billing
  },
  'admin-security': {
    limit: 10,
    window: '1 m', // 10 admin security actions per minute
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  // Session sharing endpoints
  'share-create': {
    limit: 5,
    window: '1 m', // 5 share creations per minute (prevents share spam)
    failClosed: false,
  },
  'share-view': {
    limit: 60,
    window: '1 m', // 60 share views per minute (public read endpoint)
    failClosed: false,
  },
  // Model catalog endpoint - public, cached, generous limits
  'model-catalog': {
    limit: 120,
    window: '1 m', // 120 catalog fetches per minute per IP (cached on client anyway)
    failClosed: false, // Public endpoint: allow through if Redis fails
  },
  // GitHub webhook endpoint
  'github-webhook': {
    limit: 200,
    window: '1 m', // 200 webhook events per minute per IP (generous for real GitHub traffic)
    failClosed: false, // Allow webhooks through if Redis fails - business critical
  },
  // Stripe webhook endpoint - generous limit since real Stripe events are legitimate
  'stripe-webhook': {
    limit: 100,
    window: '1 m', // 100 webhook events per minute per IP (generous for real Stripe traffic)
    failClosed: false, // Allow webhooks through if Redis fails - business critical
  },
  // Settings: organization
  'settings-org': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-org-patch': {
    limit: 20,
    window: '1 m',
    failClosed: false,
  },
  // Settings: team management
  'settings-team-list': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-team-invite': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'settings-team-delete': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'settings-team-patch': {
    limit: 20,
    window: '1 m',
    failClosed: false,
  },
  // Settings: organization invitations (member lifecycle)
  'settings-team-invitations-list': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  // Mints a one-time token and consumes a licensed seat · fail closed.
  'settings-team-invitations-write': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  // Token-redemption endpoint. Tight and fail-closed: an attacker who guesses a
  // 32-byte token gets org access, so brute-force headroom must stay small.
  'settings-team-invitations-accept': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  // Ownership transfer changes who owns the billing account · fail closed.
  'settings-org-transfer-ownership': {
    limit: 5,
    window: '1 m',
    failClosed: true,
  },
  'settings-org-seats': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  // Settings: activity and audit logs
  'settings-activity': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-sessions-list': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-session-revoke': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'settings-audit-logs': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-audit-actions': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  // Settings: API key management
  'api-keys-list': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'api-keys-create': {
    limit: 5,
    window: '1 h',
    failClosed: true,
  },
  'api-keys-delete': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  // Usage and billing analytics
  'usage-providers': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'usage-analytics': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'usage-history': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'billing-invoices': {
    limit: 30,
    window: '1 m',
    failClosed: false,
  },
  'billing-payment-methods': {
    limit: 30,
    window: '1 m',
    failClosed: false,
  },
  'billing-analytics': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  // Waitlist signup endpoints · unauthenticated PII intake, tight limit
  waitlist: {
    limit: 5,
    window: '1 h', // 5 signups per hour per IP to prevent enumeration and spam
    failClosed: true, // Block if Redis unavailable: this endpoint stores PII
  },
  // SCIM 2.0 service provider · machine traffic from an enterprise IdP.
  // Okta and Entra push a full directory reconciliation as a burst of single
  // resource calls, so the ceiling is high, but it is still a ceiling: an
  // unauthenticated caller can reach these routes and each request costs one
  // Argon2id verification.
  scim: {
    limit: 600,
    window: '1 m',
    failClosed: true, // Credential-verifying endpoint: block if Redis is down.
  },
  // Minting a SCIM bearer token is a credential-issuing action.
  'scim-token-mint': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'scim-token-manage': {
    limit: 30,
    window: '1 m',
    failClosed: true,
  },
  // Support escalation ("talk to a human") · lib/support/handoff/**.
  // Reachable signed out from the marketing widget, so these are IP-bucketed
  // for anonymous callers.
  'support-handoff-availability': {
    limit: 60,
    window: '1 m', // Read-only presence check; the service also caches 5s in-process.
    failClosed: false, // Failing this closed would hide the honest "no one is available" copy.
  },
  'support-handoff-create': {
    limit: 5,
    window: '1 h', // Each escalation sends an email and stores a transcript.
    failClosed: true, // Unauthenticated PII intake + outbound mail: block if Redis is down.
  },
  'support-handoff-status': {
    limit: 120,
    window: '1 m', // Polled every ~3s while waiting; 20/min expected, headroom for retries.
    failClosed: false, // Blocking the poll would strand a user in a waiting state.
  },
  'support-handoff-message': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'support-handoff-agent': {
    limit: 240,
    window: '1 m', // Admin console: heartbeat + queue poll + claim from a small roster.
    failClosed: false,
  },
  // Support agent — bounded account actions · lib/support/actions/**.
  // All three fail closed: they read account state and mint/spend confirmation
  // tokens that mutate the caller's own account, so losing Redis must block
  // them rather than open them. Every one requires an authenticated session.
  'support-account-context': {
    limit: 30,
    window: '1 m',
    failClosed: true,
  },
  'support-action-propose': {
    limit: 20,
    window: '1 h',
    failClosed: true,
  },
  'support-action-confirm': {
    limit: 10,
    window: '1 h',
    failClosed: true,
  },
  // Support answer engine · lib/support/agent/**. A question that clears the
  // relevance floor costs a managed-provider call, and the marketing widget
  // serves signed-out visitors, so there is no per-user usage reservation to
  // meter anonymous traffic. Both fail closed: without Redis the honest
  // outcome is an abstention plus a human handoff, not unmetered spend.
  'support-agent-anon': {
    limit: 10,
    window: '1 h', // IP-bucketed. Signed-out marketing widget.
    failClosed: true,
  },
  'support-agent-user': {
    limit: 40,
    window: '1 h', // Authenticated in-app widget.
    failClosed: true,
  },
  default: {
    limit: 100,
    window: '1 m', // 100 requests per minute
    failClosed: false,
  },
} as const;

// In-memory rate limit store for fallback (not suitable for distributed systems)
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

// Configuration for in-memory store limits
const IN_MEMORY_MAX_ENTRIES = 10000; // Prevent unbounded memory growth under attack
const IN_MEMORY_CLEANUP_INTERVAL_MS = 60000; // Clean up every minute
let lastCleanupTime = Date.now();

// Log warning at startup if Redis is not configured in production
if (process.env.NODE_ENV === 'production' && !redis) {
  logger.error(
    {},
    'SECURITY WARNING: Redis not configured in production environment. ' +
      'In-memory rate limiting is NOT effective in serverless/distributed deployments. ' +
      'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.',
  );
}

/**
 * Parse window string to milliseconds
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 60000; // Default 1 minute
  const value = parseInt(match[1]!, 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60000;
  }
}

/**
 * Clean up expired entries from the in-memory store.
 * Also enforces max entries limit to prevent memory exhaustion.
 */
function cleanupInMemoryStore(): void {
  const now = Date.now();

  // Remove expired entries (use Array.from for ES5 compatibility)
  const entries = Array.from(inMemoryStore.entries());
  for (const [k, v] of entries) {
    if (v.resetTime < now) {
      inMemoryStore.delete(k);
    }
  }

  // If still over limit after cleanup, remove oldest entries
  if (inMemoryStore.size > IN_MEMORY_MAX_ENTRIES) {
    const sortedEntries = Array.from(inMemoryStore.entries()).sort(
      (a, b) => a[1].resetTime - b[1].resetTime,
    );

    const toRemove = sortedEntries.length - IN_MEMORY_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      inMemoryStore.delete(sortedEntries[i]![0]);
    }

    logger.warn(
      { removed: toRemove, remaining: inMemoryStore.size },
      'In-memory rate limit store exceeded max entries, removed oldest entries',
    );
  }

  lastCleanupTime = now;
}

/**
 * In-memory rate limiter for development/fallback
 * Note: This is per-process and won't work correctly in distributed deployments
 */
function inMemoryRateLimit(
  id: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = inMemoryStore.get(id);

  // Perform periodic cleanup (deterministic, time-based instead of random)
  if (now - lastCleanupTime > IN_MEMORY_CLEANUP_INTERVAL_MS) {
    cleanupInMemoryStore();
  }

  if (!entry || entry.resetTime < now) {
    // First request or window expired
    const resetTime = now + windowMs;
    inMemoryStore.set(id, { count: 1, resetTime });
    return { success: true, remaining: limit - 1, reset: resetTime };
  }

  if (entry.count >= limit) {
    // Rate limit exceeded
    return { success: false, remaining: 0, reset: entry.resetTime };
  }

  // Increment count
  entry.count++;
  return { success: true, remaining: limit - entry.count, reset: entry.resetTime };
}

export type RateLimitKey = keyof typeof rateLimitConfigs;

/**
 * Per-user ceilings that must scale with the plan the caller bought.
 *
 * Every `limit` above is flat, so a Max 15x subscriber sold 12 concurrent
 * managed turns shared the Free user's 20 chat messages/min and 30 LLM
 * requests/min — the limiter capped the product below what the plan page
 * advertises. Only per-user, post-authentication keys belong here:
 * `llm-completion-ip` and the auth/security limits are IP-bucketed and
 * evaluated before any tier is known, and they must not widen with spend.
 *
 * Callers pass the tier they already resolved; nothing is inferred here,
 * because a rate limiter must not spend a database round-trip to decide
 * whether to allow a request.
 */
const TIER_SCALED_KEYS: ReadonlySet<RateLimitKey> = new Set<RateLimitKey>([
  'llm-completion',
  'chat-message',
  'chat-conversation',
  'prompt-completion',
  'image-generation',
  'video-generation',
  'audio-transcription',
]);

/**
 * Highest concurrency any tier advertises. Tiers that declare themselves
 * uncapped ('unlimited'/'custom') still need a request ceiling, so they borrow
 * this one instead of going unbounded.
 *
 * The `1` is not decoration. Without it, a catalog in which no tier states a
 * NUMERIC concurrency reduces this to 0, and Enterprise — whose 'custom' value
 * lands on exactly this branch — would resolve to a ceiling of zero requests
 * and be locked out of the product entirely. That is the same
 * contract-collapses-to-zero failure the limit conversion is written to avoid;
 * an uncapped tier must never be MORE restricted than a capped one.
 */
const MAX_TIER_CONCURRENCY = Math.max(
  1,
  ...Object.values(BILLING_PLAN_PRODUCT_LIMITS).map((limits) =>
    typeof limits.maxConcurrentTurns === 'number' ? limits.maxConcurrentTurns : 0,
  ),
);

/** The catalog's advertised concurrency for `planTier`, as a usable multiplier. */
function tierConcurrency(planTier: string | null | undefined): number {
  if (!planTier) return 1;
  const advertised = getPlanMaxConcurrentTurns(planTier);
  if (advertised === null) return MAX_TIER_CONCURRENCY;
  // 0 means the catalog did not recognise the tier; stay on the base ceiling.
  return advertised > 0 ? advertised : 1;
}

/**
 * Ceiling for `key` under `planTier`. The billing catalog is the single source
 * of truth for how much more a paid tier may do, so the multiplier IS the
 * tier's advertised concurrency; the floor guarantees a tier can always drive
 * the turns it was sold even if a base limit is later lowered below it.
 */
export function resolveTierRateLimit(key: RateLimitKey, planTier?: string | null): number {
  const base = rateLimitConfigs[key].limit;
  if (!TIER_SCALED_KEYS.has(key)) return base;
  const concurrency = tierConcurrency(planTier);
  return Math.max(base * concurrency, concurrency);
}

/**
 * Module-level cache for rate limiter instances.
 * This prevents creating new Ratelimit instances on every request,
 * which significantly improves performance by reusing Redis connections.
 *
 * PERFORMANCE OPTIMIZATION: Ratelimit instances are expensive to create
 * because they set up Redis connection handlers. Caching them reduces
 * overhead from ~5-10ms per request to near-zero for subsequent requests.
 */
const rateLimiterCache = new Map<string, Ratelimit>();

/**
 * Get or create a rate limiter instance (only called when Redis is available)
 * Uses module-level caching to reuse instances across requests.
 *
 * Cached by key AND ceiling: one endpoint now has one instance per tier
 * ceiling. The Redis `prefix` deliberately stays keyed on the endpoint alone,
 * so a user keeps ONE bucket per endpoint regardless of tier — changing tiers
 * must change the ceiling, never hand out a fresh counter.
 */
function getRateLimiter(key: RateLimitKey, limit: number): Ratelimit {
  // Return cached instance if available
  const cacheKey = `${key}:${limit}`;
  const cached = rateLimiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const config = rateLimitConfigs[key];

  if (!redis) {
    // This shouldn't be called when Redis is unavailable
    // but provide a safe fallback just in case
    throw new Error('Redis not configured for rate limiting');
  }

  // Create new instance and cache it.
  //
  // BUGFIX (QA-2026-06): namespace each endpoint's bucket via `prefix`. Upstash
  // defaults every Ratelimit instance to the same prefix ('@upstash/ratelimit'),
  // so two configs sharing an identifier (e.g. the same IP hitting both `me` and
  // `chat-message`) collide on ONE Redis key. The endpoint with the smallest
  // limit then 429s during normal multi-endpoint usage even though its own
  // traffic is well under budget. Keying by config name gives each endpoint the
  // independent bucket its distinct limit/window already implies.
  const rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, config.window),
    analytics: true,
    prefix: `agi-rl:${key}`,
  });

  rateLimiterCache.set(cacheKey, rateLimiter);

  logger.info(
    { key, limit, cacheSize: rateLimiterCache.size },
    'Created and cached new rate limiter instance',
  );

  return rateLimiter;
}

/**
 * GOV-17: the trusted-proxy assumption, made EXPLICIT and CONFIGURABLE.
 *
 * The original code preferred `x-real-ip` and otherwise took the RIGHTMOST
 * `x-forwarded-for` entry. That is sound only behind a proxy that OVERWRITES
 * both headers. This module's own comments scope the deployment to
 * "AWS / GCP / Fly / bare Node" as well as Vercel, and on a topology where the
 * ingress merely APPENDS, a client can send its own `x-real-ip` and mint a
 * fresh bucket per request — an unlimited rate-limit bypass.
 *
 * `AGI_RATE_LIMIT_CLIENT_IP_SOURCE` selects the extraction strategy:
 *
 *   'x-real-ip'      (DEFAULT) — current behaviour, byte-for-byte. Prefer
 *                    `x-real-ip`, else the rightmost `x-forwarded-for` entry.
 *                    Correct on Vercel, which overwrites both.
 *   'xff-rightmost'  — ignore `x-real-ip` entirely; use the rightmost
 *                    `x-forwarded-for` entry. For ingresses that append to XFF
 *                    but leave a client-supplied `x-real-ip` intact.
 *   'xff-hop:<n>'    — take the n-th entry counted from the RIGHT (1 = the
 *                    rightmost). Set n to the number of trusted proxies in
 *                    front of the app so the value read is the one the
 *                    outermost trusted hop wrote, not anything the client
 *                    prepended.
 *
 * The default is unchanged, so Vercel deployments are unaffected; self-hosted
 * operators now have a documented knob instead of an unstated assumption.
 */
const CLIENT_IP_SOURCE_ENV = 'AGI_RATE_LIMIT_CLIENT_IP_SOURCE';

type ClientIpSource =
  | { mode: 'x-real-ip' }
  | { mode: 'xff-rightmost' }
  | { mode: 'xff-hop'; hops: number };

function parseClientIpSource(raw: string | undefined): ClientIpSource {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'x-real-ip') return { mode: 'x-real-ip' };
  if (value === 'xff-rightmost') return { mode: 'xff-rightmost' };
  const hopMatch = /^xff-hop:(\d{1,2})$/.exec(value);
  if (hopMatch) {
    const hops = Number.parseInt(hopMatch[1]!, 10);
    if (hops >= 1) return { mode: 'xff-hop', hops };
  }
  logger.error(
    { [CLIENT_IP_SOURCE_ENV]: raw },
    'GOV-17: unrecognised client-IP source; falling back to the x-real-ip default',
  );
  return { mode: 'x-real-ip' };
}

const clientIpSource = parseClientIpSource(process.env[CLIENT_IP_SOURCE_ENV]);

/** Trimmed, non-empty `x-forwarded-for` entries in wire order (left to right). */
function forwardedForChain(request: NextRequest): string[] {
  const xff = request.headers.get('x-forwarded-for');
  if (!xff) return [];
  return xff
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** GOV-17: resolve the client IP under the configured trusted-proxy model. */
export function getClientIpForRateLimit(request: NextRequest): string {
  const chain = forwardedForChain(request);

  switch (clientIpSource.mode) {
    case 'xff-rightmost':
      return chain.at(-1) ?? 'unknown';
    case 'xff-hop': {
      // hops = 1 -> chain.at(-1); hops = 2 -> chain.at(-2); ...
      return chain.at(-clientIpSource.hops) ?? chain.at(0) ?? 'unknown';
    }
    case 'x-real-ip':
    default:
      return request.headers.get('x-real-ip') ?? chain.at(-1) ?? 'unknown';
  }
}

/**
 * GOV-16: resolve a SIGNATURE-VERIFIED user bucket for an authenticated
 * request, or null.
 *
 * SEV-WEB-09 / WEB-32 (audit 2026-05-19) removed an *unverified* base64 JWT
 * decode from the bucket key: an attacker could forge `sub` = victim and
 * poison the victim's bucket. The correct fix was never "always fall back to
 * IP" — roughly 60 authenticated routes then omitted the identifier while
 * their configs documented "per user", so one office/NAT/CGNAT egress IP
 * shared a single bucket and a single abusive client 429'd everyone behind it.
 *
 * This resolves the principal the way the auth layer does — by VERIFYING the
 * token signature — so the bucket is per-user without reintroducing the
 * forgery. Routes that already know their verified user should still pass
 * `identifier` explicitly: it is both cheaper and unambiguous.
 *
 * Never throws. AGI API keys (`sk_live_`/`sk_test_`) and first-party developer
 * device tokens are opaque here and fall through to the IP bucket, exactly as
 * before.
 */
async function resolveVerifiedUserBucket(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    // Opaque (non-JWT) credentials: nothing to verify locally.
    if (!token || token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (!secretKey) return null;
    try {
      const { verifyToken } = await import('@clerk/backend');
      const claims = await verifyToken(token, { secretKey });
      return typeof claims.sub === 'string' && claims.sub.length > 0 ? `user:${claims.sub}` : null;
    } catch {
      // Forged, expired, or simply not a Clerk token — stays IP-keyed.
      return null;
    }
  }

  // Cookie session (first-party browser traffic). `auth()` is backed by
  // clerkMiddleware in proxy.ts and verifies the session itself.
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    return userId ? `user:${userId}` : null;
  } catch {
    return null;
  }
}

/**
 * Get the identifier for rate limiting.
 *
 * Priority:
 * 1. Explicit identifier (a verified user id passed by the handler)
 * 2. GOV-16: a signature-verified Clerk principal on the request
 * 3. GOV-17: the client IP under the configured trusted-proxy model
 */
async function resolveRateLimitIdentifier(
  request: NextRequest,
  identifier?: string,
): Promise<string> {
  if (identifier) return identifier;
  const verified = await resolveVerifiedUserBucket(request);
  if (verified) return verified;
  return `ip:${getClientIpForRateLimit(request)}`;
}

/**
 * Rate limit info returned by check
 */
export interface RateLimitInfo {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  headers: Record<string, string>;
  /**
   * GOV-16 / GOV-23: the bucket this decision was actually made against
   * (`user:<verified id>` or `ip:<addr>`). Callers must not re-derive it —
   * the audit sink in particular used to parse the Bearer payload itself.
   */
  identifier: string;
}

/**
 * Check rate limit without requiring handler wrapper
 * Useful for adding rate-limit headers to successful responses
 */
export async function checkRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
  planTier?: string | null,
): Promise<RateLimitInfo> {
  const config = rateLimitConfigs[key];
  const effectiveLimit = resolveTierRateLimit(key, planTier);
  const id = await resolveRateLimitIdentifier(request, identifier);

  // Use in-memory rate limiting if Redis is not configured
  if (!redis) {
    const isProduction = process.env.NODE_ENV === 'production';

    // AUDIT-008-016: Fail-closed behavior for security-sensitive endpoints when Redis unavailable
    if (isProduction) {
      logger.error(
        { key, failClosed: config.failClosed },
        'SECURITY: Redis not configured in production - in-memory rate limiting is ineffective in distributed/serverless deployments',
      );

      // For security-sensitive endpoints (failClosed: true), block all requests when
      // Redis isn't available in production. In-memory rate limiting doesn't work across
      // serverless instances/edge functions because each instance has isolated memory.
      // This is a critical security measure to prevent brute force attacks.
      if (config.failClosed) {
        logger.warn(
          { key, identifier },
          'AUDIT-008-016: Blocking request to security-sensitive endpoint - Redis not configured in production',
        );
        return {
          success: false,
          limit: effectiveLimit,
          remaining: 0,
          reset: Date.now() + 60000,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Error': 'rate-limiter-unavailable',
          },
          identifier: id,
        };
      }
    }

    const windowMs = parseWindow(config.window);
    // BUGFIX (QA-2026-06): namespace the in-memory bucket by endpoint key. The
    // store was keyed by identifier alone, so every rate-limited endpoint
    // sharing an identifier (e.g. `ip:unknown` on localhost, or one IP behind a
    // proxy) incremented a SINGLE counter. The lowest-limit endpoint
    // (chat-message: 20/min) then spuriously 429'd once unrelated traffic
    // (me/connectors/projects/conversations) exhausted the shared counter —
    // dropping the assistant-message persist POST and losing the reply on
    // reload. Mirror the Redis-path `prefix` so both stores bucket identically.
    const result = inMemoryRateLimit(`${key}:${id}`, effectiveLimit, windowMs);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': effectiveLimit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.reset).toISOString(),
    };

    if (!result.success) {
      headers['Retry-After'] = Math.ceil((result.reset - Date.now()) / 1000).toString();
    }

    return {
      success: result.success,
      limit: effectiveLimit,
      remaining: result.remaining,
      reset: result.reset,
      headers,
      identifier: id,
    };
  }

  const rateLimiter = getRateLimiter(key, effectiveLimit);

  try {
    // Cap the Upstash REST round-trip: this call gates EVERY request, so a slow
    // or degraded Upstash must not stall the whole site (the chat-home load fans
    // ~7 of these out concurrently). On timeout we throw into the catch below,
    // which fails OPEN for normal routes and CLOSED for security-sensitive ones —
    // the same graceful degradation as a genuine Upstash error.
    const UPSTASH_TIMEOUT_MS = 800;
    let limitTimer: ReturnType<typeof setTimeout> | undefined;
    const { success, limit, remaining, reset } = await Promise.race([
      rateLimiter.limit(id).finally(() => {
        if (limitTimer) clearTimeout(limitTimer);
      }),
      new Promise<never>((_, reject) => {
        limitTimer = setTimeout(
          () => reject(new Error('rate-limit upstash timeout')),
          UPSTASH_TIMEOUT_MS,
        );
      }),
    ]);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(reset).toISOString(),
    };

    if (!success) {
      headers['Retry-After'] = Math.ceil((reset - Date.now()) / 1000).toString();
    }

    return {
      success,
      limit,
      remaining,
      reset,
      headers,
      identifier: id,
    };
  } catch (error) {
    logger.error({ error, key, identifier }, 'Rate limiting check error');

    // For security-sensitive endpoints, fail closed (block request)
    if (config.failClosed) {
      logger.warn(
        { key, identifier },
        'Rate limit check failed for security-sensitive endpoint, blocking request',
      );
      return {
        success: false,
        limit: effectiveLimit,
        remaining: 0,
        reset: Date.now() + 60000,
        headers: {
          'Retry-After': '60',
        },
        identifier: id,
      };
    }

    // For non-sensitive endpoints, fail open with warning
    logger.warn({ key, identifier }, 'Rate limit check failed, allowing request (fail-open)');
    return {
      success: true,
      limit: effectiveLimit,
      remaining: effectiveLimit,
      reset: Date.now() + 60000,
      headers: {},
      identifier: id,
    };
  }
}

/**
 * Rate limiting middleware
 */
export async function withRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
  planTier?: string | null,
): Promise<NextResponse | null> {
  const info = await checkRateLimit(request, key, identifier, planTier);

  if (!info.success) {
    logger.warn(
      {
        key,
        limit: info.limit,
        remaining: info.remaining,
        reset: info.reset,
      },
      'Rate limit exceeded',
    );

    // GOV-23: the audit userId used to come from a base64 decode of the Bearer
    // payload with NO signature verification — four lines after this same file
    // removed unverified-JWT parsing from the bucket key. An attacker could
    // craft an unsigned token with any `sub` and poison another user's abuse
    // record. `info.identifier` is the bucket the decision was actually made
    // against, and its `user:` form is only ever produced by a VERIFIED
    // principal (see resolveVerifiedUserBucket), so it is safe to attribute.
    const userId = info.identifier.startsWith('user:')
      ? info.identifier.slice('user:'.length)
      : undefined;

    await logRateLimitExceeded(request, info.identifier, userId);

    // GOV-21: return a STRUCTURED, localizable reset instead of a raw machine
    // timestamp embedded in an English sentence. The client formats
    // `retry_after_seconds` in the user's locale; `reset_at` stays for logs and
    // for any consumer that wants the absolute instant.
    const retryAfterSeconds = Math.max(0, Math.ceil((info.reset - Date.now()) / 1000));
    const resetAtIso = new Date(info.reset).toISOString();

    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait before trying again.',
          retry_after_seconds: retryAfterSeconds,
          reset_at: resetAtIso,
        },
        rateLimit: {
          limit: info.limit,
          remaining: 0,
          reset: resetAtIso,
          reset_at: resetAtIso,
          retry_after_seconds: retryAfterSeconds,
        },
      },
      {
        status: 429,
        headers: info.headers,
      },
    );
  }

  // Return null to continue (rate limit headers added via checkRateLimit)
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * GOV-3: per-plan concurrent managed-turn slots.
 *
 * `BILLING_PLAN_PRODUCT_LIMITS` gained a `maxConcurrentTurns` dimension because
 * nothing in the server bounded concurrent chats or parallel streams: grepping
 * `activeRuns|concurrentRuns|MAX_ACTIVE|maxParallel|max_concurrent` returned a
 * single hit (`maxParallelToolCalls`, inside ONE turn). A rate limit is a
 * request-per-minute bound, not a concurrency bound — 30 simultaneous 10-minute
 * streams pass `llm-completion` cleanly.
 *
 * Implemented as a TTL-bounded Redis sorted set per user: entries older than
 * the lease age out, so a crashed request cannot leak a slot forever.
 * ──────────────────────────────────────────────────────────────────────────── */

/** How long an unreleased slot survives before it ages out of the set. */
const MANAGED_TURN_SLOT_TTL_SECONDS = 15 * 60;

export interface ManagedTurnSlot {
  /** Idempotent; safe to call from a `finally`. */
  release(): Promise<void>;
}

export interface ManagedTurnSlotResult {
  /** False only when the caller's plan ceiling is already fully occupied. */
  admitted: boolean;
  /** The plan ceiling, or null when the tier declares itself uncapped. */
  limit: number | null;
  /** Live turns observed for this user at admission time. */
  active: number;
  /** Present only when `admitted` is true. */
  slot: ManagedTurnSlot | null;
}

const NOOP_SLOT: ManagedTurnSlot = { release: async () => {} };

function managedTurnSlotKey(userId: string): string {
  return `agi-turns:${userId}`;
}

/**
 * Reserve one concurrent-turn slot for `userId` under `planTier`.
 *
 * Fail behaviour: a Redis outage admits the turn and logs loudly. That is a
 * deliberate, backstopped fail-open — the durable rolling 5-hour / weekly /
 * flagship spend caps (0070 migration) still bound what those turns can cost,
 * so a transient Upstash blip degrades a concurrency nicety instead of taking
 * the product down. In production the module already refuses to boot without
 * Redis, so this path is a dev/preview concern.
 */
export async function acquireManagedTurnSlot(input: {
  userId: string;
  planTier: string | null | undefined;
  /** Stable id for this turn; reused as the sorted-set member. */
  turnId: string;
}): Promise<ManagedTurnSlotResult> {
  const limit = getPlanMaxConcurrentTurns(input.planTier);

  if (limit === null) {
    return { admitted: true, limit: null, active: 0, slot: NOOP_SLOT };
  }
  if (limit <= 0) {
    return { admitted: false, limit, active: 0, slot: null };
  }
  if (!redis) {
    logger.warn(
      { userId: input.userId, limit },
      'GOV-3: concurrent-turn slots unavailable without Redis; admitting (spend caps still apply)',
    );
    return { admitted: true, limit, active: 0, slot: NOOP_SLOT };
  }

  // Capture the narrowed client so the release closure keeps the non-null type.
  const client = redis;
  const key = managedTurnSlotKey(input.userId);
  const now = Date.now();

  try {
    // Age out slots whose owning request never released them.
    await client.zremrangebyscore(key, 0, now - MANAGED_TURN_SLOT_TTL_SECONDS * 1000);
    const active = await client.zcard(key);
    if (active >= limit) {
      return { admitted: false, limit, active, slot: null };
    }

    await client.zadd(key, { score: now, member: input.turnId });
    await client.expire(key, MANAGED_TURN_SLOT_TTL_SECONDS);

    let released = false;
    return {
      admitted: true,
      limit,
      active: active + 1,
      slot: {
        release: async () => {
          if (released) return;
          released = true;
          try {
            await client.zrem(key, input.turnId);
          } catch (error) {
            logger.warn(
              { error, userId: input.userId },
              'GOV-3: concurrent-turn slot release failed; it will age out',
            );
          }
        },
      },
    };
  } catch (error) {
    logger.error(
      { error, userId: input.userId, limit },
      'GOV-3: concurrent-turn slot check failed; admitting (spend caps still apply)',
    );
    return { admitted: true, limit, active: 0, slot: NOOP_SLOT };
  }
}

/**
 * Wrapper for API route handlers with rate limiting
 */
export function withRateLimitHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  key: RateLimitKey,
  getIdentifier?: (request: NextRequest) => string | undefined,
  getPlanTier?: (request: NextRequest) => string | null | undefined,
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const identifier = getIdentifier?.(request);

    const rateLimitResponse = await withRateLimit(request, key, identifier, getPlanTier?.(request));
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(...args);
  };
}
