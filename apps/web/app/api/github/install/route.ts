import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get('installation_id');
  const accountLogin = searchParams.get('account_login') ?? '';
  const accountType = searchParams.get('account_type') ?? 'User';
  const state = searchParams.get('state');

  if (!installationId || Number.isNaN(Number(installationId)) || Number(installationId) <= 0) {
    return NextResponse.redirect(new URL('/chat?error=github_install_failed', request.url));
  }

  const cookieStore = await cookies();

  // Validate state parameter to prevent installation fixation attacks
  const storedState = cookieStore.get('github_install_state')?.value;
  if (!state || !storedState || state !== storedState) {
    logger.warn(
      { hasState: !!state, hasStoredState: !!storedState },
      'GitHub install callback: state mismatch',
    );
    return NextResponse.redirect(new URL('/chat?error=github_install_invalid_state', request.url));
  }

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', '/chat/integrations/github');
    return NextResponse.redirect(loginUrl);
  }

  const supabase = getServiceClient();

  const { error } = await supabase.from('github_installations').upsert(
    {
      user_id: userId,
      installation_id: Number(installationId),
      account_login: accountLogin,
      account_type: accountType,
    },
    { onConflict: 'installation_id' },
  );

  if (error) {
    logger.error({ error, userId }, 'Failed to save GitHub installation');
    return NextResponse.redirect(
      new URL('/chat/integrations/github?error=save_failed', request.url),
    );
  }

  // Clear the state cookie after successful use
  cookieStore.set({
    name: 'github_install_state',
    value: '',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.redirect(new URL('/chat/integrations/github?connected=true', request.url));
}
