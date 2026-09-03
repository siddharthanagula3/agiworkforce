import { auth } from '@clerk/nextjs/server';

import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { TermsGate } from '../../signup/TermsGate';
import { StaleSessionRecovery } from './StaleSessionRecovery';
import {
  ContinueWithCurrentTerms,
  RecordTermsAcceptance,
} from '../../signup/complete/RecordTermsAcceptance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; surface?: string; authRetry?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), '/');
  const isDesktopSurface = params.surface === 'desktop';
  const { userId } = await auth();

  if (!userId) {
    const loginUrl = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
      isDesktopSurface ? '&surface=desktop' : ''
    }&authRetry=1`;
    return <StaleSessionRecovery loginUrl={loginUrl} alreadyRetried={params.authRetry === '1'} />;
  }

  if (await hasAcceptedCurrentTerms(userId)) {
    return <ContinueWithCurrentTerms redirectTo={redirectTo} />;
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center p-6">
      <div className="w-full">
        <TermsGate
          blockedMessage="Accept the terms above to finish signing in to your account."
          restorePreAuthMarker={false}
        >
          <RecordTermsAcceptance redirectTo={redirectTo} surface="web-login" />
        </TermsGate>
      </div>
    </main>
  );
}
