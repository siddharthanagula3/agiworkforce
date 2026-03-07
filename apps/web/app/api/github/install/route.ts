import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get('installation_id');
  const accountLogin = searchParams.get('account_login') ?? '';
  const accountType = searchParams.get('account_type') ?? 'User';

  if (!installationId) {
    return NextResponse.redirect(new URL('/dashboard?error=github_install_failed', request.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', '/dashboard/integrations/github');
    return NextResponse.redirect(loginUrl);
  }

  const { error } = await supabase.from('github_installations').upsert(
    {
      user_id: user.id,
      installation_id: Number(installationId),
      account_login: accountLogin,
      account_type: accountType,
    },
    { onConflict: 'installation_id' },
  );

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to save GitHub installation');
    return NextResponse.redirect(
      new URL('/dashboard/integrations/github?error=save_failed', request.url),
    );
  }

  return NextResponse.redirect(
    new URL('/dashboard/integrations/github?connected=true', request.url),
  );
}
