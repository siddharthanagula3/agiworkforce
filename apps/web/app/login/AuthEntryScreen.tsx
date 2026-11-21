import { redirect } from 'next/navigation';

import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import {
  configuredAuthProviders,
  configuredMfaEmailFallback,
  configuredPasskeySignIn,
} from '@/features/auth/authProviderConfig';
import {
  buildLoginCompleteUrl,
  buildSignUpCompleteUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { DesktopBrowserSignIn } from '@/features/desktop-host/components/DesktopBrowserSignIn';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { getRequestIdentity } from '@/lib/server/identity';

export interface AuthEntryParams {
  redirectTo?: string;
  next?: string;
  surface?: string;
  authRetry?: string;
}

async function hasVerifiedSession(): Promise<boolean> {
  try {
    return Boolean((await getRequestIdentity()).subject);
  } catch {
    return false;
  }
}

export async function AuthEntryScreen({
  params,
  fallbackRedirect,
}: {
  params: AuthEntryParams;
  fallbackRedirect: string;
}) {
  const redirectTo = getSafeRedirectUrl(
    params.redirectTo ?? params.next,
    SITE_URL,
    fallbackRedirect,
  );
  const context = readAuthRouteContext(params, redirectTo);
  if (params.authRetry !== '1' && (await hasVerifiedSession())) {
    redirect(buildLoginCompleteUrl(context));
  }

  return (
    <AuthLayout embedded={context.desktopSurface} scene>
      <AuthFlow
        providers={configuredAuthProviders()}
        passkeySignIn={configuredPasskeySignIn()}
        mfaEmailFallback={configuredMfaEmailFallback()}
        redirects={{
          signInCompleteUrl: buildLoginCompleteUrl(context),
          signUpCompleteUrl: buildSignUpCompleteUrl(context),
          ssoCallbackUrl: buildSsoCallbackUrl(context),
        }}
        hostWayIn={<DesktopBrowserSignIn />}
      />
    </AuthLayout>
  );
}
