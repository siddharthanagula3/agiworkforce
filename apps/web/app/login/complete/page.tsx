import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { TermsGate } from '../../signup/TermsGate';
import { StaleSessionRecovery } from './StaleSessionRecovery';
import {
  ContinueWithCurrentTerms,
  RecordTermsAcceptance,
} from '../../signup/complete/RecordTermsAcceptance';
import { getRequestIdentity } from '@/lib/server/identity';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; surface?: string; authRetry?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), '/');
  const isDesktopSurface = params.surface === 'desktop';
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    // NOT a redirect. /login renders Clerk's <SignIn forceRedirectUrl> pointing
    // back here, so a browser holding a session this server rejects bounces
    // between the two forever, client "succeeds", server disagrees, repeat,
    // hammering Clerk's API on every lap. Sending them to /login again cannot
    // work while the stale session that causes the bounce is still in the
    // browser, so it is cleared client-side first. `authRetry` marks the one
    // attempt we make, so a session that survives sign-out gets an explanation
    // rather than another lap.
    const loginUrl = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
      isDesktopSurface ? '&surface=desktop' : ''
    }&authRetry=1`;
    return <StaleSessionRecovery loginUrl={loginUrl} alreadyRetried={params.authRetry === '1'} />;
  }

  if (await hasAcceptedCurrentTerms(userId)) {
    return <ContinueWithCurrentTerms redirectTo={redirectTo} />;
  }

  return (
    <AuthLayout>
      <AuthStepFrame
        heading="Finish signing in"
        detail={
          <p className="text-center">Review and accept our terms to continue to your account.</p>
        }
      >
        <TermsGate restorePreAuthMarker={false} confirmationLabel="Continue">
          <RecordTermsAcceptance redirectTo={redirectTo} surface="web-login" />
        </TermsGate>
      </AuthStepFrame>
    </AuthLayout>
  );
}
