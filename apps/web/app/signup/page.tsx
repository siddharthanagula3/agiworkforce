import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { configuredAuthProviders } from '@/features/auth/authProviderConfig';
import {
  buildLoginUrl,
  buildLoginCompleteUrl,
  buildSignUpCompleteUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readGlobalPrivacyControlHeader } from '@/lib/consent-signals';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { getRequestIdentity } from '@/lib/server/identity';

const SIGNUP_FALLBACK_REDIRECT = '/chat';

async function hasVerifiedSession(): Promise<boolean> {
  try {
    return Boolean((await getRequestIdentity()).subject);
  } catch {
    return false;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string; surface?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(
    params.redirectTo ?? params.next,
    SITE_URL,
    SIGNUP_FALLBACK_REDIRECT,
  );
  const context = readAuthRouteContext(params, redirectTo);
  if (await hasVerifiedSession()) {
    redirect(buildLoginCompleteUrl(context));
  }
  const optedOutBySignal = readGlobalPrivacyControlHeader(await headers());

  return (
    <AuthLayout embedded={context.desktopSurface} scene>
      <AuthFlow
        mode="signup"
        providers={configuredAuthProviders()}
        optedOutBySignal={optedOutBySignal}
        redirects={{
          completeUrl: buildSignUpCompleteUrl(context),
          switchUrl: buildLoginUrl(context),
          ssoCallbackUrl: buildSsoCallbackUrl(context),
        }}
      />
    </AuthLayout>
  );
}
