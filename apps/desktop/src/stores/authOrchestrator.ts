/**
 * Auth Orchestrator
 *
 * Centralizes all auth state handling to prevent race conditions.
 *
 * PROBLEM SOLVED:
 * Previously, App.tsx called initializeAuthStore(), initializeAccountStore(),
 * and initializeBillingStore() - each subscribing separately to supabaseAuth.onAuthStateChange().
 * When auth state changed, all 3 listeners fired simultaneously, causing:
 * - Race conditions in async operations (credit fetching, token syncing)
 * - Multiple parallel API calls
 * - Inconsistent state updates
 *
 * SOLUTION:
 * This orchestrator is the SINGLE listener for auth state changes.
 * It updates all stores in a coordinated, sequential manner.
 */

import { supabaseAuth, type AuthState } from '../services/supabaseAuth';
import {
  useUnifiedAuthStore,
  type CreditBalance,
  type SubscriptionStatus,
  type SubscriptionFetchStatus,
} from './auth';
import { useBillingUsageStore } from './billingUsage';
import { asPlanTier, PLAN_DISPLAY_NAMES, type PlanTier } from '../lib/supabase';
import { accountApi } from '../api/accountApi';
import { API_BASE_URL } from '../api/client';

/**
 * Type guard for checking if running in Tauri environment.
 * AUDIT-P3-TYPE: Proper type narrowing instead of unsafe cast.
 */
function checkIsTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window &&
    window.__TAURI_INTERNALS__ !== undefined
  );
}

const isTauri = checkIsTauri();

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
const SUBSCRIPTION_CACHE_KEY = 'agiworkforce_subscription_cache';
const SUBSCRIPTION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SubscriptionCache {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  fetchedAt: number;
  userId: string;
}

