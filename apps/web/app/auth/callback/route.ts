import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../services/supabase-server';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');

  // Validate and sanitize the redirect URL to prevent open redirect attacks
  const safeRedirectPath = getSafeRedirectUrl(next, requestUrl.origin, '/');

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth code exchange error:', error);

      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin),
      );
    }
  }

  return NextResponse.redirect(new URL(safeRedirectPath, requestUrl.origin));
}
