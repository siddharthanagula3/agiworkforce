// Updated: 2026-01-07 - Non-blocking auth with cold start handling
import {
  AuthError,
  type AuthResponse,
  type OAuthResponse,
  type User,
  type Session,
} from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  getSupabase,
  type Profile,
  type Subscription,
  type FeatureFlag,
  type PlanTier,
  type FallbackProfileData,
  asPlanTier,
  isValidProfileData,
} from '../lib/supabase';
import { API_BASE_URL } from '../api/client';
import { isTauri } from '../lib/tauri-mock';

// ============================================================================
// LocalStorage Cache for Resilience Against Cold Starts
// ============================================================================
const AUTH_CACHE_PREFIX = 'agiworkforce_auth_cache_';
const AUTH_CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes - limits exposure window after token revocation

interface CachedAuthData<T> {
  data: T;
  userId: string;
  cachedAt: number;
}

function getCachedData<T>(key: string, userId: string): T | null {
  try {
    const raw = localStorage.getItem(`${AUTH_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const cached: CachedAuthData<T> = JSON.parse(raw);
    // Validate cache: must be for same user and not expired
    if (cached.userId !== userId) return null;
    if (Date.now() - cached.cachedAt > AUTH_CACHE_MAX_AGE_MS) return null;
    return cached.data;
  } catch (err) {
    // AUDIT-P3-ERROR: Cache read failure - graceful degradation to null
    console.debug('[Auth] Failed to read cached data for key:', key, err);
    return null;
  }
}

function setCachedData<T>(key: string, userId: string, data: T): void {
  try {
    const cached: CachedAuthData<T> = { data, userId, cachedAt: Date.now() };
    localStorage.setItem(`${AUTH_CACHE_PREFIX}${key}`, JSON.stringify(cached));
  } catch (err) {
    // AUDIT-P3-ERROR: Cache write failure - non-critical, app continues without caching
    console.debug('[Auth] Failed to cache data for key:', key, err);
  }
}

function clearAuthCache(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(AUTH_CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    // AUDIT-P3-ERROR: Cache clear failure - non-critical during logout
    console.debug('[Auth] Failed to clear auth cache:', err);
  }
}

// ============================================================================
// Database Warm-up for Cold Start Mitigation
// ============================================================================
let isWarmingUp = false;
let warmUpPromise: Promise<boolean> | null = null;

/**
 * Warm up the Supabase connection to mitigate cold start delays.
 * On free plan, the database pauses after inactivity. This function
 * sends a simple query to wake it up before auth queries.
 */
async function warmUpDatabase(): Promise<boolean> {
  // Deduplicate concurrent warm-up calls
  if (isWarmingUp && warmUpPromise) {
    return warmUpPromise;
  }

  isWarmingUp = true;
  warmUpPromise = (async () => {
    const supabase = getSupabase();
    const startTime = Date.now();

    try {
      // Use a longer timeout for cold start (30s)
      const pingPromise = supabase.from('profiles').select('id').limit(1);
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'Warm-up timed out' } }), 30000),
      );

      const { error } = await Promise.race([pingPromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;

      if (error) {
        console.warn(`[Auth] Database warm-up failed after ${elapsed}ms:`, error.message);
        return false;
      }

      console.debug(`[Auth] Database warm-up completed in ${elapsed}ms`);
      return true;
    } catch (err) {
      console.warn('[Auth] Database warm-up exception:', err);
      return false;
    } finally {
      isWarmingUp = false;
      warmUpPromise = null;
    }
  })();

  return warmUpPromise;
}

// ============================================================================
// Web API Fallback for Subscription
// ============================================================================
const WEB_APP_URL = import.meta.env['VITE_WEB_APP_URL'] || 'https://www.agiworkforce.com';

/**
 * Fetch subscription data from the web API as a fallback when direct Supabase queries fail.
 * The /api/me endpoint accepts Bearer token auth and returns subscription + credits.
 */
async function fetchSubscriptionFromWebAPI(accessToken: string): Promise<Subscription | null> {
  const timeoutMs = 30000; // Increased to 30s - Supabase responds but network can be slow

  try {
    console.debug('[Auth] Trying web API fallback for subscription...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${WEB_APP_URL}/api/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Auth] Web API fallback failed: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Transform /api/me response to Subscription format
    if (!data.plan) {
      console.debug('[Auth] Web API returned no plan (free tier user)');
      return null;
    }

    const subscription: Subscription = {
      id: '', // Not available from /api/me
      user_id: data.id,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      plan_tier: data.plan.tier || 'free',
      status: data.plan.status || 'active',
      current_period_start: null,
      current_period_end: data.plan.current_period_end
        ? new Date(data.plan.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: false,
      canceled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.debug('[Auth] Web API fallback succeeded:', subscription.plan_tier);
    return subscription;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[Auth] Web API fallback timed out after ${timeoutMs / 1000}s`);
    } else {
      console.warn('[Auth] Web API fallback failed:', err);
    }
    return null;
  }
}

