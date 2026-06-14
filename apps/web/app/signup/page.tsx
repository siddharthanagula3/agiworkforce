import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '../../components/marketing/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/chat');

  return (
    <AuthShell
      title="Create your AGI account."
      lede="Start with hosted AGI Web, then take the same account to Mobile and Desktop Cloud. Serious work can stay Local or BYOK. No account needed there."
      points={[
        'Chat, projects & artifacts in the browser',
        'Join the AGI Cloud waitlist from one place',
        'Local Mode stays free, private & account-free',
      ]}
    >
      <SignUp
        routing="hash"
        signInUrl="/login"
        fallbackRedirectUrl={redirectTo}
        signInFallbackRedirectUrl={redirectTo}
        appearance={agiClerkAppearance}
      />
    </AuthShell>
  );
}
