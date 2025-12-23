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

  private async handleSignedIn(session: Session): Promise<void> {
    const user = session.user;
    this.updateState({ user, session, isLoading: true, error: null });

    try {
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

  private async fetchProfile(userId: string): Promise<Profile | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      console.error('[Auth] Error fetching profile:', error);
      return null;
    }

    return data;
  }

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

    const response = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (response.error) {
      this.updateState({ isLoading: false, error: response.error.message });
    }

    return response;
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

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[Auth] Sign out error:', error);
      this.updateState({ error: error.message });
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