function getCachedSubscription(userId: string): SubscriptionCache | null {
  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as SubscriptionCache;
    if (data.userId === userId && Date.now() - data.fetchedAt < SUBSCRIPTION_CACHE_MAX_AGE_MS) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedSubscription(
  userId: string,
  planTier: PlanTier,
  subscriptionStatus: SubscriptionStatus,
): void {
  try {
    const cache: SubscriptionCache = {
      planTier,
      subscriptionStatus,
      fetchedAt: Date.now(),
      userId,
    };
    localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors
  }
}

function clearCachedSubscription(): void {
  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
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
      if (!credits401Cache || credits401Cache.accessToken !== accessToken) {
        console.log(
          '[AuthOrchestrator] Could not fetch credits (API unauthorized). In local dev, this often means AGI_API_URL points to a backend that does not match your Supabase project.',
        );
      }
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

/**
 * Process an auth state change, updating all stores in sequence.
 * This is the core function that coordinates all store updates.
 */
async function processAuthStateChange(authState: AuthState): Promise<void> {
  // If already processing, queue this state for after current processing completes
  if (isProcessingAuthChange) {
    pendingAuthState = authState;
    console.log('[AuthOrchestrator] Auth change queued (already processing)');
    return;
  }

  isProcessingAuthChange = true;

  try {
    // Skip if still loading - wait for complete state
    if (authState.isLoading) {
      console.log('[AuthOrchestrator] Auth is loading, waiting...');
      return;
    }

    // Skip if subscription is still being fetched
    if (authState.subscriptionFetchStatus === 'fetching') {
      console.log('[AuthOrchestrator] Subscription fetch in progress, waiting...');
      return;
    }

    console.log('[AuthOrchestrator] Processing auth state change:', {
      hasUser: !!authState.user,
      hasSession: !!authState.session,
      subscriptionFetchStatus: authState.subscriptionFetchStatus,
    });

    // Get the unified auth store
    const unifiedAuthStore = useUnifiedAuthStore.getState();

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Update user info in unified store
    // ═══════════════════════════════════════════════════════════════
    if (authState.user) {
      unifiedAuthStore.setUser({
        id: authState.user.id,
        email: authState.user.email || '',
        name:
          authState.profile?.display_name ||
          (authState.user.user_metadata?.['full_name'] as string),
        avatar:
          authState.profile?.avatar_url || (authState.user.user_metadata?.['avatar_url'] as string),
      });
    } else {
      unifiedAuthStore.clearAuth();
    }

    // If no user and not loading, clear store and return
    if (!authState.user) {
      console.log('[AuthOrchestrator] No user, clearing unified auth store');
      unifiedAuthStore.reset();
      clearCachedSubscription();
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Determine plan tier with cache fallback
    // ═══════════════════════════════════════════════════════════════
    let planTier: PlanTier | null;
    let subscriptionStatus: SubscriptionStatus = 'none';
    const userId = authState.user.id;

    if (authState.subscription?.plan_tier) {
      // Fresh data from backend
      planTier = asPlanTier(authState.subscription.plan_tier);
      subscriptionStatus = (authState.subscription.status as SubscriptionStatus) || 'active';
      setCachedSubscription(userId, planTier, subscriptionStatus);
      console.log('[AuthOrchestrator] Using fetched plan tier:', planTier);
    } else if (authState.subscriptionFetchStatus === 'failed') {
      // Fetch failed - try cache
      const cached = getCachedSubscription(userId);
      if (cached) {
        planTier = cached.planTier;
        subscriptionStatus = cached.subscriptionStatus;
        console.log('[AuthOrchestrator] Using cached plan tier:', planTier);
      } else {
        // CRITICAL: Don't default to 'free' - keep as null
        planTier = null;
        console.log('[AuthOrchestrator] Fetch failed, no cache - plan unknown');
      }
    } else {
      // Fetch succeeded but no subscription = genuinely free tier
      planTier = 'free';
      clearCachedSubscription();
      console.log('[AuthOrchestrator] Confirmed free tier (no subscription)');
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Fetch credits (single call, not duplicated across stores)
    // ═══════════════════════════════════════════════════════════════
    let credits: CreditBalance | null = null;
    if (authState.session?.access_token) {
      try {
        credits = await fetchCreditsWithCache(authState.session.access_token);
        console.log('[AuthOrchestrator] Credits fetched:', credits?.remaining_cents);
      } catch (error) {
        console.warn('[AuthOrchestrator] Credit fetch failed:', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Update Unified Auth Store (combines auth, account, billing)
    // ═══════════════════════════════════════════════════════════════
    const fetchStatus: SubscriptionFetchStatus =
      authState.subscriptionFetchStatus === 'succeeded' ? 'succeeded' : 'failed';

    // Set Stripe customer info
    unifiedAuthStore.setStripeCustomer({
      id: authState.user.id,
      stripe_customer_id: authState.subscription?.stripe_customer_id || '',
      email: authState.user.email || '',
      name: authState.profile?.display_name || undefined,
      created_at: Math.floor(new Date(authState.user.created_at).getTime() / 1000),
      updated_at: Date.now() / 1000,
    });

    // Set Stripe subscription if available
    if (authState.subscription) {
      const sub = authState.subscription;
      unifiedAuthStore.setStripeSubscription({
        id: sub.stripe_subscription_id || `sub_${authState.user.id}`,
        customer_id: authState.user.id,
        stripe_subscription_id: sub.stripe_subscription_id || '',
        stripe_price_id: sub.stripe_price_id || '',
        plan_name: planTier || 'free',
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
      plan: planTier,
      planDisplayName: planTier ? PLAN_DISPLAY_NAMES[planTier] : 'Loading...',
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

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Sync to Rust backend (if in Tauri)
    // ═══════════════════════════════════════════════════════════════
    if (isTauri && authState.session) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // Sync API base URL
        await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });

        // Sync tokens
        await invoke('account_store_access_token', {
          accessToken: authState.session.access_token,
        });

        if (authState.session.refresh_token) {
          await invoke('account_store_refresh_token', {
            refreshToken: authState.session.refresh_token,
          });
        }

        // Initialize ManagedCloud provider
        await invoke('llm_ensure_managed_cloud');
        console.log('[AuthOrchestrator] Rust backend synced');
      } catch (error) {
        console.warn('[AuthOrchestrator] Failed to sync with Rust backend:', error);
      }
    }

    console.log('[AuthOrchestrator] Auth state processing complete');
  } finally {
    isProcessingAuthChange = false;

    // Process any queued auth state
    if (pendingAuthState) {
      const nextState = pendingAuthState;
      pendingAuthState = null;
      console.log('[AuthOrchestrator] Processing queued auth state');
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

  console.log('[AuthOrchestrator] Initializing...');
  orchestratorInitialized = true;

  // Subscribe to auth state changes
  unsubscribeFn = supabaseAuth.onAuthStateChange((authState) => {
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
        subscription.current_period_start !== billingUsageStore.usagePeriodStart ||
        subscription.current_period_end !== billingUsageStore.usagePeriodEnd
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
    console.log('[AuthOrchestrator] Cleanup');
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
}
