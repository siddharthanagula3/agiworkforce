/**
 * Supabase Auth Service
 *
 * Unified authentication service using Supabase Auth.
 * Supports email/password, magic link, and OAuth providers.
 */

import type { AuthError, AuthResponse, OAuthResponse, User, Session } from '@supabase/supabase-js';
import {
  getSupabase,
  type Profile,
  type Subscription,
  type FeatureFlag,
  type PlanTier,
  asPlanTier,
} from '../lib/supabase';

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

  private constructor() {
    this.initializeAuthListener();
  }

  static getInstance(): SupabaseAuthService {
    if (!SupabaseAuthService.instance) {
      SupabaseAuthService.instance = new SupabaseAuthService();
    }
    return SupabaseAuthService.instance;
  }

  /**
   * Initialize auth state listener
   */
  private initializeAuthListener(): void {
    const supabase = getSupabase();

    // Listen for auth state changes
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

    // Check initial session
    this.checkSession();
  }

  /**
   * Check for existing session on app start
   */
  async checkSession(): Promise<void> {
    const supabase = getSupabase();

    try {
      this.updateState({ isLoading: true });
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
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

  /**
   * Handle successful sign in
   */
  private async handleSignedIn(session: Session): Promise<void> {
    const user = session.user;
    this.updateState({ user, session, isLoading: true, error: null });

    try {
      // Fetch profile and subscription in parallel
      const [profile, subscription, featureFlags] = await Promise.all([
        this.fetchProfile(user.id),
        this.fetchSubscription(user.id),
        this.fetchFeatureFlags(user.id),
      ]);

      this.updateState({
        profile,
        subscription,
        featureFlags,
        isLoading: false,
      });
    } catch (error) {
      console.error('[Auth] Error fetching user data:', error);
      this.updateState({ isLoading: false });
    }
  }

  /**
   * Handle sign out
   */
  private handleSignedOut(): void {
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

  /**
   * Fetch user profile
   */
  private async fetchProfile(userId: string): Promise<Profile | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      console.error('[Auth] Error fetching profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Fetch user subscription
   */
  private async fetchSubscription(userId: string): Promise<Subscription | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('[Auth] Error fetching subscription:', error);
      return null;
    }

    return data;
  }

  /**
   * Fetch user feature flags
   */
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

  /**
   * Sign up with email and password
   */
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

  /**
   * Sign in with email and password
   */
  async signIn({ email, password }: SignInData): Promise<AuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const response = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
  }

  /**
   * Sign in with magic link (passwordless)
   */
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

  /**
   * Verify OTP code (for magic link or phone auth)
   */
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

  /**
   * Sign in with OAuth provider
   */
  async signInWithOAuth(provider: AuthProvider): Promise<OAuthResponse> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const response = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // For desktop app, we'll use a redirect URL that the app can handle
        redirectTo: window.location.origin,
      },
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true });

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[Auth] Sign out error:', error);
      this.updateState({ error: error.message });
    }

    // State will be updated via auth state listener
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    this.updateState({ isLoading: false, error: error?.message || null });

    return { error };
  }

  /**
   * Update password (when user is signed in)
   */
  async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    const supabase = getSupabase();
    this.updateState({ isLoading: true, error: null });

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    this.updateState({ isLoading: false, error: error?.message || null });

    return { error };
  }

  /**
   * Update user profile
   */
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

  /**
   * Get current auth state
   */
  getState(): AuthState {
    return { ...this.currentState };
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.currentState.user;
  }

  /**
   * Get current session
   */
  getSession(): Session | null {
    return this.currentState.session;
  }

  /**
   * Get current plan tier
   */
  getPlanTier(): PlanTier {
    return asPlanTier(this.currentState.subscription?.plan_tier);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.currentState.user && !!this.currentState.session;
  }

  /**
   * Check if user has a specific plan
   */
  hasPlan(tier: PlanTier): boolean {
    const currentTier = this.getPlanTier();
    const tierHierarchy: PlanTier[] = ['free', 'pro', 'enterprise'];
    return tierHierarchy.indexOf(currentTier) >= tierHierarchy.indexOf(tier);
  }

  /**
   * Check if a feature flag is enabled
   */
  hasFeature(flagName: string): boolean {
    return this.currentState.featureFlags[flagName] === true;
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(listener: (state: AuthState) => void): () => void {
    this.authStateListeners.add(listener);
    // Immediately call with current state
    listener(this.getState());

    // Return unsubscribe function
    return () => {
      this.authStateListeners.delete(listener);
    };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<AuthState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
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

  /**
   * Refresh user data from database
   */
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

// Export singleton instance
export const supabaseAuth = SupabaseAuthService.getInstance();

// Export types
export type { User, Session, Profile, Subscription, FeatureFlag };
