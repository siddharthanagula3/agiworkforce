import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/features/marketing/components/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';
import { TermsGate } from './TermsGate';

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
    <AuthShell
      embedded={isDesktopSurface}
      title="Create your AGI account."
      lede="Start with hosted AGI Web, then take the same account to Mobile and Desktop Cloud. Serious work can stay Local or BYOK. No account needed there."
      points={[
        'Chat, projects & artifacts in the browser',
        'AGI managed cloud is open — start in the browser',
        'Local Mode stays free, private & account-free',
      ]}
    >
      <TermsGate>
        <SignUp
          routing="hash"
          signInUrl={signInUrl}
          forceRedirectUrl={completeUrl}
          signInFallbackRedirectUrl={redirectTo}
          appearance={agiClerkAppearance}
        />
      </TermsGate>
    </AuthShell>
  );
}
