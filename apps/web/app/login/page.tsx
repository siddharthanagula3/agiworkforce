import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { configuredAuthProviders } from '@/features/auth/authProviderConfig';
import {
  buildLoginCompleteUrl,
  buildSignupUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { getRequestIdentity } from '@/lib/server/identity';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

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
    getAppUrl(),
    LOGIN_FALLBACK_REDIRECT,
  );
  const context = readAuthRouteContext(params, redirectTo);
  if (params.authRetry !== '1' && (await hasVerifiedSession())) {
    redirect(buildLoginCompleteUrl(context));
  }

  return (
    <AuthLayout embedded={context.desktopSurface}>
      <AuthFlow
        mode="login"
        providers={configuredAuthProviders()}
        redirects={{
          completeUrl: buildLoginCompleteUrl(context),
          switchUrl: buildSignupUrl(context),
          ssoCallbackUrl: buildSsoCallbackUrl(context),
        }}
      />
    </AuthLayout>
  );
}
