import { Spinner } from '@agiworkforce/ui';

import { IdentityBotProtection, IdentitySsoCallback } from '@/features/auth/identityAuthAdapter';
import {
  buildLoginCompleteUrl,
  buildLoginUrl,
  buildSignUpCompleteUrl,
  buildSignupUrl,
  readAuthRouteContext,
} from '@/features/auth/authRoutes';
import { getSafeRedirectUrl } from '../../../lib/safe-redirect';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

const CALLBACK_FALLBACK_REDIRECT = '/';

export default async function SsoCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; surface?: string; authRetry?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), CALLBACK_FALLBACK_REDIRECT);
  const context = readAuthRouteContext(params, redirectTo);

  return (
    <div className="flex min-h-svh items-center justify-center bg-surface-page">
      <p className="flex items-center gap-3 text-sm text-text-muted">
        <Spinner size="sm" />
        Finishing sign-in
      </p>
      <IdentitySsoCallback
        loginUrl={buildLoginUrl(context)}
        signupUrl={buildSignupUrl(context)}
        loginCompleteUrl={buildLoginCompleteUrl(context)}
        signUpCompleteUrl={buildSignUpCompleteUrl(context)}
      />
      <IdentityBotProtection />
    </div>
  );
}
