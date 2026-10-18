import { redirect } from 'next/navigation';

import { buildLoginCompleteUrl } from '@/features/auth/authRoutes';
import { readPrimaryEmailState } from '@/lib/auth/email-confirmation';
import { getRequestIdentity } from '@/lib/server/identity';
import { getSafeRedirectUrl } from '../../../lib/safe-redirect';
import { SITE_URL } from '@/lib/seo/site';
import { RecordTermsAcceptance } from './RecordTermsAcceptance';

export default async function SignupCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, SITE_URL, '/welcome');
  const { subject: userId } = await getRequestIdentity();
  if (userId && !(await readPrimaryEmailState(userId)).confirmed) {
    redirect(buildLoginCompleteUrl({ redirectTo, desktopSurface: false, authRetry: false }));
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
