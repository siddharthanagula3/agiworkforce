import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { DesktopBrowserSignIn } from '@/features/desktop-host/components/DesktopBrowserSignIn';
import {
  configuredAuthProviders,
  configuredMfaEmailFallback,
  configuredPasskeySignIn,
} from '@/features/auth/authProviderConfig';
import {
  buildLoginCompleteUrl,
  buildSignupUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { getRequestIdentity } from '@/lib/server/identity';

const LOGIN_FALLBACK_REDIRECT = '/';

async function hasVerifiedSession(): Promise<boolean> {
  try {
    return Boolean((await getRequestIdentity()).subject);
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string;
    next?: string;
    surface?: string;
    authRetry?: string;
  }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(
    params.redirectTo ?? params.next,
    SITE_URL,
    LOGIN_FALLBACK_REDIRECT,
  );
  const context = readAuthRouteContext(params, redirectTo);
  if (params.authRetry !== '1' && (await hasVerifiedSession())) {
    redirect(buildLoginCompleteUrl(context));
  }

  return (
    <AuthLayout embedded={context.desktopSurface} scene>
      <AuthFlow
        mode="login"
        providers={configuredAuthProviders()}
        passkeySignIn={configuredPasskeySignIn()}
        mfaEmailFallback={configuredMfaEmailFallback()}
        redirects={{
          completeUrl: buildLoginCompleteUrl(context),
          switchUrl: buildSignupUrl(context),
          ssoCallbackUrl: buildSsoCallbackUrl(context),
        }}
        hostWayIn={<DesktopBrowserSignIn />}
      />
    </AuthLayout>
  );
}
