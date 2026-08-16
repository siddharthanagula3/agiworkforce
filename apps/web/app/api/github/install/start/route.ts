import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  generateGitHubInstallState,
  getGitHubAppInstallUrl,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';

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

  if (!isGitHubInstallationLinkingAvailable()) {
    return NextResponse.redirect(
      new URL('/connectors?github=ownership_proof_required', request.url),
    );
  }

  const installUrl = getGitHubAppInstallUrl();
  if (!installUrl) {
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
