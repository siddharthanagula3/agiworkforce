import {
  AuthError,
  type AuthResponse,
  type OAuthResponse,
  type User,
  type Session,
} from '@supabase/supabase-js';
import {
  getSupabase,
  type Profile,
  type Subscription,
  type FeatureFlag,
  type PlanTier,
  asPlanTier,
} from '../lib/supabase';

// Check if running in Tauri environment
const isTauri = !!(window as any).__TAURI_INTERNALS__;

// Dynamic import of invoke to handle web development mode
const getInvoke = async () => {
  if (!isTauri) {
    return null; // Return null in web mode, caller should check
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
};

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  featureFlags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
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
  };
  private isHandlingSignIn = false; // Prevent re-entry during handleSignedIn

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
      console.log('[Auth] State change:', event, session?.user?.email);

      if (event === 'SIGNED_IN' && session) {
        await this.handleSignedIn(session);
      } else if (event === 'SIGNED_OUT') {
        this.handleSignedOut();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        this.updateState({ session });
      } else if (event === 'USER_UPDATED' && session) {
        await this.handleSignedIn(session);
      }
    });

    this.checkSession();
  }

  async checkSession(): Promise<void> {
    const supabase = getSupabase();

    try {
      this.updateState({ isLoading: true });

      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null }; error: { message: string } }>(
        (resolve) =>
          setTimeout(
            () =>
              resolve({ data: { session: null }, error: { message: 'Session check timed out' } }),
            5000,
          ),
      );

      const {
        data: { session },
        error,
      } = await Promise.race([sessionPromise, timeoutPromise]);

      if (error && error.message !== 'Session check timed out') {
        console.error('[Auth] Session check error:', error);
        this.updateState({ isLoading: false, error: error.message });
        return;
      }

      if (session) {
        await this.handleSignedIn(session);
      } else {
        this.updateState({ isLoading: false });
      }
    } catch (error) {
      console.error('[Auth] Session check failed:', error);
      this.updateState({ isLoading: false, error: 'Failed to check session' });
    }
  }

  private subscriptionChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | null = null;

  private async handleSignedIn(session: Session): Promise<void> {
    // Prevent re-entry - setSession below can trigger another auth state change
    if (this.isHandlingSignIn) {
      console.log('[Auth] Already handling sign-in, skipping re-entry');
      return;
    }
    this.isHandlingSignIn = true;

    const user = session.user;
    // Don't notify listeners yet - we'll batch all updates at the end
    // This prevents race conditions where listeners see incomplete state
    this.currentState = { ...this.currentState, user, session, isLoading: true, error: null };

    try {
      // Ensure the session is properly set in the Supabase client
      const supabase = getSupabase();
      console.log('[Auth] Ensuring session is set in Supabase client...');
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (setSessionError) {
        console.error('[Auth] Failed to set session:', setSessionError);
      } else {
        console.log('[Auth] Session set successfully');
      }

      const [profile, subscription, featureFlags] = await Promise.all([
        this.fetchProfile(user.id),
        this.fetchSubscription(user.id),
        this.fetchFeatureFlags(user.id),
      ]);

      console.log('[Auth] All user data fetched, subscription:', subscription?.plan_tier);

      // NOW notify listeners with the complete state (including subscription)
      this.updateState({
        user,
        session,
        profile,
        subscription,
        featureFlags,
        isLoading: false,
        error: null,
      });

      this.subscribeToSubscriptionChanges(user.id);
    } catch (error) {
      console.error('[Auth] Error fetching user data:', error);
      this.updateState({ isLoading: false });
    } finally {
      this.isHandlingSignIn = false;
    }
  }

  private handleSignedOut(): void {
    if (this.subscriptionChannel) {
      this.subscriptionChannel.unsubscribe();
      this.subscriptionChannel = null;
    }

    this.updateState({
      user: null,
      session: null,
      profile: null,
      subscription: null,
      featureFlags: {},
      isLoading: false,
      error: null,
    });
  }

  private subscribeToSubscriptionChanges(userId: string): void {
    // Clean up existing channel if any
    if (this.subscriptionChannel) {
      this.subscriptionChannel.unsubscribe();
    }

    const supabase = getSupabase();
    console.log('[Auth] Subscribing to subscription changes for user:', userId);

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
        async (payload) => {
          console.log('[Auth] Subscription change detected:', payload);
          const newSubscription = await this.fetchSubscription(userId);
          this.updateState({ subscription: newSubscription });
        },
      )
      .subscribe();
  }

  private async fetchProfile(userId: string): Promise<Profile | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      console.error('[Auth] Error fetching profile:', error);
      return null;
    }

    return data;
  }

  private async fetchSubscription(userId: string, retryCount = 0): Promise<Subscription | null> {
    const supabase = getSupabase();
    const maxRetries = 3;
    const timeoutMs = 15000; // Increased to 15s for better reliability

    console.log(
      '[Auth] Fetching subscription for user:',
      userId,
      retryCount > 0 ? `(retry ${retryCount})` : '',
    );

    try {
      // First, check if we have a valid session
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[Auth] Current session check:', {
        hasSession: !!sessionData?.session,
        userId: sessionData?.session?.user?.id,
        expiresAt: sessionData?.session?.expires_at,
      });

      if (!sessionData?.session) {
        console.error('[Auth] No session available for subscription query');
        return null;
      }

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => {
          console.error(`[Auth] Subscription fetch TIMED OUT after ${timeoutMs / 1000}s`);
          resolve({
            data: null,
            error: { message: `Subscription fetch timed out after ${timeoutMs / 1000}s` },
          });
        }, timeoutMs),
      );

      console.log('[Auth] Creating Supabase query...');
      const queryPromise = supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      console.log('[Auth] Waiting for query result...');
      const result = await Promise.race([queryPromise, timeoutPromise]);
      console.log('[Auth] Query result received:', result);

      const { data, error } = result;

      if (error) {
        // Check if it's a "no rows" error (user has no subscription yet) - this is expected for free users
        if (error.message?.includes('no rows') || (error as any).code === 'PGRST116') {
          console.log('[Auth] No subscription found for user (free tier)');
          return null;
        }

        console.error('[Auth] Error fetching subscription:', error);

        // Retry on timeout or temporary errors
        if (
          retryCount < maxRetries &&
          (error.message?.includes('timed out') || error.message?.includes('network'))
        ) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
          console.log(`[Auth] Retrying subscription fetch in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.fetchSubscription(userId, retryCount + 1);
        }

        return null;
      }

      console.log('[Auth] Fetched subscription successfully:', data);
      return data;
    } catch (err) {
      console.error('[Auth] Exception fetching subscription:', err);

      // Retry on exceptions
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        console.log(`[Auth] Retrying subscription fetch in ${delay}ms after exception...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchSubscription(userId, retryCount + 1);
      }

      return null;
    }
  }

  private async fetchFeatureFlags(userId: string): Promise<Record<string, boolean>> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('feature_flags')
      .select('flag_name, enabled')
      .eq('user_id', userId);

    if (error) {
      console.error('[Auth] Error fetching feature flags:', error);
      return {};
    }

    return (data || []).reduce(
      (acc, flag) => {
        acc[flag.flag_name] = flag.enabled ?? false;
        return acc;
      },
      {} as Record<string, boolean>,
    );
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
          10000,
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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
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

    const response = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
  }

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true });

    try {
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
            console.log('[Auth] Local database cleared on logout');
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

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
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
    const supabase = getSupabase();
    console.log('[Auth] Manually setting session');

    // Explicitly set session
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    if (error) {
      console.error('[Auth] Failed to set session:', error);
      this.updateState({ error: error.message });
      return { error };
    }

    if (data.session) {
      await this.handleSignedIn(data.session);
    }

    return { error: null };
  }

  hasPlan(tier: PlanTier): boolean {
    const currentTier = this.getPlanTier();
    const tierHierarchy: PlanTier[] = ['free', 'pro', 'enterprise'];
    return tierHierarchy.indexOf(currentTier) >= tierHierarchy.indexOf(tier);
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
      });
    } catch (error) {
      console.error('[Auth] Error refreshing user data:', error);
    }
  }
}

export const supabaseAuth = SupabaseAuthService.getInstance();

export type { User, Session, Profile, Subscription, FeatureFlag };
