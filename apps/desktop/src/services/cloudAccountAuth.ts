import { toast } from 'sonner';
import {
  type FeatureFlag,
  type PlanTier,
  type Profile,
  type Subscription,
  asPlanTier,
} from '../lib/cloudAccountTypes';
import { WEB_APP_URL } from '../api/config';
import { parseMeResponse, type MeResponse } from '@agiworkforce/cloud-contracts';
import { effectivePlanTier, normalizeUIPlanTier, tierAtLeast } from '@agiworkforce/types';
import { invoke } from '../lib/tauri-mock';
// `isTauri` from the zero-import leaf, not the barrel: this module runs during
// auth-store init (checkSession → isLocalDevBrowser), and pulling `isTauri`
// through the cyclic `tauri-mock` barrel reads it before initialization.
import { isTauri } from '../lib/runtimeEnvironment';
import { authorizeDesktopDevice } from './desktopDeviceAuthorization';
import {
  openDesktopCloudSignInWindow,
  type DesktopCloudSignInWindowSession,
} from './desktopCloudSignInWindow';
import { openDesktopCloudAccountWindow } from './desktopCloudAccountWindow';
// NOTE: egressGuard is required LAZILY at its call site (fetchAccountSnapshot)
// to break the load-time cycle egressGuard → appModeStore → auth →
// cloudAccountAuth → egressGuard. A static import here re-introduces it.

export class AuthError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface User {
  id: string;
  email?: string;
  created_at: string;
  user_metadata?: Record<string, unknown>;
}

export interface Session {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number;
  user: User;
}

export interface AuthResponse {
  data: { user: User | null; session: Session | null };
  error: AuthError | null;
}

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

interface AccountSnapshot {
  profile: Profile | null;
  subscription: Subscription | null;
  featureFlags: Record<string, boolean>;
}

interface NativeDeviceAuthorizationResponse {
  status: number;
  body: string;
}

const AUTH_CACHE_PREFIX = 'agiworkforce_auth_cache_';
const AUTH_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DEV_BROWSER_SESSION_STORAGE_KEY = '__AGI_DEV_BROWSER_CLOUD_SESSION__';
const NATIVE_SESSION_RESTORE_TIMEOUT_MS = 8_000;
const SESSION_REFRESH_SKEW_SECONDS = 5 * 60;

interface CachedAuthData<T> {
  data: T;
  userId: string;
  cachedAt: number;
}

function isLocalDevBrowser(): boolean {
  if (isTauri || typeof window === 'undefined' || !import.meta.env.DEV) return false;
  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}

async function restoreNativeSessionSeed(): Promise<{
  access_token: string | null;
  refresh_token: string | null;
}> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.all([
        invoke<string | null>('account_restore_access_token'),
        invoke<string | null>('account_restore_refresh_token'),
      ]).then(([accessToken, refreshToken]) => ({
        access_token: accessToken,
        refresh_token: refreshToken,
      })),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('The system credential vault did not respond in time.')),
          NATIVE_SESSION_RESTORE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function readDevBrowserSessionSeed(): {
  access_token: string;
  refresh_token?: string | null;
} | null {
  if (!isLocalDevBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(DEV_BROWSER_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed['access_token'] !== 'string' || parsed['access_token'].length === 0) {
      return null;
    }

    return {
      access_token: parsed['access_token'],
      refresh_token:
        typeof parsed['refresh_token'] === 'string' || parsed['refresh_token'] === null
          ? parsed['refresh_token']
          : null,
    };
  } catch (error) {
    console.warn('[Auth] Ignoring invalid dev browser session seed:', error);
    return null;
  }
}

const authCacheMap = new Map<string, CachedAuthData<unknown>>();

function getCachedData<T>(key: string, userId: string): T | null {
  const cached = authCacheMap.get(`${AUTH_CACHE_PREFIX}${key}`) as CachedAuthData<T> | undefined;
  if (!cached || cached.userId !== userId) return null;
  if (Date.now() - cached.cachedAt > AUTH_CACHE_MAX_AGE_MS) return null;
  return cached.data;
}

function setCachedData<T>(key: string, userId: string, data: T): void {
  authCacheMap.set(`${AUTH_CACHE_PREFIX}${key}`, { data, userId, cachedAt: Date.now() });
}

