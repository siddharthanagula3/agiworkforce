/**
 * Auth Orchestrator
 *
 * Centralizes all auth state handling to prevent race conditions.
 *
 * This is the only CloudAccountAuth listener. `stores/auth.ts` owns the Zustand
 * state and actions but no longer installs a competing auth listener.
 *
 * PROBLEM SOLVED:
 * Previously, App.tsx called initializeAuthStore(), initializeAccountStore(),
 * and initializeBillingStore() - each subscribing separately to cloudAccountAuth.onAuthStateChange().
 * When auth state changed, all 3 listeners fired simultaneously, causing:
 * - Race conditions in async operations (credit fetching, token syncing)
 * - Multiple parallel API calls
 * - Inconsistent state updates
 *
 * SOLUTION:
 * This orchestrator is the SINGLE listener for auth state changes.
 * It updates all stores in a coordinated, sequential manner.
 */

import { cloudAccountAuth, type AuthState } from '../services/cloudAccountAuth';
import {
  useUnifiedAuthStore,
  type CreditBalance,
  type SubscriptionStatus,
  type SubscriptionFetchStatus,
} from './auth';
import { useBillingUsageStore } from './billingUsage';
import { asPlanTier, PLAN_DISPLAY_NAMES, type PlanTier } from '../lib/cloudAccountTypes';
import { accountApi } from '../api/accountApi';
import { isTauri, invoke } from '../lib/tauri-mock';
import { effectivePlanTier } from '@agiworkforce/types';

// Singleton guard - ensures only one orchestrator instance exists
let orchestratorInitialized = false;
let unsubscribeFn: (() => void) | null = null;

// Credit fetch deduplication (moved from accountStore)
const CREDITS_CACHE_TTL_MS = 30_000;
const CREDITS_401_COOLDOWN_MS = 60_000;
let creditsCache: {
  accessToken: string;
  credits: CreditBalance | null;
  fetchedAt: number;
} | null = null;
let credits401Cache: {
  accessToken: string;
  at: number;
} | null = null;

// Subscription cache for resilience
const SUBSCRIPTION_CACHE_KEY_BASE = 'agiworkforce_subscription_cache';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// User-scoped cache key: hash of userId is appended so switching accounts
// never reads another user's cached subscription tier.
let cachedUserHash: string | null = null;

