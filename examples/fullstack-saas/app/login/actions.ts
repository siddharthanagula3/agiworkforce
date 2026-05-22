'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function signInWithPassword(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = getFormString(formData, 'email');
  const password = getFormString(formData, 'password');
  const next = getFormString(formData, 'next') || '/dashboard';

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = getFormString(formData, 'email');
  const password = getFormString(formData, 'password');
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect('/login?message=Check your email to confirm the account.');
}

export async function signInWithGitHub() {
  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_APP_URL;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url)
    redirect(`/login?error=${encodeURIComponent(error?.message ?? 'OAuth failed')}`);
  redirect(data.url);
}
