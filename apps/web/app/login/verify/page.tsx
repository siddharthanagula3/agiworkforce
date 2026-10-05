import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AccountSecurityHandoff } from '@/features/account-security/components/AccountSecurityHandoff';
import { AccountSecurityVerify } from '@/features/account-security/components/AccountSecurityVerify';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthStepFrame } from '@/features/auth/AuthStepFrame';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import { subjectSessionPassesAccountSecurity } from '@/lib/server/account-security/gate';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Verify it's you",
  robots: { index: false, follow: false },
};

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

const HANDOFF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export default async function AccountSecurityVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; handoff?: string }>;
}) {
  const params = await searchParams;

  if (typeof params.handoff === 'string' && HANDOFF_PATTERN.test(params.handoff)) {
    return (
      <AuthLayout scene>
        <AuthStepFrame
          heading="Confirm sign-in"
          detail={
            <p>
              Use one of your passkeys or security keys to finish signing in to the AGI app. Only
              continue if you started signing in on this computer in the last few minutes.
            </p>
          }
        >
          <AccountSecurityHandoff handoff={params.handoff} />
        </AuthStepFrame>
      </AuthLayout>
    );
  }

  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), '/chat');
  const { subject, sessionId } = await getRequestIdentity();
  if (!subject) redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  if (await subjectSessionPassesAccountSecurity(subject, sessionId)) redirect(redirectTo);

  return (
    <AuthLayout scene>
      <AuthStepFrame
        heading="Verify it's you"
        detail={
          <p>
            Advanced Account Security is on for this account. Continue with one of your passkeys or
            security keys.
          </p>
        }
      >
        <AccountSecurityVerify redirectTo={redirectTo} />
      </AuthStepFrame>
    </AuthLayout>
  );
}
