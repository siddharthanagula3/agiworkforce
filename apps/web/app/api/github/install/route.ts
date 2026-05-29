import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';

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

  const db = getNeonDb();

  try {
    await db.execute(
      `insert into github_installations (user_id, installation_id, account_login, account_type)
       values ($1, $2, $3, $4)
       on conflict (installation_id)
       do update set
         user_id = excluded.user_id,
         account_login = excluded.account_login,
         account_type = excluded.account_type`,
      [userId, Number(installationId), accountLogin, accountType],
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to save GitHub installation');
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
