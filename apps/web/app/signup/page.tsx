import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/features/marketing/components/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';
import { TermsNotice } from './TermsNotice';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string; surface?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/chat');
  const isDesktopSurface = params.surface === 'desktop';
  const signInUrl = isDesktopSurface
    ? `/login?surface=desktop&redirectTo=${encodeURIComponent(redirectTo)}`
    : '/login';

  const completeUrl = `/signup/complete?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthShell embedded={isDesktopSurface}>
      <div className="flex flex-col gap-4">
        <SignUp
          routing="hash"
          signInUrl={signInUrl}
          forceRedirectUrl={completeUrl}
          signInFallbackRedirectUrl={redirectTo}
          appearance={agiClerkAppearance}
        />
        <TermsNotice action="creating an account" />
      </div>
    </AuthShell>
  );
}
