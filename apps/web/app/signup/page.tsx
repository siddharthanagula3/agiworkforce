import { AuthFlow } from '@/features/auth/AuthFlow';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { configuredAuthProviders } from '@/features/auth/authProviderConfig';
import {
  buildLoginUrl,
  buildSignUpCompleteUrl,
  buildSsoCallbackUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

const SIGNUP_FALLBACK_REDIRECT = '/chat';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string; surface?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(
    params.redirectTo ?? params.next,
    getAppUrl(),
    SIGNUP_FALLBACK_REDIRECT,
  );
  const context = readAuthRouteContext(params, redirectTo);

  return (
    <AuthLayout embedded={context.desktopSurface}>
      <AuthFlow
        mode="signup"
        providers={configuredAuthProviders()}
        redirects={{
          completeUrl: buildSignUpCompleteUrl(context),
          switchUrl: buildLoginUrl(context),
          ssoCallbackUrl: buildSsoCallbackUrl(context),
        }}
      />
    </AuthLayout>
  );
}