async function hashUserId(userId: string): Promise<string> {
  const encoded = new TextEncoder().encode(userId);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getSubscriptionCacheKey(): string {
  return cachedUserHash
    ? `${SUBSCRIPTION_CACHE_KEY_BASE}_${cachedUserHash}`
    : SUBSCRIPTION_CACHE_KEY_BASE;
}

interface SubscriptionCache {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  fetchedAt: number;
  // MED-010: userId intentionally excluded from localStorage cache to avoid PII leakage.
  // Cache freshness is validated by fetchedAt timestamp alone. User scoping uses a hash.
}

function getCachedSubscription(_userId: string): SubscriptionCache | null {
  try {
    const cached = localStorage.getItem(getSubscriptionCacheKey());
    if (!cached) return null;
    const data = JSON.parse(cached) as SubscriptionCache;
    // MED-010: validate freshness by timestamp only — no userId stored in cache
    if (Date.now() - data.fetchedAt < SUBSCRIPTION_CACHE_MAX_AGE_MS) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedSubscription(
  _userId: string,
  planTier: PlanTier,
  subscriptionStatus: SubscriptionStatus,
): void {
  try {
    // MED-010: userId intentionally omitted from serialized cache to prevent PII in localStorage
    const cache: SubscriptionCache = {
      planTier,
      subscriptionStatus,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(getSubscriptionCacheKey(), JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors
  }
}

function clearCachedSubscription(): void {
  try {
    localStorage.removeItem(getSubscriptionCacheKey());
  } catch {
    // Ignore localStorage errors
  }
}

async function fetchCreditsWithCache(accessToken: string): Promise<CreditBalance | null> {
  const now = Date.now();

  if (
    creditsCache &&
    creditsCache.accessToken === accessToken &&
    now - creditsCache.fetchedAt < CREDITS_CACHE_TTL_MS
  ) {
    return creditsCache.credits;
  }

  if (
    credits401Cache &&
    credits401Cache.accessToken === accessToken &&
    now - credits401Cache.at < CREDITS_401_COOLDOWN_MS
  ) {
    return null;
  }

  try {
    const profile = await accountApi.fetchUserProfile(accessToken);
    const credits = profile.credits || null;
    creditsCache = { accessToken, credits, fetchedAt: now };
    credits401Cache = null;
    return credits;
  } catch (error) {
    const errorMessage = String(error);
    const isUnauthorized =
      errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized');

    if (isUnauthorized) {
      credits401Cache = { accessToken, at: now };
      return null;
    }

    console.warn('[AuthOrchestrator] Failed to fetch credits:', error);
    return null;
  }
}

// Processing lock to prevent concurrent auth updates
let isProcessingAuthChange = false;
let pendingAuthState: AuthState | null = null;

function authSnapshotIsCurrent(authState: AuthState): boolean {
  const current = useUnifiedAuthStore.getState();
  return (
    current.user?.id === authState.user?.id &&
    current.accessToken === (authState.session?.access_token ?? null)
  );
}

/**
 * Project the security boundary synchronously, before any hashing, network I/O,
 * or the serialized refresh queue. `setUser` atomically clears account-scoped
 * capabilities when the id changes; `setAccount` then installs only the new
 * credential. Same-account token rotation intentionally preserves the stable
 * plan, feature flags, and credit snapshot.
 */
function projectAuthBoundary(authState: AuthState): void {
  const unifiedAuthStore = useUnifiedAuthStore.getState();
  const previousUserId = unifiedAuthStore.user?.id ?? null;

  if (!authState.user) {
    unifiedAuthStore.clearAuth();
    if (authState.error) {
      unifiedAuthStore.setError(authState.error);
    }
    clearCachedSubscription();
    cachedUserHash = null;
    creditsCache = null;
    credits401Cache = null;
    // A signed-out state supersedes every queued account snapshot. Leaving a
    // queued B state here could re-authenticate the store after sign-out when
    // an older A request eventually settles.
    pendingAuthState = null;
    return;
  }

  unifiedAuthStore.setUser({
    id: authState.user.id,
    email: authState.user.email || '',
    name:
      authState.profile?.display_name || (authState.user.user_metadata?.['full_name'] as string),
    avatar:
      authState.profile?.avatar_url || (authState.user.user_metadata?.['avatar_url'] as string),
  });
  unifiedAuthStore.setAccount({
    id: authState.user.id,
    email: authState.user.email || null,
    accessToken: authState.session?.access_token || null,
    refreshToken: authState.session?.refresh_token || null,
    // Clear the synthesized Local device marker in the same synchronous
    // projection that installs the authenticated Cloud credential.
    isLocalDeviceAccount: false,
  });

  if (previousUserId !== authState.user.id) {
    cachedUserHash = null;
    creditsCache = null;
    credits401Cache = null;
  }
}

/**
 * Process an auth state change, updating all stores in sequence.
 * This is the core function that coordinates all store updates.
 */
async function processAuthStateChange(authState: AuthState): Promise<void> {
  // Skip if still loading - wait for complete state
  if (authState.isLoading) {
    return;
  }

  // This must run before the processing lock. Otherwise account B remains
  // capable as account A for the entire duration of A's hung credits request.
  projectAuthBoundary(authState);

  if (!authState.user) {
    return;
  }

  // BUG-007 fix: guard check and early returns BEFORE the try/finally so that
  // early-returning code paths never set isProcessingAuthChange = true and then
  // skip the finally block that resets it back to false.
  if (isProcessingAuthChange) {
    pendingAuthState = authState;
    return;
  }

  // The boundary above still projects a fetching account synchronously. The
  // complete plan/flags/credits snapshot lands only after account auth emits a
  // succeeded or failed terminal state.
  if (authState.subscriptionFetchStatus === 'fetching') {
    return;
  }

  isProcessingAuthChange = true;

  try {
    // Get the unified auth store
    const unifiedAuthStore = useUnifiedAuthStore.getState();

    // Scope the subscription cache to this user so account switches never
    // read another user's cached tier. The assignment itself is guarded: an
    // older account must not reclaim the global cache key after B projected.
    const userHash = await hashUserId(authState.user.id);
    if (!authSnapshotIsCurrent(authState)) {
      return;
    }
    cachedUserHash = userHash;

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Determine plan tier with cache fallback
    // ═══════════════════════════════════════════════════════════════
    let planTier: PlanTier;
    let subscriptionStatus: SubscriptionStatus = 'none';
    const userId = authState.user.id;

    if (authState.subscription?.plan_tier) {
      // Fresh data from backend
      subscriptionStatus = (authState.subscription.status as SubscriptionStatus) || 'none';
      planTier = asPlanTier(
        effectivePlanTier(authState.subscription.plan_tier, subscriptionStatus),
      );
      setCachedSubscription(userId, planTier, subscriptionStatus);
    } else if (authState.subscriptionFetchStatus === 'failed') {
      // Fetch failed — degrade in a recoverable order, never to null.
      //
      // A null plan is not a neutral "unknown": `desktopCloudEntitlements`
      // returns [] for it, so App.tsx empties the Cloud model store and the
      // picker has nothing selectable, while `planDisplayName` stays on the
      // 'Loading...' sentinel forever. One transient /api/me failure therefore
      // made Cloud mode permanently unusable with no path back.
      //
      // Order: 24 h user-scoped cache -> the tier this session already
      // confirmed with a SUCCEEDED fetch -> 'free'. Nothing here can raise a
      // tier the server never confirmed, and entitlement is enforced
      // server-side on every request regardless; the shell also shows the
      // "Cloud account details could not be refreshed" banner with a Retry.
      const cached = getCachedSubscription(userId);
      const previous = useUnifiedAuthStore.getState();
      if (cached) {
        subscriptionStatus = cached.subscriptionStatus;
        planTier = asPlanTier(effectivePlanTier(cached.planTier, subscriptionStatus));
      } else if (
        previous.plan &&
        previous.plan !== 'local-only' &&
        previous.subscriptionFetchStatus === 'succeeded'
      ) {
        subscriptionStatus = previous.subscriptionStatus;
        planTier = asPlanTier(effectivePlanTier(previous.plan, subscriptionStatus));
      } else {
        subscriptionStatus = 'none';
        planTier = 'free';
      }
    } else {
      // Fetch succeeded but no subscription = genuinely free tier
      planTier = 'free';
      clearCachedSubscription();
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Fetch credits (single call, not duplicated across stores)
    // ═══════════════════════════════════════════════════════════════
    let credits: CreditBalance | null = null;
    if (authState.session?.access_token) {
      try {
        credits = await fetchCreditsWithCache(authState.session.access_token);
      } catch (error) {
        console.warn('[AuthOrchestrator] Credit fetch failed:', error);
      }
    }

    // Any account or credential update that arrived during the await above has
    // already projected synchronously. Drop this stale result before it can
    // write plan, feature, billing, credit, or native-vault state.
    if (!authSnapshotIsCurrent(authState)) {
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Update Unified Auth Store (combines auth, account, billing)
    // ═══════════════════════════════════════════════════════════════
    const fetchStatus: SubscriptionFetchStatus =
      authState.subscriptionFetchStatus === 'succeeded' ? 'succeeded' : 'failed';

    // Set Stripe customer info.
    //
    // FIX (audit 2026-05-20, §14): the legacy code unconditionally wrote a
    // CustomerInfo record with `stripe_customer_id: '' ` when the user had
    // no subscription. Downstream code that branches on
    // `stripeCustomer.stripe_customer_id` saw an empty string (truthy as a
    // key but invalid as a Stripe ID) and silently called the Billing API
    // with an empty customer reference, masking the "no subscription yet"
    // case as a "Stripe says no such customer" error.
    //
    // Now: only push a CustomerInfo when we actually have a stripe_customer_id;
    // otherwise push null and let the unified store surface a non-error
    // "no subscription yet" state.
    const stripeCustomerIdValue = authState.subscription?.stripe_customer_id ?? null;
    if (stripeCustomerIdValue) {
      unifiedAuthStore.setStripeCustomer({
        id: authState.user.id,
        stripe_customer_id: stripeCustomerIdValue,
        email: authState.user.email || '',
        name: authState.profile?.display_name || undefined,
        created_at: Math.floor(new Date(authState.user.created_at).getTime() / 1000),
        updated_at: Date.now() / 1000,
      });
    } else {
      unifiedAuthStore.setStripeCustomer(null);
    }

    // Set Stripe subscription if available.
    //
    // FIX (audit 2026-05-20, §14): the empty-string fallbacks below are
    // intentional — they only fire inside the `if (authState.subscription)`
    // guard, which already proves the user has *some* subscription record.
    // An absent stripe_subscription_id at this level means "subscription
    // row exists but Stripe provisioning has not completed yet"; the empty
    // string is the canonical UI sentinel for that state and is consumed
    // by the billing UI as "provisioning". Do not change to null without
    // updating every consumer.
    if (authState.subscription) {
      const sub = authState.subscription;
      unifiedAuthStore.setStripeSubscription({
        id: sub.stripe_subscription_id || `sub_${authState.user.id}`,
        customer_id: authState.user.id,
        stripe_subscription_id: sub.stripe_subscription_id || '',
        stripe_price_id: sub.stripe_price_id || '',
        // Preserve the purchased tier on the billing record so canceled or
        // unpaid subscriptions can still be described accurately in billing
        // UI. `unifiedAuthStore.plan` remains the status-gated effective tier
        // used for every capability check.
        plan_name: asPlanTier(sub.plan_tier),
        billing_interval: 'monthly',
        status: sub.status || 'none',
        current_period_start: sub.current_period_start
          ? Math.floor(new Date(sub.current_period_start).getTime() / 1000)
          : 0,
        current_period_end: sub.current_period_end
          ? Math.floor(new Date(sub.current_period_end).getTime() / 1000)
          : 0,
        cancel_at_period_end: sub.cancel_at_period_end || false,
        cancel_at: undefined,
        canceled_at: sub.canceled_at
          ? Math.floor(new Date(sub.canceled_at).getTime() / 1000)
          : undefined,
        amount: 0,
        currency: 'usd',
        created_at: Math.floor(new Date(sub.created_at || new Date()).getTime() / 1000),
        updated_at: Math.floor(new Date(sub.updated_at || new Date()).getTime() / 1000),
      });
    } else {
      unifiedAuthStore.setStripeSubscription(null);
    }

    // Update credits
    if (credits) {
      unifiedAuthStore.updateCredits({
        remaining_cents: credits.remaining_cents ?? 0,
        daily_used: credits.daily_used_cents,
        daily_limit: credits.daily_limit_cents,
        daily_reset_at: credits.daily_reset_at,
      });
    }

    // Update account/subscription info via setAccount
    unifiedAuthStore.setAccount({
      id: authState.user.id,
      email: authState.user.email || null,
      displayName:
        authState.profile?.display_name ||
        (authState.user.user_metadata?.['full_name'] as string) ||
        null,
      avatar:
        authState.profile?.avatar_url ||
        (authState.user.user_metadata?.['avatar_url'] as string) ||
        null,
      isLocalDeviceAccount: false,
      plan: planTier,
      planDisplayName: PLAN_DISPLAY_NAMES[planTier],
      subscriptionStatus: (authState.subscription?.status as SubscriptionStatus) || 'none',
      subscriptionFetchStatus: fetchStatus,
      currentPeriodEnd: authState.subscription?.current_period_end
        ? new Date(authState.subscription.current_period_end).getTime()
        : null,
      stripeCustomerId: authState.subscription?.stripe_customer_id || null,
      featureFlags: authState.featureFlags,
      credits,
      accessToken: authState.session?.access_token || null,
      refreshToken: authState.session?.refresh_token || null,
      lastSyncedAt: Date.now(),
    });

    // CloudAccountAuth is the single owner of native credential persistence
    // and writes the session before account/credits refresh begins. Duplicating
    // token writes here allowed an older A invoke to complete after B/sign-out
    // and overwrite the newer vault state. This late step only registers the
    // credential-reading provider; it never writes credentials.
    if (isTauri && authState.session) {
      try {
        if (!authSnapshotIsCurrent(authState)) return;
        await invoke('llm_ensure_managed_cloud');
      } catch (error) {
        console.warn('[AuthOrchestrator] Failed to initialize Managed Cloud:', error);
      }
    }
  } finally {
    isProcessingAuthChange = false;

    // Process any queued auth state
    if (pendingAuthState) {
      const nextState = pendingAuthState;
      pendingAuthState = null;
      await processAuthStateChange(nextState);
    }
  }
}

/**
 * Initialize the auth orchestrator.
 * This should be called ONCE at app startup, replacing the individual
 * initializeAuthStore(), initializeAccountStore(), and initializeBillingStore() calls.
 *
 * @returns Cleanup function to unsubscribe
 */
export function initializeAuthOrchestrator(): () => void {
  if (orchestratorInitialized) {
    console.warn('[AuthOrchestrator] Already initialized - returning existing unsubscribe');
    return unsubscribeFn || (() => {});
  }

  orchestratorInitialized = true;

  // Subscribe to auth state changes
  unsubscribeFn = cloudAccountAuth.onAuthStateChange((authState) => {
    void processAuthStateChange(authState);
  });

  // Also set up usage store (it subscribes to unified auth store)
  const unsubscribeUsage = useUnifiedAuthStore.subscribe((authState) => {
    // UsageStore logic - subscribes to auth store for subscription/customer changes
    const billingUsageStore = useBillingUsageStore.getState();
    const subscription = authState.stripeSubscription;
    const customer = authState.stripeCustomer;

    if (subscription && subscription.current_period_start && subscription.current_period_end) {
      if (
        subscription.current_period_start !== billingUsageStore.usagePeriodStartSec ||
        subscription.current_period_end !== billingUsageStore.usagePeriodEndSec
      ) {
        billingUsageStore.setUsagePeriod(
          subscription.current_period_start,
          subscription.current_period_end,
        );

        if (customer) {
          void billingUsageStore.fetchUsage(
            customer.id,
            subscription.current_period_start,
            subscription.current_period_end,
          );
        }
      }
    }
  });

  return () => {
    orchestratorInitialized = false;
    if (unsubscribeFn) {
      unsubscribeFn();
      unsubscribeFn = null;
    }
    unsubscribeUsage();
    creditsCache = null;
    credits401Cache = null;
    isProcessingAuthChange = false;
    pendingAuthState = null;
    cachedUserHash = null;
  };
}

/**
 * Reset orchestrator state (for testing or complete cleanup)
 */
export function resetAuthOrchestrator(): void {
  orchestratorInitialized = false;
  if (unsubscribeFn) {
    unsubscribeFn();
    unsubscribeFn = null;
  }
  creditsCache = null;
  credits401Cache = null;
  isProcessingAuthChange = false;
  pendingAuthState = null;
  clearCachedSubscription();
  cachedUserHash = null;
}
