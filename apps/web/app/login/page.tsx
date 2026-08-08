import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/features/marketing/components/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string; surface?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/');
  const isDesktopSurface = params.surface === 'desktop';
  const signUpUrl = isDesktopSurface
    ? `/signup?surface=desktop&redirectTo=${encodeURIComponent(redirectTo)}`
    : '/signup';

  return (
    <AuthShell
      embedded={isDesktopSurface}
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
        signUpUrl={signUpUrl}
        fallbackRedirectUrl={redirectTo}
        signUpFallbackRedirectUrl={redirectTo}
        appearance={agiClerkAppearance}
      />
    </AuthShell>
  );
}
