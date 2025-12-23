import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // Read-only for this endpoint usually, but needed for session refresh
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Ignore header errors
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // Ignore header errors
          }
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user;

  // Fetch subscription details
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch feature flags (optional, can be hardcoded or from DB)
  // For now return defaults
  const feature_flags = {
    beta_features: true,
    advanced_model_access:
      subscription?.plan_tier === 'pro' || subscription?.plan_tier === 'enterprise',
  };

  // Map to UserProfile struct expected by Desktop
  // Note: Rust uses u64 for timestamps (seconds or ms?). Usually seconds for UNIX epoch.
  // JS Date.now() is ms. Supabase created_at is string ISO.

  const plan = {
    tier: subscription?.plan_tier || 'free',
    display_name:
      (subscription?.plan_tier || 'free').charAt(0).toUpperCase() +
      (subscription?.plan_tier || 'free').slice(1),
    status: subscription?.status || 'none',
    current_period_end: subscription?.current_period_end
      ? new Date(subscription.current_period_end).getTime() / 1000
      : null,
  };

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || null,
    created_at: new Date(user.created_at).getTime() / 1000,
    updated_at: user.updated_at ? new Date(user.updated_at).getTime() / 1000 : Date.now() / 1000,
    plan,
    feature_flags,
  });
}