// Deep link protocol for Tauri desktop app auth redirects
const TAURI_DEEP_LINK_PROTOCOL = 'agiworkforce://';

// Get the appropriate redirect URL based on environment
const getAuthRedirectUrl = (path: string = ''): string => {
  if (isTauri) {
    // Use deep link protocol for desktop app
    return `${TAURI_DEEP_LINK_PROTOCOL}auth${path}`;
  }
  // Use web URL for browser development
  return `${window.location.origin}${path}`;
};

// Dynamic import of invoke to handle web development mode
const getInvoke = async () => {
  if (!isTauri) {
    return null; // Return null in web mode, caller should check
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
};

export type SubscriptionFetchStatus = 'idle' | 'fetching' | 'succeeded' | 'failed';

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  featureFlags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  subscriptionFetchStatus: SubscriptionFetchStatus;
}

export type AuthProvider = 'google' | 'github' | 'apple' | 'discord';

export interface SignUpData {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

class SupabaseAuthService {
  private static instance: SupabaseAuthService;
  private authStateListeners: Set<(state: AuthState) => void> = new Set();
  private currentState: AuthState = {
    user: null,
    session: null,
    profile: null,
    subscription: null,
    featureFlags: {},
    isLoading: true,
    error: null,
    subscriptionFetchStatus: 'idle',
  };
  private isHandlingSignIn = false; // Prevent re-entry during handleSignedIn
  private handlingSignInForUser: string | null = null; // Track which user we're handling

  // Deduplication: prevent concurrent subscription fetches
  private subscriptionFetchInProgress = false;
  private pendingSubscriptionFetch: Promise<Subscription | null> | null = null;

  // Circuit breaker: stop retrying after consecutive failures
  private subscriptionFailureCount = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 5;
  private lastSubscriptionFailure: number = 0;

  // Track active background refresh to enable cancellation on logout/account switch
  private activeBackgroundRefreshUserId: string | null = null;

  private constructor() {
    this.initializeAuthListener();
  }

  static getInstance(): SupabaseAuthService {
    if (!SupabaseAuthService.instance) {
      SupabaseAuthService.instance = new SupabaseAuthService();
    }
    return SupabaseAuthService.instance;
  }

  private initializeAuthListener(): void {
    const supabase = getSupabase();

    supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] State change:', event, session?.user?.email);

