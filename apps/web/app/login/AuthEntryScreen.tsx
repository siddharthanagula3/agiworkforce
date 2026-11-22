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
import { postAuthDestination } from '@/features/auth/postAuthDestination';
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

export async function AuthEntryScreen({ params }: { params: AuthEntryParams }) {
  const redirectTo = postAuthDestination(params.redirectTo ?? params.next);
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
