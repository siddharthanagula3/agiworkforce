import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '../../components/marketing/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/chat');

  return (
    <AuthShell
      title="Welcome back."
      lede="Sign in to pick up your chats, projects, and artifacts. Managed cloud is open in public alpha, so you can start right away."
      points={[
        'One account across Web, Mobile & Desktop Cloud',
        'Local Mode never requires an account',
        'Your route is visible before work leaves a device',
      ]}
    >
      <SignIn
        routing="hash"
        signUpUrl="/signup"
        fallbackRedirectUrl={redirectTo}
        signUpFallbackRedirectUrl={redirectTo}
        appearance={agiClerkAppearance}
      />
    </AuthShell>
  );
}