function clearAuthCache(): void {
  authCacheMap.clear();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringClaim(claims: Record<string, unknown> | null, key: string): string | undefined {
  const value = claims?.[key];
  return typeof value === 'string' ? value : undefined;
}

function dateFromUnknown(value: string | number | null | undefined): string {
  if (typeof value === 'number') {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function userFromAccessToken(accessToken: string): User {
  const claims = decodeJwtPayload(accessToken);
  const id = stringClaim(claims, 'sub') ?? stringClaim(claims, 'user_id') ?? 'clerk-user';
  const email =
    stringClaim(claims, 'email') ??
    stringClaim(claims, 'primary_email_address') ??
    stringClaim(claims, 'primary_email');
  const fullName = stringClaim(claims, 'name') ?? stringClaim(claims, 'full_name');
  const avatarUrl = stringClaim(claims, 'picture') ?? stringClaim(claims, 'avatar_url');
  const createdAt = dateFromUnknown(
    typeof claims?.['iat'] === 'number' ? (claims['iat'] as number) : undefined,
  );

  return {
    id,
    email,
    created_at: createdAt,
    user_metadata: {
      full_name: fullName,
      name: fullName,
      avatar_url: avatarUrl,
    },
  };
}

function buildSession(accessToken: string, refreshToken?: string | null): Session {
  const claims = decodeJwtPayload(accessToken);
  const expiresAt = typeof claims?.['exp'] === 'number' ? (claims['exp'] as number) : undefined;
  return {
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
    expires_at: expiresAt,
    user: userFromAccessToken(accessToken),
  };
}

function buildSubscription(userId: string, plan: MeResponse['plan'] | null): Subscription | null {
  if (!plan) return null;
  const now = new Date().toISOString();
  const tier = asPlanTier(plan.tier);
  const currentPeriodEnd =
    plan.current_period_end === null ? null : dateFromUnknown(plan.current_period_end);

  return {
    id: `cloud-account-${userId}`,
    user_id: userId,
    plan_tier: tier,
    status: plan.status ?? 'none',
    stripe_customer_id: null,
    stripe_price_id: null,
    stripe_subscription_id: null,
    current_period_start: null,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: now,
    updated_at: now,
  };
}

function normalizeFeatureFlags(raw: MeResponse['feature_flags'] | null): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  if (!raw) return flags;
  for (const [key, value] of Object.entries(raw)) {
    flags[key] = value === true;
  }
  return flags;
}

async function openWebAccount(path = '/sign-in'): Promise<void> {
  const url = `${WEB_APP_URL}${path}`;
  if (!isTauri) {
    window.location.href = url;
    return;
  }

  try {
    await openDesktopCloudAccountWindow(path, 'AGI Cloud account');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Could not open the AGI Cloud account window: ${message}`);
  }
}

class CloudAccountAuthService {
  private static instance: CloudAccountAuthService;
  private authStateListeners: Set<(state: AuthState) => void> = new Set();
  private currentState: AuthState = {
    user: null,
    session: null,
    profile: null,
    subscription: null,
    featureFlags: {},
    isLoading: false,
    error: null,
    subscriptionFetchStatus: 'idle',
  };
  private deviceAuthorizationController: AbortController | null = null;
  private invalidSessionCleanup: Promise<void> | null = null;
  private sessionRefreshPromise: Promise<{ error: AuthError | null }> | null = null;
  private sessionExpiryTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): CloudAccountAuthService {
    if (!CloudAccountAuthService.instance) {
      CloudAccountAuthService.instance = new CloudAccountAuthService();
    }
    return CloudAccountAuthService.instance;
  }

  async checkSession(): Promise<void> {
    const devBrowserSeed = readDevBrowserSessionSeed();
    if (devBrowserSeed && !this.currentState.session) {
      await this.setSession(devBrowserSeed);
      return;
    }

    if (isTauri && !this.currentState.session) {
      this.updateState({ isLoading: true, error: null });
      try {
        const seed = await restoreNativeSessionSeed();
        if (seed.access_token) {
          await this.setSession({
            access_token: seed.access_token,
            refresh_token: seed.refresh_token,
          });
          return;
        }
        if (seed.refresh_token) {
          await this.refreshSession(seed.refresh_token);
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Auth] Failed to restore the encrypted Cloud session:', message);
        this.updateState({
          isLoading: false,
          error: 'Could not restore the saved Cloud session. Please connect again.',
        });
        return;
      }
    }

    this.updateState({ isLoading: false, error: null });
  }

  private async authorizeCloudAccount(): Promise<AuthResponse> {
    this.deviceAuthorizationController?.abort();
    const controller = new AbortController();
    this.deviceAuthorizationController = controller;
    this.updateState({ isLoading: true, error: null });
    const signInWindow: { current: DesktopCloudSignInWindowSession | null } = { current: null };

    try {
      const { guardedFetch } = await import('../lib/egressGuard');
      if (isTauri) {
        // Device authorization, account validation, managed chat persistence,
        // and native sync all terminate at the Next.js managed-cloud origin.
        // Set it before requesting a code so a fresh install cannot fall back
        // to a stale API-gateway override.
        await invoke('account_store_api_base_url', { apiBaseUrl: WEB_APP_URL });
      }
      const credential = await authorizeDesktopDevice({
        origin: WEB_APP_URL,
        signal: controller.signal,
        post: async (url, payload, headers) => {
          if (isTauri) {
            const endpoint = new URL(url);
            const trustedOrigin = new URL(WEB_APP_URL).origin;
            if (endpoint.origin !== trustedOrigin) {
              throw new Error('Refusing an untrusted AGI Cloud authorization endpoint.');
            }

            let response: NativeDeviceAuthorizationResponse;
            if (endpoint.pathname === '/api/auth/device/code') {
              response = await invoke<NativeDeviceAuthorizationResponse>(
                'account_start_device_authorization',
              );
            } else if (endpoint.pathname === '/api/auth/device/token') {
              const record =
                payload !== null && typeof payload === 'object' && !Array.isArray(payload)
                  ? (payload as Record<string, unknown>)
                  : {};
              const deviceCode = record['device_code'];
              if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
                throw new Error('Missing AGI Cloud device authorization code.');
              }
              response = await invoke<NativeDeviceAuthorizationResponse>(
                'account_poll_device_authorization',
                { deviceCode },
              );
            } else {
              throw new Error('Refusing an unsupported AGI Cloud authorization endpoint.');
            }

            if (
              response === null ||
              typeof response !== 'object' ||
              typeof response.status !== 'number' ||
              typeof response.body !== 'string'
            ) {
              throw new Error('AGI Desktop received an invalid Cloud authorization response.');
            }
            return response;
          }

          const response = await guardedFetch(url, {
            method: 'POST',
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              ...headers,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          return { status: response.status, body: await response.text() };
        },
        openAuthorization: async (url) => {
          if (isTauri) {
            signInWindow.current = await openDesktopCloudSignInWindow(url, {
              onUserClosed: () => controller.abort(),
            });
            return;
          }
          const opened = window.open(url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            throw new Error('Could not open AGI Cloud sign-in in your browser.');
          }
        },
      });

      if (controller.signal.aborted) {
        throw new AuthError('AGI Cloud sign-in was cancelled.', 499, 'authorization_cancelled');
      }
      await signInWindow.current?.close();
      signInWindow.current = null;
      return await this.finishDeviceAuthorization(credential);
    } catch (error) {
      const authError =
        error instanceof AuthError
          ? error
          : new AuthError(
              error instanceof Error ? error.message : String(error),
              400,
              'device_authorization_failed',
            );
      this.updateState({ isLoading: false, error: authError.message });
      return { data: { user: null, session: null }, error: authError };
    } finally {
      await signInWindow.current?.close();
      if (this.deviceAuthorizationController === controller) {
        this.deviceAuthorizationController = null;
      }
    }
  }

  private async finishDeviceAuthorization(credential: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<AuthResponse> {
    const result = await this.setSession({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken ?? null,
    });
    if (result.error) {
      return { data: { user: null, session: null }, error: result.error };
    }
    return {
      data: { user: this.currentState.user, session: this.currentState.session },
      error: null,
    };
  }

  async signIn(_legacyCredentials?: unknown): Promise<AuthResponse> {
    return this.authorizeCloudAccount();
  }

  async signOut(): Promise<void> {
    this.deviceAuthorizationController?.abort();
    this.deviceAuthorizationController = null;
    this.updateState({ isLoading: true });
    const accessToken = this.currentState.session?.access_token;
    try {
      if (accessToken) {
        try {
          const { guardedFetch } = await import('../lib/egressGuard');
          await guardedFetch(`${WEB_APP_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'X-AGI-Surface': 'desktop',
            },
            body: '{}',
          });
        } catch (error) {
          // Local credential removal must still complete when the network is
          // unavailable. The server-side developer token is short-lived and
          // will expire even if this best-effort revocation cannot be sent.
          console.warn('[Auth] Could not revoke the Cloud session remotely:', error);
        }
      }
      if (isTauri) {
        await invoke('account_clear_tokens').catch((error) => {
          console.warn('[Auth] Failed to clear cloud account tokens:', error);
        });
      }
      if (typeof window !== 'undefined') {
        // Cloud sign-out must not erase unrelated session-scoped Desktop UI
        // state. Only the development-browser credential seed belongs here;
        // Tauri credentials live in the native encrypted account store.
        window.sessionStorage.removeItem(DEV_BROWSER_SESSION_STORAGE_KEY);
      }
    } finally {
      this.clearSessionExpiryTimer();
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
  }

  async openAccountManagement(): Promise<void> {
    await openWebAccount('/user');
  }

  async updateProfile(
    updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>,
  ): Promise<{ error: Error | null }> {
    const currentProfile = this.currentState.profile;
    if (!this.currentState.user || !currentProfile) {
      return { error: new Error('Not authenticated') };
    }

    try {
      const { guardedFetch } = await import('../lib/egressGuard');
      const response = await guardedFetch(`${WEB_APP_URL}/api/me?surface=desktop`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${this.currentState.session?.access_token ?? ''}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-AGI-Surface': 'desktop',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        if (response.status === 401) {
          await this.invalidateSession();
        }
        throw new Error(`AGI Cloud profile update failed (HTTP ${response.status}).`);
      }

      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('AGI Cloud returned an invalid profile update response.');
      }
      const record = payload as Record<string, unknown>;
      const displayName =
        typeof record['display_name'] === 'string' ? record['display_name'] : null;
      const avatarUrl = typeof record['avatar_url'] === 'string' ? record['avatar_url'] : null;
      const updatedProfile: Profile = {
        ...currentProfile,
        display_name: displayName ?? updates.display_name ?? currentProfile.display_name,
        avatar_url:
          record['avatar_url'] === null
            ? null
            : (avatarUrl ?? updates.avatar_url ?? currentProfile.avatar_url),
        updated_at: new Date().toISOString(),
      };
      this.updateState({ profile: updatedProfile });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
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

  async getValidSession(): Promise<Session | null> {
    const session = this.currentState.session;
    if (!session) return null;

    const now = Math.floor(Date.now() / 1000);
    if (
      session.refresh_token &&
      session.expires_at &&
      session.expires_at <= now + SESSION_REFRESH_SKEW_SECONDS
    ) {
      const result = await this.refreshSession(session.refresh_token);
      return result.error ? null : this.currentState.session;
    }

    if (session.expires_at && session.expires_at <= now) {
      await this.invalidateSession('Your AGI Cloud session has expired. Please connect again.');
      return null;
    }

    return session;
  }

  async invalidateSession(
    message = 'Your AGI Cloud session is no longer authorized. Please connect again.',
  ): Promise<void> {
    if (this.invalidSessionCleanup) {
      await this.invalidSessionCleanup;
      return;
    }

    this.invalidSessionCleanup = this.clearInvalidSession(message);
    try {
      await this.invalidSessionCleanup;
    } finally {
      this.invalidSessionCleanup = null;
    }
  }

  getPlanTier(): PlanTier {
    return asPlanTier(
      effectivePlanTier(
        this.currentState.subscription?.plan_tier,
        this.currentState.subscription?.status,
      ),
    );
  }

  isAuthenticated(): boolean {
    return !!this.currentState.user && !!this.currentState.session;
  }

  async setSession(tokens: {
    access_token: string;
    refresh_token?: string | null;
  }): Promise<{ error: AuthError | null }> {
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      const error = new AuthError('Invalid access token provided', 400, 'invalid_token');
      this.updateState({ error: error.message, isLoading: false });
      return { error };
    }

    const session = buildSession(tokens.access_token, tokens.refresh_token);
    if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      if (session.refresh_token && !this.sessionRefreshPromise) {
        return this.refreshSession(session.refresh_token);
      }
      const error = new AuthError(
        'Your AGI Cloud session has expired. Please connect again.',
        401,
        'session_expired',
      );
      await this.invalidateSession(error.message);
      return { error };
    }

    this.updateState({
      user: session.user,
      session,
      isLoading: false,
      error: null,
      subscriptionFetchStatus: 'fetching',
    });
    this.scheduleSessionExpiry(session);

    if (isTauri) {
      try {
        await invoke('account_store_api_base_url', { apiBaseUrl: WEB_APP_URL });
        await invoke('account_store_access_token', { accessToken: session.access_token });
        if (session.refresh_token) {
          await invoke('account_store_refresh_token', { refreshToken: session.refresh_token });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const authError = new AuthError(
          `Could not save the AGI Cloud session securely: ${message}`,
          500,
          'token_store_failed',
        );
        // The native vault may have accepted one token before a later write
        // failed. Clear both native and in-memory state so the UI can never
        // appear authenticated with a session that cannot be restored safely.
        await this.invalidateSession(authError.message);
        return { error: authError };
      }
    }

    const accountValidated = await this.refreshUserData();
    if (!accountValidated) {
      const error = new AuthError(
        'Your AGI Cloud session has expired or was revoked. Please connect again.',
        401,
        'session_invalid',
      );
      await this.invalidateSession(error.message);
      return { error };
    }
    return { error: null };
  }

  hasPlan(tier: PlanTier): boolean {
    const currentTier = this.getPlanTier();
    return tierAtLeast(normalizeUIPlanTier(currentTier), normalizeUIPlanTier(tier));
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

  async refreshUserData(): Promise<boolean> {
    const session = this.currentState.session;
    const user = this.currentState.user;
    if (!session || !user) return false;

    const cachedProfile = getCachedData<Profile>('profile', user.id);
    const cachedSubscription = getCachedData<Subscription>('subscription', user.id);
    const cachedFlags = getCachedData<Record<string, boolean>>('flags', user.id);
    if (cachedProfile || cachedSubscription || cachedFlags) {
      this.updateState({
        profile: cachedProfile ?? this.currentState.profile,
        subscription: cachedSubscription ?? this.currentState.subscription,
        featureFlags: cachedFlags ?? this.currentState.featureFlags,
      });
    }

    this.updateState({ subscriptionFetchStatus: 'fetching' });

    try {
      const snapshot = await this.fetchAccountSnapshot(session.access_token);
      if (snapshot.profile) setCachedData('profile', user.id, snapshot.profile);
      if (snapshot.subscription) setCachedData('subscription', user.id, snapshot.subscription);
      setCachedData('flags', user.id, snapshot.featureFlags);

      this.updateState({
        ...snapshot,
        // The device bearer carries `email: ''` whenever the browser approval
        // had no email claim, so /api/me is the only authoritative source of
        // the account address. Fold it back onto the user instead of dropping
        // it into `profile` alone, or every consumer of `authState.user.email`
        // (sidebar, account settings) shows a blank address forever.
        user:
          this.currentState.user && !this.currentState.user.email && snapshot.profile?.email
            ? { ...this.currentState.user, email: snapshot.profile.email }
            : this.currentState.user,
        // A successful account snapshot with no subscription is the canonical
        // Free-tier state, not a billing fetch failure. The orchestrator uses
        // `succeeded + null subscription` to select the Free plan honestly.
        subscriptionFetchStatus: 'succeeded',
        error: null,
      });
      return true;
    } catch (error) {
      console.warn('[Auth] Failed to refresh Clerk/Neon account data:', error);
      const authorizationRejected =
        error instanceof AuthError && (error.status === 401 || error.status === 403);
      this.updateState({
        subscriptionFetchStatus: 'failed',
        error: authorizationRejected
          ? error.message
          : 'AGI Cloud account details are temporarily unavailable. Your session is still connected.',
      });
      // Only an explicit authorization response invalidates the credential.
      // Network, rate-limit, server, and contract failures keep the revocable
      // session connected so a transient /api/me outage cannot sign the user
      // back out immediately after a successful in-app authorization.
      return !authorizationRejected;
    }
  }

  private async clearInvalidSession(message: string): Promise<void> {
    this.clearSessionExpiryTimer();
    if (isTauri) {
      await invoke('account_clear_tokens').catch((error) => {
        console.warn('[Auth] Failed to clear an invalid Cloud session:', error);
      });
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(DEV_BROWSER_SESSION_STORAGE_KEY);
    }
    clearAuthCache();
    this.updateState({
      user: null,
      session: null,
      profile: null,
      subscription: null,
      featureFlags: {},
      isLoading: false,
      error: message,
      subscriptionFetchStatus: 'idle',
    });
  }

  private clearSessionExpiryTimer(): void {
    if (this.sessionExpiryTimer) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
  }

  private scheduleSessionExpiry(session: Session): void {
    this.clearSessionExpiryTimer();
    if (!session.expires_at) return;

    const refreshSkewMs = session.refresh_token ? SESSION_REFRESH_SKEW_SECONDS * 1000 : 0;
    const delayMs = Math.max(0, session.expires_at * 1000 - Date.now() - refreshSkewMs);
    this.sessionExpiryTimer = setTimeout(() => {
      this.sessionExpiryTimer = null;
      void this.getValidSession();
    }, delayMs);
  }

  private async refreshSession(refreshToken: string): Promise<{ error: AuthError | null }> {
    if (this.sessionRefreshPromise) return this.sessionRefreshPromise;

    this.sessionRefreshPromise = (async () => {
      try {
        const tokens = await this.requestDeviceTokenRefresh(refreshToken);
        return await this.setSession(tokens);
      } catch (error) {
        const authError =
          error instanceof AuthError
            ? error
            : new AuthError(
                error instanceof Error ? error.message : String(error),
                401,
                'refresh_failed',
              );
        await this.invalidateSession(
          'Your AGI Cloud session could not be renewed. Please connect again.',
        );
        return { error: authError };
      }
    })();

    try {
      return await this.sessionRefreshPromise;
    } finally {
      this.sessionRefreshPromise = null;
    }
  }

  private async requestDeviceTokenRefresh(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const { guardedFetch } = await import('../lib/egressGuard');
    const response = await guardedFetch(`${WEB_APP_URL}/api/auth/device/refresh`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-AGI-Surface': 'desktop',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new AuthError(
        'AGI Cloud rejected the saved refresh credential.',
        response.status,
        'invalid_refresh_token',
      );
    }
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AuthError(
        'AGI Cloud returned an invalid refresh response.',
        502,
        'invalid_refresh',
      );
    }
    const record = payload as Record<string, unknown>;
    const accessToken = record['access_token'];
    const nextRefreshToken = record['refresh_token'];
    if (
      typeof accessToken !== 'string' ||
      !accessToken ||
      typeof nextRefreshToken !== 'string' ||
      !nextRefreshToken
    ) {
      throw new AuthError(
        'AGI Cloud returned an invalid refresh response.',
        502,
        'invalid_refresh',
      );
    }
    return { access_token: accessToken, refresh_token: nextRefreshToken };
  }

  private async fetchAccountSnapshot(accessToken: string): Promise<AccountSnapshot> {
    // Dynamic import breaks the egressGuard ↔ appModeStore load-time cycle while
    // working under ESM (a relative `require()` does not resolve here). By the
    // time this async method runs, the module graph is fully loaded.
    const { guardedFetch } = await import('../lib/egressGuard');
    const response = await guardedFetch(`${WEB_APP_URL}/api/me?surface=desktop`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new AuthError(
        response.status === 401 || response.status === 403
          ? 'Your AGI Cloud session is no longer authorized.'
          : `AGI Cloud account API returned ${response.status}.`,
        response.status,
        response.status === 401 || response.status === 403
          ? 'session_unauthorized'
          : 'account_api_failed',
      );
    }

    // Validate against the shared /api/me contract (packages/services) — a
    // mismatch throws into refreshUserData's catch (fetch status 'failed',
    // cached snapshot kept) instead of silently mis-mapping account fields.
    const data = parseMeResponse(await response.json());
    const userId = data.id || (this.currentState.user?.id ?? userFromAccessToken(accessToken).id);
    const now = new Date().toISOString();
    const profile: Profile = {
      id: userId,
      email: data.email ?? this.currentState.user?.email ?? null,
      display_name: data.name ?? this.currentState.user?.email ?? null,
      avatar_url: data.avatar_url ?? null,
      stripe_customer_id: null,
      created_at: dateFromUnknown(data.created_at) || now,
      updated_at: dateFromUnknown(data.updated_at) || now,
    };

    return {
      profile,
      subscription: buildSubscription(userId, data.plan),
      featureFlags: normalizeFeatureFlags(data.feature_flags),
    };
  }

  resetCircuitBreaker(): void {
    this.updateState({ error: null, subscriptionFetchStatus: 'idle' });
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
}

export const cloudAccountAuth = CloudAccountAuthService.getInstance();

export async function initializeWebAuth(): Promise<boolean> {
  await cloudAccountAuth.checkSession();
  return cloudAccountAuth.isAuthenticated();
}

export type { Profile, Subscription, FeatureFlag };