      if (event === 'SIGNED_IN' && session) {
        await this.handleSignedIn(session);
      } else if (event === 'SIGNED_OUT') {
        this.handleSignedOut();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        this.updateState({ session });
        // Sync refreshed tokens to Rust backend for ManagedCloud provider
        if (isTauri) {
          (async () => {
            try {
              const invoke = await getInvoke();
              if (invoke) {
                await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });
                await invoke('account_store_access_token', {
                  accessToken: session.access_token,
                });
                if (session.refresh_token) {
                  await invoke('account_store_refresh_token', {
                    refreshToken: session.refresh_token,
                  });
                }
                console.debug('[Auth] Refreshed tokens synced to Rust backend');
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              console.warn('[Auth] Failed to sync refreshed tokens to Rust backend:', error);
              toast.error('Auth sync failed: ' + msg);
            }
          })();
        }
      } else if (event === 'USER_UPDATED' && session) {
        await this.handleSignedIn(session);
      }
    });

    this.checkSession();
  }

  async checkSession(): Promise<void> {
    const supabase = getSupabase();

    try {
      this.updateState({ isLoading: true, error: null });

      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null }; error: { message: string } }>(
        (resolve) =>
          setTimeout(
            () =>
              resolve({ data: { session: null }, error: { message: 'Session check timed out' } }),
            5000,
          ),
      );

      const result = await Promise.race([sessionPromise, timeoutPromise]);
      const { data, error } = result;

      if (error) {
        // Timeout is not a fatal error - we'll try again later or user can re-login
        if (error.message === 'Session check timed out') {
          console.warn('[Auth] Session check timed out - will retry on next auth event');
          // Don't set error state for timeout - just mark as not loading
          this.updateState({ isLoading: false });
          return;
        }

        console.error('[Auth] Session check error:', error);
        this.updateState({ isLoading: false, error: error.message });
        return;
      }

      const session = data?.session;
      if (session) {
        await this.handleSignedIn(session);
      } else {
        // No session - user is not logged in, this is normal
        this.updateState({ isLoading: false });
      }
    } catch (error) {
      // Network errors or other exceptions
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isNetworkError =
        message.includes('fetch') ||
        message.includes('network') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError');

      if (isNetworkError) {
        console.warn('[Auth] Network error during session check - offline or connectivity issue');
        // Don't set error state for network errors - let user know via UI hint
        this.updateState({ isLoading: false });
      } else {
        console.error('[Auth] Session check failed:', error);
        this.updateState({ isLoading: false, error: 'Failed to check session' });
      }
    }
  }

  private subscriptionChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null;
  private subscriptionChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionChangesSubscribedUserId: string | null = null;

  private async handleSignedIn(session: Session): Promise<void> {
    const user = session.user;

    // Prevent re-entry for the SAME user - setSession below can trigger another auth state change
    // But allow different users to interrupt (for account switching)
    if (this.isHandlingSignIn) {
      if (this.handlingSignInForUser === user.id) {
        console.debug('[Auth] Already handling sign-in for this user, skipping re-entry');
        return;
      } else {
        console.debug('[Auth] Different user signing in, resetting previous sign-in handler');
        // Reset for the new user
      }
    }
    this.isHandlingSignIn = true;
    this.handlingSignInForUser = user.id;

    // =========================================================================
    // CRITICAL: Sync tokens to Rust backend for ManagedCloud provider
    // This MUST happen before any LLM API calls can succeed
    // =========================================================================
    if (isTauri) {
      try {
        const invoke = await getInvoke();
        if (invoke) {
          await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });
          await invoke('account_store_access_token', {
            accessToken: session.access_token,
          });
          if (session.refresh_token) {
            await invoke('account_store_refresh_token', {
              refreshToken: session.refresh_token,
            });
          }
          console.debug('[Auth] Tokens synced to Rust backend on sign-in');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('[Auth] Failed to sync tokens to Rust backend on sign-in:', error);
        toast.error('Auth sync failed: ' + msg);
      }
    }

    // =========================================================================
    // PHASE 1: Immediate UI with cached data (non-blocking)
    // =========================================================================
    const cachedProfile = getCachedData<Profile>('profile', user.id);
    const cachedSubscription = getCachedData<Subscription>('subscription', user.id);
    const cachedFlags = getCachedData<Record<string, boolean>>('flags', user.id);

    // Show UI immediately with cached data (or defaults)
    this.updateState({
      user,
      session,
      profile: cachedProfile,
      subscription: cachedSubscription,
      featureFlags: cachedFlags || {},
      isLoading: false, // UI is ready!
      error: null,
      subscriptionFetchStatus: cachedSubscription ? 'succeeded' : 'fetching',
    });

    console.debug(
      '[Auth] UI ready with cached data:',
      cachedSubscription?.plan_tier || 'none',
      '- fetching fresh data in background...',
    );

    // =========================================================================
    // PHASE 2: Background data refresh (non-blocking)
    // =========================================================================
    // Track which user's background refresh is active to enable cancellation
    this.activeBackgroundRefreshUserId = user.id;

    // Run in background - don't await
    this.refreshDataInBackground(user.id, session).finally(() => {
      // Only clear handling flags if this was the active refresh
      if (this.activeBackgroundRefreshUserId === user.id) {
        this.isHandlingSignIn = false;
        this.handlingSignInForUser = null;
      }
    });
  }

  /**
   * Refresh user data in the background without blocking sign-in.
   * Uses warm-up to handle cold starts gracefully.
   */
  private async refreshDataInBackground(userId: string, session: Session): Promise<void> {
    try {
      // Check if this refresh has been superseded by another user or logout
      if (this.activeBackgroundRefreshUserId !== userId) {
        console.debug('[Auth] Background refresh cancelled - user changed');
        return;
      }

      // Ensure the session is properly set in the Supabase client
      const supabase = getSupabase();
      const setSessionPromise = supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      const setSessionTimeout = new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'setSession timed out' } }), 5000),
      );
      await Promise.race([setSessionPromise, setSessionTimeout]);

      // Check again after async operation
      if (this.activeBackgroundRefreshUserId !== userId) {
        console.debug('[Auth] Background refresh cancelled after setSession - user changed');
        return;
      }

      // Warm up the database first (handles cold start)
      console.debug('[Auth] Warming up database connection...');
      await warmUpDatabase();

      // Check again after database warm-up
      if (this.activeBackgroundRefreshUserId !== userId) {
        console.debug('[Auth] Background refresh cancelled after warm-up - user changed');
        return;
      }

      // Now fetch fresh data with shorter timeouts (database should be warm)
      console.debug('[Auth] Fetching fresh user data...');
      const [profile, subscription, featureFlags] = await Promise.all([
        this.fetchProfile(userId),
        this.fetchSubscription(userId, session),
        this.fetchFeatureFlags(userId),
      ]);

      // Final check before updating state
      if (this.activeBackgroundRefreshUserId !== userId) {
        console.debug('[Auth] Background refresh cancelled after fetch - user changed');
        return;
      }

      // Cache successful fetches
      if (profile) setCachedData('profile', userId, profile);
      if (subscription) setCachedData('subscription', userId, subscription);
      if (featureFlags && Object.keys(featureFlags).length > 0) {
        setCachedData('flags', userId, featureFlags);
      }

      console.debug('[Auth] Fresh data fetched, subscription:', subscription?.plan_tier);

      // Update state with fresh data
      this.updateState({
        profile: profile || this.currentState.profile,
        subscription: subscription || this.currentState.subscription,
        featureFlags: featureFlags || this.currentState.featureFlags,
        subscriptionFetchStatus: subscription ? 'succeeded' : 'failed',
      });

      this.subscribeToSubscriptionChanges(userId);
    } catch (error) {
      // Don't log or update state if cancelled
      if (this.activeBackgroundRefreshUserId !== userId) {
        return;
      }
      console.error('[Auth] Background data refresh failed:', error);
      // Don't update subscriptionFetchStatus to 'failed' if we have cached data
      if (!this.currentState.subscription) {
        this.updateState({ subscriptionFetchStatus: 'failed' });
      }
    }
  }

  private handleSignedOut(): void {
    // Cancel any ongoing background refresh
    this.activeBackgroundRefreshUserId = null;
    this.isHandlingSignIn = false;
    this.handlingSignInForUser = null;

    // Clean up subscription channel
    if (this.subscriptionChannel) {
      this.subscriptionChannel.unsubscribe();
      this.subscriptionChannel = null;
    }
    this.subscriptionChangesSubscribedUserId = null;

    // Clear debounce timer if active
    if (this.subscriptionChangeDebounceTimer) {
      clearTimeout(this.subscriptionChangeDebounceTimer);
      this.subscriptionChangeDebounceTimer = null;
    }

    // Reset circuit breaker and pending fetch state
    this.subscriptionFailureCount = 0;
    this.lastSubscriptionFailure = 0;
    this.subscriptionFetchInProgress = false;
    this.pendingSubscriptionFetch = null;

    // Clear auth cache on sign out
    clearAuthCache();

    this.updateState({
      user: null,
      session: null,
      profile: null,
      subscription: null,
      featureFlags: {},
      isLoading: false,
      error: null,
      subscriptionFetchStatus: 'idle',
    });
  }

  private subscribeToSubscriptionChanges(userId: string): void {
    // Avoid noisy unsubscribe/subscribe loops when auth state updates for the same user.
    if (this.subscriptionChannel && this.subscriptionChangesSubscribedUserId === userId) {
      return;
    }

    // Clean up existing channel if any
    if (this.subscriptionChannel) {
      this.subscriptionChannel.unsubscribe();
      this.subscriptionChannel = null;
    }
    this.subscriptionChangesSubscribedUserId = null;
    if (this.subscriptionChangeDebounceTimer) {
      clearTimeout(this.subscriptionChangeDebounceTimer);
      this.subscriptionChangeDebounceTimer = null;
    }

    const supabase = getSupabase();
    console.debug('[Auth] Subscribing to subscription changes for user:', userId);

    this.subscriptionChannel = supabase
      .channel(`subscription-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.debug('[Auth] Subscription change detected:', payload);

          // Debounce: wait 2s before fetching to avoid rapid-fire updates
          if (this.subscriptionChangeDebounceTimer) {
            clearTimeout(this.subscriptionChangeDebounceTimer);
          }
          this.subscriptionChangeDebounceTimer = setTimeout(async () => {
            this.subscriptionChangeDebounceTimer = null;
            try {
              const currentSession = this.currentState.session;
              const newSubscription = await this.fetchSubscription(userId, currentSession);
              this.updateState({ subscription: newSubscription });
            } catch (error) {
              console.error('[Auth] Error fetching subscription after change:', error);
            }
          }, 2000);
        },
      )
      .subscribe();
    this.subscriptionChangesSubscribedUserId = userId;
  }

  private async fetchProfile(userId: string): Promise<Profile | null> {
    const supabase = getSupabase();
    const timeoutMs = 15000; // Reduced to 15s to fail faster to fallback

    try {
      // Select specific columns for better performance
      const queryPromise = supabase
        .from('profiles')
        .select('id,email,display_name,avatar_url,created_at,updated_at,stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{ data: null; error: { message: string; code?: string } }>(
        (resolve) => {
          timeoutId = setTimeout(() => {
            resolve({
              data: null,
              error: { message: 'Profile fetch timed out', code: 'TIMEOUT' },
            });
          }, timeoutMs);
        },
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      if (error) {
        const errorWithCode = error as { code?: string; message?: string };
        if (errorWithCode.code === 'TIMEOUT') {
          console.warn(`[Auth] fetchProfile timed out after ${timeoutMs / 1000}s`);
        } else {
          console.warn(`[Auth] Error fetching profile (${error.message}), using fallback`);
        }
        // Fallback: Construct a minimal profile from the current user session if available
        // This ensures the APP DOES NOT HANG even if the profiles table is missing/locked
        const currentUser = this.currentState.user;
        if (currentUser && currentUser.id === userId) {
          // AUDIT-P3-TYPE: Build fallback data and validate before casting
          const fallbackData: FallbackProfileData = {
            id: userId,
            email: currentUser.email || '',
            display_name:
              (currentUser.user_metadata?.['full_name'] as string) ||
              (currentUser.user_metadata?.['name'] as string) ||
              currentUser.email?.split('@')[0] ||
              'User',
            avatar_url: (currentUser.user_metadata?.['avatar_url'] as string) ?? null,
            created_at: currentUser.created_at,
            updated_at: currentUser.updated_at || new Date().toISOString(),
            stripe_customer_id: null,
            credits: null,
          };

          // Validate the constructed data has required fields
          if (isValidProfileData(fallbackData)) {
            console.debug('[Auth] Constructed fallback profile from auth metadata');
            // Safe cast: Profile extends FallbackProfileData structure
            return fallbackData as unknown as Profile;
          }
          console.warn('[Auth] Fallback profile validation failed');
        }
        return this.currentState.profile;
      }

      return data;
    } catch (err) {
      console.error('[Auth] Exception fetching profile:', err);
      return this.currentState.profile;
    }
  }

  private async fetchSubscription(
    userId: string,
    session?: Session | null,
    retryCount = 0,
  ): Promise<Subscription | null> {
    // Circuit breaker: if we've had too many consecutive failures recently, don't fetch
    const circuitBreakerCooldown = 60000; // 1 minute cooldown after MAX_CONSECUTIVE_FAILURES
    if (
      this.subscriptionFailureCount >= SupabaseAuthService.MAX_CONSECUTIVE_FAILURES &&
      Date.now() - this.lastSubscriptionFailure < circuitBreakerCooldown
    ) {
      // AUDIT-P3-ERROR: Circuit breaker active - log and indicate degraded service
      console.warn(
        `[Auth] Circuit breaker active: skipping subscription fetch (${this.subscriptionFailureCount} consecutive failures). Using cached data if available.`,
      );
      // Update status to indicate we're using cached/fallback data
      if (this.currentState.subscriptionFetchStatus !== 'failed') {
        this.updateState({ subscriptionFetchStatus: 'failed' });
      }
      return this.currentState.subscription; // Return cached value
    }

    // Deduplication: if a fetch is already in progress, wait for it
    if (this.subscriptionFetchInProgress && this.pendingSubscriptionFetch) {
      console.debug(
        '[Auth] Subscription fetch already in progress, waiting for existing request...',
      );
      return this.pendingSubscriptionFetch;
    }

    // Mark fetch as in progress
    this.subscriptionFetchInProgress = true;

    // Create the actual fetch promise
    this.pendingSubscriptionFetch = this.doFetchSubscription(userId, session, retryCount);

    try {
      const result = await this.pendingSubscriptionFetch;

      // Reset failure count on success
      if (result !== null || this.subscriptionFailureCount > 0) {
        this.subscriptionFailureCount = 0;
      }

      return result;
    } catch (error) {
      // Track failure for circuit breaker
      this.subscriptionFailureCount++;
      this.lastSubscriptionFailure = Date.now();
      console.error(
        `[Auth] Subscription fetch failed (failure ${this.subscriptionFailureCount}/${SupabaseAuthService.MAX_CONSECUTIVE_FAILURES}):`,
        error,
      );
      throw error;
    } finally {
      // Clear the in-progress flag
      this.subscriptionFetchInProgress = false;
      this.pendingSubscriptionFetch = null;
    }
  }

  // Reset circuit breaker (call after successful login or manual refresh)
  resetCircuitBreaker(): void {
    this.subscriptionFailureCount = 0;
    this.lastSubscriptionFailure = 0;
    console.debug('[Auth] Circuit breaker reset');
  }

  private async doFetchSubscription(
    userId: string,
    session?: Session | null,
    _retryCount = 0,
  ): Promise<Subscription | null> {
    const supabase = getSupabase();
    const timeoutMs = 30000; // Increased to 30s - Supabase responds but network can be slow

    console.debug('[Auth] Fetching subscription for user:', userId);

    // Get access token for web API fallback
    const accessToken = session?.access_token || this.currentState.session?.access_token;

    // =========================================================================
    // STEP 1: Try direct Supabase query (fastest when DB is warm)
    // =========================================================================
    try {
      console.debug('[Auth] Step 1: Trying direct Supabase query...');

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => {
          resolve({
            data: null,
            error: { message: `Subscription fetch timed out after ${timeoutMs / 1000}s` },
          });
        }, timeoutMs),
      );

      const queryPromise = supabase
        .from('subscriptions')
        .select(
          'id,user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_tier,status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,created_at,updated_at',
        )
        .eq('user_id', userId)
        .maybeSingle();

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const { data, error } = result;

      if (!error && data) {
        console.debug('[Auth] Direct Supabase query succeeded:', data.plan_tier);
        return data;
      }

      // "No rows" is expected for free users - but we should still try web API to confirm
      const errorWithCode = error as { code?: string; message?: string } | null;
      if (error?.message?.includes('no rows') || errorWithCode?.code === 'PGRST116') {
        console.debug('[Auth] No subscription in Supabase, trying web API to confirm...');
      } else if (error) {
        console.warn('[Auth] Supabase query failed:', error.message);
      }
    } catch (err) {
      console.warn('[Auth] Supabase query exception:', err);
    }

    // =========================================================================
    // STEP 2: Try Web API fallback (works when Supabase is slow/down)
    // =========================================================================
    if (accessToken) {
      try {
        console.debug('[Auth] Step 2: Trying web API fallback...');
        const webApiResult = await fetchSubscriptionFromWebAPI(accessToken);

        if (webApiResult) {
          console.debug('[Auth] Web API fallback succeeded:', webApiResult.plan_tier);
          return webApiResult;
        }

        console.debug('[Auth] Web API returned no subscription (confirmed free tier)');
      } catch (err) {
        console.warn('[Auth] Web API fallback failed:', err);
      }
    } else {
      console.warn('[Auth] No access token available for web API fallback');
    }

    // =========================================================================
    // STEP 3: Both failed - return null (caller handles cache/loading state)
    // =========================================================================
    console.warn('[Auth] All subscription fetch methods failed');
    return null;
  }

  private async fetchFeatureFlags(userId: string): Promise<Record<string, boolean>> {
    const supabase = getSupabase();
    const timeoutMs = 15000; // Reduced to 15s

    try {
      const queryPromise = supabase
        .from('feature_flags')
        .select('flag_name, enabled')
        .eq('user_id', userId);

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<{
        data: null;
        error: { message: string; code?: string };
      }>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({
            data: null,
            error: { message: 'Feature flags fetch timed out', code: 'TIMEOUT' },
          });
        }, timeoutMs);
      });

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      if (error) {
        const errorWithCode = error as { code?: string; message?: string };
        if (errorWithCode.code === 'TIMEOUT') {
          console.warn(`[Auth] fetchFeatureFlags timed out after ${timeoutMs / 1000}s`);
        } else {
          console.warn(`[Auth] Error fetching feature flags (${error.message}), using defaults`);
        }
        // Return cached flags if available, otherwise empty object (defaults)
        return this.currentState.featureFlags || {};
      }

      return (data || []).reduce(
        (acc, flag) => {
          acc[flag.flag_name] = flag.enabled ?? false;
          return acc;
        },
        {} as Record<string, boolean>,
      );
    } catch (err) {
      console.error('[Auth] Exception fetching feature flags:', err);
      return this.currentState.featureFlags || {};
    }
  }

  async signUp({ email, password, displayName }: SignUpData): Promise<AuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const response = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: displayName,
          name: displayName,
        },
      },
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
  }

  async signIn({ email, password }: SignInData): Promise<AuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });
      const timeoutPromise = new Promise<{
        data: { user: null; session: null };
        error: { message: string };
      }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: { user: null, session: null },
              error: { message: 'Sign in timed out' },
            }),
          30000, // Increased to 30s
        ),
      );

      // We need to cast the race result because the types might not perfectly align
      // between the official response and our timeout object, but they are compatible for our usage.
      const response = (await Promise.race([signInPromise, timeoutPromise])) as AuthResponse;

      if (response.error) {
        this.updateState({ isLoading: false, error: response.error.message });
      }

      return response;
    } catch (error) {
      console.error('[Auth] Sign in exception:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.updateState({ isLoading: false, error: message });
      return {
        data: { user: null, session: null },
        error: new AuthError(message, 500, 'AuthError'),
      };
    }
  }

  async signInWithMagicLink(email: string): Promise<{ error: AuthError | null }> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    // Use deep link for Tauri, web origin for browser dev
    const redirectUrl = getAuthRedirectUrl('/callback');
    console.debug('[Auth] Magic link redirect URL:', redirectUrl);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      this.updateState({ isLoading: false, error: error.message });
    } else {
      this.updateState({ isLoading: false });
    }

    return { error };
  }

  async verifyOtp(email: string, token: string): Promise<AuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const response = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
  }

  async signInWithOAuth(provider: AuthProvider): Promise<OAuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    // Use deep link for Tauri, web origin for browser dev
    const redirectUrl = getAuthRedirectUrl('/callback');
    console.debug('[Auth] OAuth redirect URL:', redirectUrl);

    const response = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: isTauri,
      },
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
      return response;
    }

    if (isTauri) {
      const oauthUrl = response.data?.url;
      if (!oauthUrl) {
        const errorMessage = 'OAuth URL missing from provider response.';
        this.updateState({ isLoading: false, error: errorMessage });
        return {
          data: {
            provider,
            url: null,
          },
          error: new AuthError(errorMessage, 500, 'OAuthError'),
        };
      }

      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(oauthUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.updateState({ isLoading: false, error: message });
        return {
          data: {
            provider,
            url: null,
          },
          error: new AuthError(message, 500, 'OAuthError'),
        };
      }
    }

    this.updateState({ isLoading: false });
    return response;
  }

  async exchangeCodeForSession(code: string): Promise<AuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    try {
      const response = await supabase.auth.exchangeCodeForSession(code);
      if (response.error) {
        this.updateState({ isLoading: false, error: response.error.message });
      } else {
        this.updateState({ isLoading: false });
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateState({ isLoading: false, error: message });
      return {
        data: { user: null, session: null },
        error: new AuthError(message, 500, 'OAuthError'),
      };
    }
  }

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true });

    try {
      // SECURITY: Clear tokens from secure storage FIRST before sign out
      if (isTauri) {
        try {
          const invoke = await getInvoke();
          if (invoke) {
            // Clear auth tokens from OS keyring
            await invoke('account_clear_tokens').catch((err) => {
              console.warn('[Auth] Failed to clear tokens from keyring:', err);
              // Continue with sign out even if keyring clear fails
            });
            console.debug('[Auth] Auth tokens cleared from secure storage');
          }
        } catch (err) {
          console.error('[Auth] Failed to clear auth tokens:', err);
        }
      }

      // Clear any localStorage/sessionStorage tokens
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();

      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise<{ error: { message: string } | null }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'Sign out timed out' } }), 2000),
      );

      const { error } = await Promise.race([signOutPromise, timeoutPromise]);

      if (error && error.message !== 'Sign out timed out') {
        console.error('[Auth] Sign out error:', error);
        this.updateState({ error: error.message });
      }
    } catch (error) {
      console.error('[Auth] Sign out exception:', error);
      this.updateState({ error: String(error) });
    } finally {
      // Clear local database to ensure strict data isolation (only in Tauri)
      if (isTauri) {
        try {
          const invoke = await getInvoke();
          if (invoke) {
            await invoke('clear_local_database');
            console.debug('[Auth] Local database cleared on logout');
          }
        } catch (err) {
          // Log but don't block sign out state update
          console.error('[Auth] Failed to clear local database on logout:', err);
        }
      }

      // Ensure we clean up state even if the SIGNED_OUT event doesn't fire appropriately
      // or if there was an error.
      this.handleSignedOut();
    }
  }

  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    // For desktop app, redirect to web app's password reset page since
    // deep links with hash fragments don't work well for password reset flow.
    // The web app will handle the token and allow password update.
    const redirectUrl = isTauri
      ? `${WEB_APP_URL}/auth/update-password`
      : `${window.location.origin}/reset-password`;
    console.debug('[Auth] Password reset redirect URL:', redirectUrl);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    this.updateState({ isLoading: false, error: error?.message || null });

    return { error };
  }

  async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    this.updateState({ isLoading: false, error: error?.message || null });

    return { error };
  }

  async updateProfile(
    updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>,
  ): Promise<{ error: Error | null }> {
    const supabase = getSupabase();
    const userId = this.currentState.user?.id;

    if (!userId) {
      return { error: new Error('Not authenticated') };
    }

    this.updateState({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      this.updateState({ isLoading: false, error: error.message });
      return { error: new Error(error.message) };
    }

    this.updateState({ profile: data, isLoading: false });
    return { error: null };
  }

  getState(): AuthState {
    return { ...this.currentState };
  }

  getUser(): User | null {
    return this.currentState.user;
  }

  getSession(): Session | null {
    return this.currentState.session;
  }

  getPlanTier(): PlanTier {
    return asPlanTier(this.currentState.subscription?.plan_tier);
  }

  isAuthenticated(): boolean {
    return !!this.currentState.user && !!this.currentState.session;
  }

  async setSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ error: AuthError | null }> {
    // Validate token inputs
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      const error = new AuthError('Invalid access token provided', 400, 'invalid_token');
      console.error('[Auth] setSession failed: invalid access token');
      this.updateState({ error: error.message, isLoading: false });
      return { error };
    }

    if (!tokens.refresh_token || typeof tokens.refresh_token !== 'string') {
      const error = new AuthError('Invalid refresh token provided', 400, 'invalid_token');
      console.error('[Auth] setSession failed: invalid refresh token');
      this.updateState({ error: error.message, isLoading: false });
      return { error };
    }

    const supabase = getSupabase();
    console.debug('[Auth] Manually setting session');
    this.updateState({ isLoading: true, error: null });

    try {
      // Explicitly set session with timeout
      const setSessionPromise = supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      const timeoutPromise = new Promise<{
        data: { session: null; user: null };
        error: AuthError;
      }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              data: { session: null, user: null },
              error: new AuthError('Session set timed out', 408, 'timeout'),
            }),
          10000,
        ),
      );

      const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]);

      if (error) {
        console.error('[Auth] Failed to set session:', error);
        this.updateState({ error: error.message, isLoading: false });
        return { error: error as AuthError };
      }

      if (data.session) {
        await this.handleSignedIn(data.session);
      } else {
        // Session was set but no session returned - unusual but handle gracefully
        console.warn('[Auth] setSession succeeded but no session data returned');
        this.updateState({ isLoading: false });
      }

      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error setting session';
      console.error('[Auth] setSession exception:', err);
      this.updateState({ error: message, isLoading: false });
      return { error: new AuthError(message, 500, 'unknown') };
    }
  }

  hasPlan(tier: PlanTier): boolean {
    const currentTier = this.getPlanTier();
    // Complete plan hierarchy from lowest to highest
    const tierHierarchy: Record<PlanTier, number> = {
      free: 0,
      hobby: 1,
      pro: 2,
      max: 3,
      enterprise: 4,
    };
    const currentLevel = tierHierarchy[currentTier] ?? 0;
    const requiredLevel = tierHierarchy[tier] ?? 0;
    return currentLevel >= requiredLevel;
  }

  hasFeature(flagName: string): boolean {
    return this.currentState.featureFlags[flagName] === true;
  }

  onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.authStateListeners.add(listener);

    listener(this.getState());

    return () => {
      this.authStateListeners.delete(listener);
    };
  }

  private updateState(updates: Partial<AuthState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.authStateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('[Auth] Error in auth state listener:', error);
      }
    });
  }

  async refreshUserData(): Promise<void> {
    const userId = this.currentState.user?.id;
    if (!userId) return;

    // Mark as fetching before starting
    this.updateState({ subscriptionFetchStatus: 'fetching' });

    try {
      const [profile, subscription, featureFlags] = await Promise.all([
        this.fetchProfile(userId),
        this.fetchSubscription(userId),
        this.fetchFeatureFlags(userId),
      ]);

      this.updateState({
        profile,
        subscription,
        featureFlags,
        subscriptionFetchStatus: 'succeeded',
      });
    } catch (error) {
      console.error('[Auth] Error refreshing user data:', error);
      this.updateState({ subscriptionFetchStatus: 'failed' });
    }
  }
}

export const supabaseAuth = SupabaseAuthService.getInstance();

export type { User, Session, Profile, Subscription, FeatureFlag };
