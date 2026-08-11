import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { hasAcceptedCurrentTerms } from '@/lib/server/terms';
import { TermsGate } from '../../signup/TermsGate';
import {
  ContinueWithCurrentTerms,
  RecordTermsAcceptance,
} from '../../signup/complete/RecordTermsAcceptance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

/**
 * Authenticated checkpoint after Clerk sign-in.
 *
 * Current-version acceptances pass through without rewriting their original
 * timestamp. Missing or superseded acceptances remain behind the clickwrap and
 * durable recorder before the sanitized destination is restored.
 */
export default async function LoginCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; surface?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), '/');
  const isDesktopSurface = params.surface === 'desktop';
  const { userId } = await auth();

  if (!userId) {
    const loginUrl = `/login?redirectTo=${encodeURIComponent(redirectTo)}${
      isDesktopSurface ? '&surface=desktop' : ''
    }`;
    redirect(loginUrl);
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
