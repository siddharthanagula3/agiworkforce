import { toast } from 'sonner';
import {
  type FeatureFlag,
  type PlanTier,
  type Profile,
  type Subscription,
  asPlanTier,
} from '../lib/cloudAccountTypes';
import { API_BASE_URL, WEB_APP_URL } from '../api/config';
import { invoke } from '../lib/tauri-mock';
// `isTauri` from the zero-import leaf, not the barrel: this module runs during
// auth-store init (checkSession → isLocalDevBrowser), and pulling `isTauri`
// through the cyclic `tauri-mock` barrel reads it before initialization.
import { isTauri } from '../lib/runtimeEnvironment';
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

export interface OAuthResponse {
  data: { provider: AuthProvider; url: string | null };
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

interface AccountSnapshot {
  profile: Profile | null;
  subscription: Subscription | null;
  featureFlags: Record<string, boolean>;
}

type ApiMeResponse = {
  id?: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  plan?: {
    tier?: string | null;
    status?: string | null;
    current_period_end?: string | number | null;
  } | null;
  feature_flags?: Record<string, unknown> | null;
};

const AUTH_CACHE_PREFIX = 'agiworkforce_auth_cache_';
const AUTH_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DEV_BROWSER_SESSION_STORAGE_KEY = '__AGI_DEV_BROWSER_CLOUD_SESSION__';

interface CachedAuthData<T> {
  data: T;
  userId: string;
  cachedAt: number;
}

function isLocalDevBrowser(): boolean {
  if (isTauri || typeof window === 'undefined' || !import.meta.env.DEV) return false;
  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
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

function buildSubscription(userId: string, plan: ApiMeResponse['plan']): Subscription | null {
  if (!plan) return null;
  const now = new Date().toISOString();
  const tier = asPlanTier(plan.tier);
  const currentPeriodEnd = dateFromUnknown(plan.current_period_end);

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

function normalizeFeatureFlags(raw: ApiMeResponse['feature_flags']): Record<string, boolean> {
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
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Could not open AGI web sign-in: ${message}`);
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

    this.updateState({ isLoading: false, error: null });
  }

  async signUp({ email }: SignUpData): Promise<AuthResponse> {
    await openWebAccount(`/sign-up?email=${encodeURIComponent(email)}&surface=desktop`);
    return {
      data: { user: null, session: null },
      error: new AuthError('Continue sign-up in AGI web, then approve this desktop device.', 202),
    };
  }

  async signIn({ email }: SignInData): Promise<AuthResponse> {
    await openWebAccount(`/sign-in?email=${encodeURIComponent(email)}&surface=desktop`);
    return {
      data: { user: null, session: null },
      error: new AuthError('Continue sign-in in AGI web, then approve this desktop device.', 202),
    };
  }

  async signInWithMagicLink(email: string): Promise<{ error: AuthError | null }> {
    await openWebAccount(`/sign-in?email=${encodeURIComponent(email)}&surface=desktop`);
    return { error: null };
  }

  async verifyOtp(_email: string, _token: string): Promise<AuthResponse> {
    return {
      data: { user: null, session: null },
      error: new AuthError('Email-code verification is handled by Clerk on AGI web.', 400),
    };
  }

  async signInWithOAuth(provider: AuthProvider): Promise<OAuthResponse> {
    const url = `/sign-in?provider=${encodeURIComponent(provider)}&surface=desktop`;
    await openWebAccount(url);
    return {
      data: { provider, url: `${WEB_APP_URL}${url}` },
      error: null,
    };
  }

  async exchangeCodeForSession(_code: string): Promise<AuthResponse> {
    return {
      data: { user: null, session: null },
      error: new AuthError(
        'Desktop auth now uses Clerk device-link approval, not code exchange.',
        400,
      ),
    };
  }

  async signOut(): Promise<void> {
    this.updateState({ isLoading: true });
    try {
      if (isTauri) {
        await invoke('account_clear_tokens').catch((error) => {
          console.warn('[Auth] Failed to clear cloud account tokens:', error);
        });
      }
      sessionStorage.clear();
    } finally {
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

  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    await openWebAccount(`/sign-in?email=${encodeURIComponent(email)}&redirect=reset-password`);
    return { error: null };
  }

  async updatePassword(_newPassword: string): Promise<{ error: AuthError | null }> {
    await openWebAccount('/user');
    return { error: null };
  }

  async updateProfile(
    updates: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>,
  ): Promise<{ error: Error | null }> {
    const currentProfile = this.currentState.profile;
    if (!this.currentState.user || !currentProfile) {
      return { error: new Error('Not authenticated') };
    }

    const updatedProfile: Profile = {
      ...currentProfile,
      display_name: updates.display_name ?? currentProfile.display_name,
      avatar_url: updates.avatar_url ?? currentProfile.avatar_url,
      updated_at: new Date().toISOString(),
    };
    this.updateState({ profile: updatedProfile });
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
    refresh_token?: string | null;
  }): Promise<{ error: AuthError | null }> {
    if (!tokens.access_token || typeof tokens.access_token !== 'string') {
      const error = new AuthError('Invalid access token provided', 400, 'invalid_token');
      this.updateState({ error: error.message, isLoading: false });
      return { error };
    }

    const session = buildSession(tokens.access_token, tokens.refresh_token);
    this.updateState({
      user: session.user,
      session,
      isLoading: false,
      error: null,
      subscriptionFetchStatus: 'fetching',
    });

    if (isTauri) {
      try {
        await invoke('account_store_api_base_url', { apiBaseUrl: API_BASE_URL });
        await invoke('account_store_access_token', { accessToken: session.access_token });
        if (session.refresh_token) {
          await invoke('account_store_refresh_token', { refreshToken: session.refresh_token });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.updateState({ error: message });
        return { error: new AuthError(message, 500, 'token_store_failed') };
      }
    }

    await this.refreshUserData();
    return { error: null };
  }

  hasPlan(tier: PlanTier): boolean {
    const currentTier = this.getPlanTier();
    const tierHierarchy: Record<PlanTier, number> = {
      'local-only': 0,
      byok: 0,
      free: 0,
      hobby: 1,
      pro: 2,
      pro_plus: 3,
      max: 4,
      enterprise: 5,
    };
    return (tierHierarchy[currentTier] ?? 0) >= (tierHierarchy[tier] ?? 0);
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

  async refreshUserData(): Promise<void> {
    const session = this.currentState.session;
    const user = this.currentState.user;
    if (!session || !user) return;

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
        subscriptionFetchStatus: snapshot.subscription ? 'succeeded' : 'failed',
        error: null,
      });
    } catch (error) {
      console.warn('[Auth] Failed to refresh Clerk/Neon account data:', error);
      this.updateState({ subscriptionFetchStatus: 'failed' });
    }
  }

  private async fetchAccountSnapshot(accessToken: string): Promise<AccountSnapshot> {
    // Dynamic import breaks the egressGuard ↔ appModeStore load-time cycle while
    // working under ESM (a relative `require()` does not resolve here). By the
    // time this async method runs, the module graph is fully loaded.
    const { guardedFetch } = await import('../lib/egressGuard');
    const response = await guardedFetch(`${WEB_APP_URL}/api/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Account API returned ${response.status}`);
    }

    const data = (await response.json()) as ApiMeResponse;
    const userId = data.id ?? this.currentState.user?.id ?? userFromAccessToken(accessToken).id;
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
