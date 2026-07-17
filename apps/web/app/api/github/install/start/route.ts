import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateGitHubInstallState, getGitHubAppInstallUrl } from '@/lib/github-app';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';

/**
 * Starts the GitHub App install flow. The callback at /api/github/install
 * validates the `github_install_state` cookie set here — without this route
 * there is no way to pass that check, so GitHub could never be connected from
 * the product UI.
 *
 * Browser-navigation endpoint (the Connect button points here), so failures
 * redirect back to /connectors with a query flag instead of returning JSON.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await getClerkAuthUser(request);
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/connectors');
    return NextResponse.redirect(loginUrl);
  }

  const installUrl = getGitHubAppInstallUrl();
  if (!installUrl) {
    // GITHUB_APP_SLUG is not configured in this deployment.
    return NextResponse.redirect(new URL('/connectors?github=unavailable', request.url));
  }

  const state = generateGitHubInstallState();
  const cookieStore = await cookies();
  cookieStore.set({
    name: 'github_install_state',
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const target = new URL(installUrl);
  target.searchParams.set('state', state);
  return NextResponse.redirect(target);
}
