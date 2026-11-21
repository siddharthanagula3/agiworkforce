import { redirect } from 'next/navigation';

import { AgeConfirmationStep } from '@/features/auth/AgeConfirmationStep';
import { AgeIneligibleNotice } from '@/features/auth/AgeIneligibleNotice';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { buildLoginCompleteUrl } from '@/features/auth/authRoutes';
import { readPrimaryEmailState } from '@/lib/auth/email-confirmation';
import { readAdultEligibilityState } from '@/lib/server/adult-eligibility';
import { IDENTITY_SIGN_IN_LOOKUP_TIMEOUT_MS } from '@/lib/server/identity-timeouts';
import { getRequestIdentity } from '@/lib/server/identity';
import { getSafeRedirectUrl } from '../../../lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { TermsReviewSignOut } from '../../login/complete/TermsReviewSignOut';
import { RecordTermsAcceptance } from './RecordTermsAcceptance';

export default async function SignupCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, SITE_URL, '/welcome');
  const { subject: userId } = await getRequestIdentity();
  if (userId) {
    if (!(await readPrimaryEmailState(userId, IDENTITY_SIGN_IN_LOOKUP_TIMEOUT_MS)).confirmed) {
      redirect(buildLoginCompleteUrl({ redirectTo, desktopSurface: false, authRetry: false }));
    }

    const adultEligibility = await readAdultEligibilityState(userId);
    if (adultEligibility === 'ineligible') {
      return (
        <AuthLayout scene>
          <AgeIneligibleNotice footer={<TermsReviewSignOut />} />
        </AuthLayout>
      );
    }
    if (adultEligibility === 'unconfirmed') {
      return (
        <AuthLayout scene>
          <AgeConfirmationStep surface="web-signup" footer={<TermsReviewSignOut />} />
        </AuthLayout>
      );
    }
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center p-6"
    >
      <div className="w-full">
        <RecordTermsAcceptance redirectTo={redirectTo} />
      </div>
    </main>
  );
}
