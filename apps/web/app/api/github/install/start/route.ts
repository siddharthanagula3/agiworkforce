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
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { getNeonDb } from '@/lib/server/neon-db';
import { buildWorkspaceCodeGateResponse } from '@/lib/services/organization-policy-code-gate';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/connectors');
    return NextResponse.redirect(loginUrl);
  }

  const codeGate = await buildWorkspaceCodeGateResponse(
    getNeonDb(),
    userId,
    { act: 'connect_github' },
    request,
  );
  if (codeGate) return codeGate;

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

export const GET = withPrivateNoStore(handleGet);
