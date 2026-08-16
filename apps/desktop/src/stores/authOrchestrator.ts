
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

let orchestratorInitialized = false;
let unsubscribeFn: (() => void) | null = null;

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

const SUBSCRIPTION_CACHE_KEY_BASE = 'agiworkforce_subscription_cache';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

let isProcessingAuthChange = false;
let pendingAuthState: AuthState | null = null;

function authSnapshotIsCurrent(authState: AuthState): boolean {
  const current = useUnifiedAuthStore.getState();
  return (
    current.user?.id === authState.user?.id &&
    current.accessToken === (authState.session?.access_token ?? null)
  );
}

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
    isLocalDeviceAccount: false,
  });

  if (previousUserId !== authState.user.id) {
    cachedUserHash = null;
    creditsCache = null;
    credits401Cache = null;
  }
}

async function processAuthStateChange(authState: AuthState): Promise<void> {
  if (authState.isLoading) {
    return;
  }

  projectAuthBoundary(authState);

  if (!authState.user) {
    return;
  }

  if (isProcessingAuthChange) {
    pendingAuthState = authState;
    return;
  }

  if (authState.subscriptionFetchStatus === 'fetching') {
    return;
  }

  isProcessingAuthChange = true;

  try {
    const unifiedAuthStore = useUnifiedAuthStore.getState();

    const userHash = await hashUserId(authState.user.id);
    if (!authSnapshotIsCurrent(authState)) {
      return;
    }
    cachedUserHash = userHash;

    let planTier: PlanTier;
    let subscriptionStatus: SubscriptionStatus = 'none';
    const userId = authState.user.id;

    if (authState.subscription?.plan_tier) {
      subscriptionStatus = (authState.subscription.status as SubscriptionStatus) || 'none';
      planTier = asPlanTier(
        effectivePlanTier(authState.subscription.plan_tier, subscriptionStatus),
      );
      setCachedSubscription(userId, planTier, subscriptionStatus);
    } else if (authState.subscriptionFetchStatus === 'failed') {
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
      planTier = 'free';
      clearCachedSubscription();
    }

    let credits: CreditBalance | null = null;
    if (authState.session?.access_token) {
      try {
        credits = await fetchCreditsWithCache(authState.session.access_token);
      } catch (error) {
        console.warn('[AuthOrchestrator] Credit fetch failed:', error);
      }
    }

    if (!authSnapshotIsCurrent(authState)) {
      return;
    }

    const fetchStatus: SubscriptionFetchStatus =
      authState.subscriptionFetchStatus === 'succeeded' ? 'succeeded' : 'failed';

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

    if (authState.subscription) {
      const sub = authState.subscription;
      unifiedAuthStore.setStripeSubscription({
        id: sub.stripe_subscription_id || `sub_${authState.user.id}`,
        customer_id: authState.user.id,
        stripe_subscription_id: sub.stripe_subscription_id || '',
        stripe_price_id: sub.stripe_price_id || '',
        plan_name: asPlanTier(sub.plan_tier),
        billing_interval: 'monthly',
        status: sub.status || 'none',
        current_period_start: sub.current_period_start
          ? Math.floor(new Date(sub.current_period_start).getTime() / 1000)
          : 0,
        current_period_end: sub.current_period_end
          ? Math.floor(new Date(sub.current_period_end).getTime() / 1000)
          : 0,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        subscription_source: sub.subscription_source ?? 'unknown',
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

    if (credits) {
      unifiedAuthStore.updateCredits({
        remaining_cents: credits.remaining_cents ?? 0,
        daily_used: credits.daily_used_cents,
        daily_limit: credits.daily_limit_cents,
        daily_reset_at: credits.daily_reset_at,
      });
    }

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
      subscriptionCancelAtPeriodEnd: authState.subscription?.cancel_at_period_end ?? false,
      subscriptionSource: authState.subscription?.subscription_source ?? 'unknown',
      stripeCustomerId: authState.subscription?.stripe_customer_id || null,
      featureFlags: authState.featureFlags,
      credits,
      accessToken: authState.session?.access_token || null,
      refreshToken: authState.session?.refresh_token || null,
      lastSyncedAt: Date.now(),
    });

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

  unsubscribeFn = cloudAccountAuth.onAuthStateChange((authState) => {
    void processAuthStateChange(authState);
  });

  const unsubscribeUsage = useUnifiedAuthStore.subscribe((authState) => {
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
