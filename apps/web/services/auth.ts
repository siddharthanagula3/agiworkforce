import { getSupabaseClient } from './supabase';

export async function signOut() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  window.location.href = '/login';
}

export async function getUser() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
