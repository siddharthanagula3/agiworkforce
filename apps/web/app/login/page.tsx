import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/features/marketing/components/AuthShell';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';
import { agiClerkAppearance } from '../auth/clerkAppearance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string;
    next?: string;
    surface?: string;
    authRetry?: string;
  }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/');
  const isDesktopSurface = params.surface === 'desktop';
  const signUpUrl = isDesktopSurface
    ? `/signup?surface=desktop&redirectTo=${encodeURIComponent(redirectTo)}`
    : '/signup';

  const signUpCompleteUrl = `/signup/complete?redirectTo=${encodeURIComponent(redirectTo)}`;
  // Carried through so /login/complete knows a stale session was already
  // cleared once. Without it, a session the server keeps rejecting would send
  // the user around the /login <-> /login/complete cycle indefinitely.
  const authRetry = params.authRetry === '1';
  const loginCompleteUrl = `/login/complete?redirectTo=${encodeURIComponent(redirectTo)}${
    isDesktopSurface ? '&surface=desktop' : ''
  }${authRetry ? '&authRetry=1' : ''}`;

  return (
    <AuthShell embedded={isDesktopSurface}>
      {/*
        No clickwrap here: terms are accepted at SIGNUP (founder decision,
        2026-08-17). Sign-in cannot know who is signing in, so gating it asked
        returning users to re-accept terms their account had already recorded.
        The guarantee still holds on every path that can create an account or
        change what was agreed:
          - /signup mounts the pre-auth clickwrap before Clerk.
          - signUpForceRedirectUrl sends an account created from THIS card to
            /signup/complete, which gates and records.
          - forceRedirectUrl sends every successful sign-in to /login/complete,
            which checks hasAcceptedCurrentTerms(userId) server-side and prompts
            only when the recorded version is missing or stale.
      */}
      <SignIn
        routing="hash"
        signUpUrl={signUpUrl}
        forceRedirectUrl={loginCompleteUrl}
        signUpForceRedirectUrl={signUpCompleteUrl}
        appearance={agiClerkAppearance}
      />
    </AuthShell>
  );
}
