import { headers } from 'next/headers';

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { readGlobalPrivacyControlHeader } from '@/lib/consent-signals';
import { logger } from '@/lib/logger';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { readLatestConsent } from '@/lib/server/consent-records';
import { hasAcceptedAnyTerms, hasAcceptedCurrentTerms, mustAcceptTerms } from '@/lib/server/terms';
import { TermsGate } from '../../signup/TermsGate';
import { StaleSessionRecovery } from './StaleSessionRecovery';
import {
  ContinueWithCurrentTerms,
  RecordTermsAcceptance,
} from '../../signup/complete/RecordTermsAcceptance';
import { getRequestIdentity } from '@/lib/server/identity';
import { accountAccessForSignIn } from '@/lib/auth/account-lifecycle';
import { readPrimaryEmailState } from '@/lib/auth/email-confirmation';
import { AccountAccessNotice } from '@/features/auth/AccountAccessNotice';
import { ConfirmEmailStep } from '@/features/auth/ConfirmEmailStep';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { TermsReviewSignOut } from './TermsReviewSignOut';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

// An account that granted, refused or withdrew is never asked again, and a
// ledger that cannot be read is not taken to mean nobody asked.
async function neverAskedAboutProductUpdates(userId: string): Promise<boolean> {
  try {
    return (await readLatestConsent(userId, PRODUCT_UPDATES_CONSENT_PURPOSE.id)) === null;
  } catch (error) {
    logger.error({ error, userId }, 'Could not read the product updates decision at sign-in');
    return false;
  }
}

export default async function LoginCompletePage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string;
    surface?: string;
    authRetry?: string;
    review?: string;
  }>;
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

  // Correct credentials do not mean the account may be used: say why here
  // instead of handing over a product whose every call answers 403.
  const access = await accountAccessForSignIn(userId);
  if (!access.allowed) {
    const loginHref = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
      isDesktopSurface ? '&surface=desktop' : ''
    }`;
    return (
      <AuthLayout embedded={isDesktopSurface} scene>
        <AccountAccessNotice denial={access} signInHref={loginHref} />
      </AuthLayout>
    );
  }

  if (!(await readPrimaryEmailState(userId)).confirmed) {
    return (
      <AuthLayout embedded={isDesktopSurface} scene>
        <ConfirmEmailStep footer={<TermsReviewSignOut />} />
      </AuthLayout>
    );
  }

  // An account on an older valid version continues without a click-through;
  // review=terms is the notice's link for accepting a published revision early.
  const mustAccept =
    params.review === 'terms'
      ? !(await hasAcceptedCurrentTerms(userId).catch(() => true))
      : await mustAcceptTerms(userId, 'login-complete');
  if (!mustAccept) {
    return <ContinueWithCurrentTerms redirectTo={redirectTo} />;
  }
  const firstAcceptance = !(await hasAcceptedAnyTerms(userId));
  const offerProductUpdates = firstAcceptance && (await neverAskedAboutProductUpdates(userId));
  const optedOutBySignal = offerProductUpdates && readGlobalPrivacyControlHeader(await headers());

  return (
    <AuthLayout embedded={isDesktopSurface} scene>
      <AuthStepFrame
        heading="Finish signing in"
        detail={<p>Review and accept our terms to continue to your account.</p>}
        footer={<TermsReviewSignOut />}
      >
        <TermsGate
          restorePreAuthMarker={false}
          confirmationLabel="Continue"
          confirmAge={firstAcceptance}
          offerProductUpdates={offerProductUpdates}
          optedOutBySignal={optedOutBySignal}
        >
          <RecordTermsAcceptance redirectTo={redirectTo} surface="web-login" />
        </TermsGate>
      </AuthStepFrame>
    </AuthLayout>
  );
}
