import { readUpstashCredentials } from '@agiworkforce/key-value';
import { NextRequest, NextResponse } from 'next/server';
import { BILLING_PLAN_PRODUCT_LIMITS, getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { logger } from './logger';
import { deployEnvironment } from './server/hosting';
import { getKeyValueRateLimiter, getKeyValueStore } from './server/key-value';
import { BLOCK_APPEAL_PATH, logRateLimitExceeded } from './security-audit';

const hasRedisEnv = readUpstashCredentials() !== null;
const deployEnv = deployEnvironment();
const isNextBuildPhase = process.env['NEXT_PHASE'] === 'phase-production-build';
const isProductionRuntime =
  !isNextBuildPhase &&
  deployEnv !== 'preview' &&
  (deployEnv === 'production' || process.env['NODE_ENV'] === 'production');

if (isProductionRuntime && !hasRedisEnv) {
  throw new Error(
    'SEV-WEB-13: Redis REST credentials are required in production, set ' +
      'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the Vercel KV ' +
      'integration names KV_REST_API_URL + KV_REST_API_TOKEN). In-memory rate ' +
      'limiting is ineffective across function instances. Set them on the ' +
      'agiworkforce project (Production + Preview) and redeploy.',
  );
}

export const REDIS_OUTAGE_POLICY_ENV = 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY';

export type RedisOutagePolicy = 'fail-closed' | 'fail-open';

export function resolveRedisOutagePolicy(): RedisOutagePolicy {
  const configured = process.env[REDIS_OUTAGE_POLICY_ENV]?.trim().toLowerCase();
  if (configured === 'fail-closed' || configured === 'fail-open') return configured;
  if (configured) {
    logger.error(
      { [REDIS_OUTAGE_POLICY_ENV]: configured },
      'Unrecognised Redis outage policy; enforcing fail-closed',
    );
    return 'fail-closed';
  }
  return hasRedisEnv || isProductionRuntime ? 'fail-closed' : 'fail-open';
}

const RATE_LIMIT_SCALE_ENV = 'AGI_RATE_LIMIT_SCALE';

const UNSCALED_RATE_LIMIT_MULTIPLIER = 1;

/**
 * Widens every ceiling for a non-production run.
 *
 * An end-to-end batch drives one account through dozens of specs back to back,
 * which measures the limiter rather than the product. Honoured only outside a
 * production runtime: the sole thing this env could do to a deployment is uncap
 * it, so a production process resolves to the configured ceilings and says so.
 */
function resolveRateLimitScale(): number {
  const configured = process.env[RATE_LIMIT_SCALE_ENV]?.trim();
  if (!configured) return UNSCALED_RATE_LIMIT_MULTIPLIER;

  if (isProductionRuntime) {
    logger.error(
      { [RATE_LIMIT_SCALE_ENV]: configured },
      'Rate-limit scale is a non-production affordance; enforcing the configured ceilings',
    );
    return UNSCALED_RATE_LIMIT_MULTIPLIER;
  }

  const scale = Number(configured);
  if (!Number.isInteger(scale) || scale < UNSCALED_RATE_LIMIT_MULTIPLIER) {
    logger.error(
      { [RATE_LIMIT_SCALE_ENV]: configured },
      'Unrecognised rate-limit scale; leaving the configured ceilings unscaled',
    );
    return UNSCALED_RATE_LIMIT_MULTIPLIER;
  }

  return scale;
}

const rateLimitScale = resolveRateLimitScale();

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
  'web-push': {
    limit: 10,
    window: '1 m', // 10 browser registrations per minute, one browser only ever needs a few
    failClosed: true, // Writes a row keyed on an attacker-suppliable endpoint
  },
  'mobile-feedback': {
    limit: 10,
    window: '1 h', // 10 feedback submissions per hour, generous for real use, blocks spam
    failClosed: false, // Don't block a user's feedback submission if Redis fails
  },
  'mobile-content-report': {
    limit: 20,
    window: '1 h', // 20 GenAI content reports per hour, generous for real triage use, blocks spam
    failClosed: false, // Don't block a trust-and-safety report if Redis fails
  },
  'mobile-iap-catalog': {
    limit: 30,
    window: '1 m',
    failClosed: false,
  },
  'mobile-iap-verify': {
    limit: 15,
    window: '1 m',
    failClosed: false,
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
  'user-data-delete': {
    limit: 3,
    window: '1 h', // 3 deletion requests per hour - irreversible operation
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'account-deletion-status': {
    limit: 30,
    window: '1 m', // read-only status check, polled on settings load
    failClosed: false,
  },
  'account-deletion-cancel': {
    limit: 10,
    window: '1 h', // account-lifecycle mutation, generous enough for retries
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'user-data-export': {
    limit: 5,
    window: '1 h', // 5 export requests per hour - data portability
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'chat-conversation': {
    limit: 60,
    window: '1 m', // 60 conversation operations per minute
    failClosed: false,
  },
  'chat-conversation-list': {
    // The sidebar reads this list on every page load, on every navigation, and
    // again whenever a conversation changes, while `chat-conversation` is a
    // shared bucket a dozen other reads also spend from. A read is cheap and
    // refusing it empties the sidebar, so it gets its own generous budget.
    limit: 600,
    window: '1 m',
    failClosed: false,
  },
  'code-provider-proxy': {
    limit: 120,
    window: '1 m', // one managed sandbox's coding-agent LLM calls, generous for an active turn
    failClosed: true, // Security-sensitive: this route injects a managed provider credential
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
  'agent-run-follow': {
    // Reading a run's journal costs one indexed read, not a provider call, and
    // it MUST NOT share the chat-send bucket: run-following polls once a second
    // against a 30/min send limit, so one dropped stream refused the reconnect
    // AND the user's next message. Sized above the client's poll rate with room
    // for a second surface following the same run.
    limit: 120,
    window: '1 m',
    failClosed: false, // Refusing a reconnect strands a run that is still going
  },
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
  'admin-operator': {
    limit: 30,
    window: '1 m', // Operator dashboard polls a few views; the write path is rare
    failClosed: true, // Reads the whole customer base and can reset usage
  },
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
  'map-tile': {
    limit: 600,
    window: '1 m',
    failClosed: false,
  },
  'model-catalog': {
    limit: 120,
    window: '1 m', // 120 catalog fetches per minute per IP (cached on client anyway)
    failClosed: false, // Public endpoint: allow through if Redis fails
  },
  'github-webhook': {
    limit: 200,
    window: '1 m', // 200 webhook events per minute per IP (generous for real GitHub traffic)
    failClosed: false, // Allow webhooks through if Redis fails - business critical
  },
  'stripe-webhook': {
    limit: 100,
    window: '1 m', // 100 webhook events per minute per IP (generous for real Stripe traffic)
    failClosed: false, // Allow webhooks through if Redis fails - business critical
  },
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
  'plugin-installation-write': {
    limit: 20,
    window: '1 m',
    failClosed: true,
  },
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
  'settings-team-invitations-list': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-team-invitations-write': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'settings-team-invitations-accept': {
    limit: 10,
    window: '1 m',
    failClosed: true,
  },
  'settings-org-transfer-ownership': {
    limit: 5,
    window: '1 m',
    failClosed: true,
  },
  'settings-org-delete': {
    limit: 5,
    window: '1 h', // irreversible once the grace window passes
    failClosed: true,
  },
  'settings-org-delete-cancel': {
    limit: 10,
    window: '1 h',
    failClosed: true,
  },
  'settings-org-seats': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  'settings-activity': {
    limit: 60,
    window: '1 m',
    failClosed: false,
  },
  // Unauthenticated public form: fail closed, so a limiter outage cannot turn
  // the intake table into an open write endpoint.
  'beta-apply': {
    limit: 5,
    window: '10 m',
    failClosed: true,
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
  waitlist: {
    limit: 5,
    window: '1 h', // 5 signups per hour per IP to prevent enumeration and spam
    failClosed: true, // Block if Redis unavailable: this endpoint stores PII
  },
  scim: {
    limit: 600,
    window: '1 m',
    failClosed: true, // Credential-verifying endpoint: block if Redis is down.
  },
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

const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

const IN_MEMORY_MAX_ENTRIES = 10000;
const IN_MEMORY_CLEANUP_INTERVAL_MS = 60000;
let lastCleanupTime = Date.now();

if (process.env.NODE_ENV === 'production' && !getKeyValueRateLimiter()) {
  logger.error(
    {},
    'SECURITY WARNING: Redis not configured in production environment. ' +
      'In-memory rate limiting is NOT effective in serverless/distributed deployments. ' +
      'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.',
  );
}

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 60000;
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

function cleanupInMemoryStore(): void {
  const now = Date.now();

  const entries = Array.from(inMemoryStore.entries());
  for (const [k, v] of entries) {
    if (v.resetTime < now) {
      inMemoryStore.delete(k);
    }
  }

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

function inMemoryRateLimit(
  id: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = inMemoryStore.get(id);

  if (now - lastCleanupTime > IN_MEMORY_CLEANUP_INTERVAL_MS) {
    cleanupInMemoryStore();
  }

  if (!entry || entry.resetTime < now) {
    const resetTime = now + windowMs;
    inMemoryStore.set(id, { count: 1, resetTime });
    return { success: true, remaining: limit - 1, reset: resetTime };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.resetTime };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, reset: entry.resetTime };
}

export type RateLimitKey = keyof typeof rateLimitConfigs;

const TIER_SCALED_KEYS: ReadonlySet<RateLimitKey> = new Set<RateLimitKey>([
  'llm-completion',
  'chat-message',
  'chat-conversation',
  'chat-conversation-list',
  'prompt-completion',
  'image-generation',
  'video-generation',
  'audio-transcription',
]);

const MAX_TIER_CONCURRENCY = Math.max(
  1,
  ...Object.values(BILLING_PLAN_PRODUCT_LIMITS).map((limits) =>
    typeof limits.maxConcurrentTurns === 'number' ? limits.maxConcurrentTurns : 0,
  ),
);

function tierConcurrency(planTier: string | null | undefined): number {
  if (!planTier) return 1;
  const advertised = getPlanMaxConcurrentTurns(planTier);
  if (advertised === null) return MAX_TIER_CONCURRENCY;
  return advertised > 0 ? advertised : 1;
}

export function resolveTierRateLimit(key: RateLimitKey, planTier?: string | null): number {
  const base = rateLimitConfigs[key].limit;
  if (!TIER_SCALED_KEYS.has(key)) return base * rateLimitScale;
  const concurrency = tierConcurrency(planTier);
  return Math.max(base * concurrency, concurrency) * rateLimitScale;
}

const RATE_LIMIT_KEY_PREFIX = 'agi-rl';

/**
 * The budget the caller's fail-open or fail-closed decision is raced against.
 * A limiter that has not answered by then is treated as unavailable rather than
 * held open while the request stalls.
 */
const SHARED_LIMITER_TIMEOUT_MS = 800;

function rateLimitNamespace(key: RateLimitKey): string {
  return `${RATE_LIMIT_KEY_PREFIX}:${key}`;
}

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

function forwardedForChain(request: NextRequest): string[] {
  const xff = request.headers.get('x-forwarded-for');
  if (!xff) return [];
  return xff
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function getClientIpForRateLimit(request: NextRequest): string {
  const chain = forwardedForChain(request);

  switch (clientIpSource.mode) {
    case 'xff-rightmost':
      return chain.at(-1) ?? 'unknown';
    case 'xff-hop': {
      return chain.at(-clientIpSource.hops) ?? chain.at(0) ?? 'unknown';
    }
    case 'x-real-ip':
    default:
      return request.headers.get('x-real-ip') ?? chain.at(-1) ?? 'unknown';
  }
}

async function resolveVerifiedUserBucket(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token || token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

    try {
      const { verifyIdentitySessionToken } = await import('./server/identity');
      const claims = await verifyIdentitySessionToken(token);
      return claims ? `user:${claims.subject}` : null;
    } catch {
      return null;
    }
  }

  try {
    const { getRequestIdentity } = await import('./server/identity');
    const { subject } = await getRequestIdentity();
    return subject ? `user:${subject}` : null;
  } catch {
    return null;
  }
}

async function resolveRateLimitIdentifier(
  request: NextRequest,
  identifier?: string,
): Promise<string> {
  if (identifier) return identifier;
  const verified = await resolveVerifiedUserBucket(request);
  if (verified) return verified;
  return `ip:${getClientIpForRateLimit(request)}`;
}

export interface RateLimitInfo {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  headers: Record<string, string>;
  identifier: string;
}

export async function checkRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
  planTier?: string | null,
): Promise<RateLimitInfo> {
  const config = rateLimitConfigs[key];
  const effectiveLimit = resolveTierRateLimit(key, planTier);
  const id = await resolveRateLimitIdentifier(request, identifier);
  const rateLimiter = getKeyValueRateLimiter();

  if (!rateLimiter) {
    const policy = resolveRedisOutagePolicy();

    if (process.env.NODE_ENV === 'production') {
      logger.error(
        { key, failClosed: config.failClosed, policy },
        'SECURITY: Redis not configured in production - in-memory rate limiting is ineffective in distributed/serverless deployments',
      );
    }

    if (config.failClosed && policy === 'fail-closed') {
      logger.warn(
        { key, identifier, policy },
        'Blocking request to a fail-closed endpoint - the shared rate limiter is unavailable',
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

    const windowMs = parseWindow(config.window);
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

  try {
    let limitTimer: ReturnType<typeof setTimeout> | undefined;
    const { success, limit, remaining, resetAtMs } = await Promise.race([
      rateLimiter
        .limit(rateLimitNamespace(key), id, { limit: effectiveLimit, window: config.window })
        .finally(() => {
          if (limitTimer) clearTimeout(limitTimer);
        }),
      new Promise<never>((_, reject) => {
        limitTimer = setTimeout(
          () => reject(new Error('rate-limit shared limiter timeout')),
          SHARED_LIMITER_TIMEOUT_MS,
        );
      }),
    ]);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(resetAtMs).toISOString(),
    };

    if (!success) {
      headers['Retry-After'] = Math.ceil((resetAtMs - Date.now()) / 1000).toString();
    }

    return {
      success,
      limit,
      remaining,
      reset: resetAtMs,
      headers,
      identifier: id,
    };
  } catch (error) {
    logger.error({ error, key, identifier }, 'Rate limiting check error');

    const policy = resolveRedisOutagePolicy();

    if (config.failClosed && policy === 'fail-closed') {
      logger.warn(
        { key, identifier, policy },
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

    logger.warn(
      { key, identifier, policy },
      'Rate limit check failed, allowing request (fail-open)',
    );
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

    const userId = info.identifier.startsWith('user:')
      ? info.identifier.slice('user:'.length)
      : undefined;

    const reason = `rate_limit:${key}`;
    await logRateLimitExceeded(request, info.identifier, userId, reason);

    const retryAfterSeconds = Math.max(0, Math.ceil((info.reset - Date.now()) / 1000));
    const resetAtIso = new Date(info.reset).toISOString();

    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait before trying again.',
          reason,
          appeal_path: BLOCK_APPEAL_PATH,
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

  return null;
}

/**
 * The age-out for a slot whose owner never released it.
 *
 * This is a backstop, not a budget: the slot is normally released by the stream
 * pipe's `finally`. What runs no `finally` is the platform killing the function
 * at its `maxDuration`, an OOM, or an instance eviction, and at the previous
 * fifteen minutes, a free user (`maxConcurrentTurns: 1`) whose tab closed
 * mid-stream was refused a brand-new conversation for fifteen minutes, with
 * retrying making it worse and only waiting making it better.
 *
 * Sized just above the chat route's own `maxDuration` of 300s, which is the
 * longest a slot's holder can legally live: nothing can still be running at
 * 360s, so ageing out then cannot release a slot that is genuinely in use.
 */
const MANAGED_TURN_SLOT_TTL_SECONDS = 360;

const MANAGED_TURN_SLOT_OLDEST_SCORE = 0;
const MILLISECONDS_PER_SECOND = 1_000;

export interface ManagedTurnSlot {
  release(): Promise<void>;
}

export type ManagedTurnDenial = 'plan-excluded' | 'ceiling-reached' | 'limiter-unavailable';

export interface ManagedTurnSlotResult {
  admitted: boolean;
  limit: number | null;
  active: number;
  slot: ManagedTurnSlot | null;
  denial?: ManagedTurnDenial;
}

const NOOP_SLOT: ManagedTurnSlot = { release: async () => {} };

function managedTurnSlotKey(userId: string): string {
  return `agi-turns:${userId}`;
}

function unavailableTurnSlot(
  userId: string,
  limit: number,
  reason: 'redis-not-configured' | 'redis-error',
): ManagedTurnSlotResult {
  const policy = resolveRedisOutagePolicy();

  if (policy === 'fail-open') {
    logger.warn(
      { userId, limit, reason, policy },
      'GOV-3: concurrent-turn ceiling unenforceable; admitting under the configured fail-open policy',
    );
    return { admitted: true, limit, active: 0, slot: NOOP_SLOT };
  }

  logger.error(
    { userId, limit, reason, policy },
    'GOV-3: concurrent-turn ceiling unenforceable; refusing the turn (fail-closed)',
  );
  return { admitted: false, limit, active: 0, slot: null, denial: 'limiter-unavailable' };
}

export async function acquireManagedTurnSlot(input: {
  userId: string;
  planTier: string | null | undefined;
  turnId: string;
}): Promise<ManagedTurnSlotResult> {
  const limit = getPlanMaxConcurrentTurns(input.planTier);

  if (limit === null) {
    return { admitted: true, limit: null, active: 0, slot: NOOP_SLOT };
  }
  if (limit <= 0) {
    return { admitted: false, limit, active: 0, slot: null, denial: 'plan-excluded' };
  }
  const store = getKeyValueStore();
  if (!store) {
    return unavailableTurnSlot(input.userId, limit, 'redis-not-configured');
  }

  const key = managedTurnSlotKey(input.userId);
  const now = Date.now();

  try {
    await store.sortedRemoveByScore(
      key,
      MANAGED_TURN_SLOT_OLDEST_SCORE,
      now - MANAGED_TURN_SLOT_TTL_SECONDS * MILLISECONDS_PER_SECOND,
    );
    const active = await store.sortedSize(key);
    if (active >= limit) {
      return { admitted: false, limit, active, slot: null, denial: 'ceiling-reached' };
    }

    await store.sortedAdd(key, { score: now, member: input.turnId });
    await store.expire(key, MANAGED_TURN_SLOT_TTL_SECONDS);

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
            await store.sortedRemove(key, input.turnId);
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
      'GOV-3: concurrent-turn slot check failed',
    );
    return unavailableTurnSlot(input.userId, limit, 'redis-error');
  }
}

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
