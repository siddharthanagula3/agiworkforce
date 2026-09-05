import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { configuredAuthProviders } from '@/features/auth/authProviderConfig';
import {
  buildLoginCompleteUrl,
  buildSignupUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

const LOGIN_FALLBACK_REDIRECT = '/';

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
