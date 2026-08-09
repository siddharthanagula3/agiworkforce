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

  // New accounts land on /signup/complete first: the terms were accepted by the
  // gate below, but nothing can be written against the user id until the
  // account exists, and that page is where the record is made durable before
  // the user is handed on to `redirectTo`.
  //
  // This is `forceRedirectUrl`, not `fallbackRedirectUrl`, and the difference is
  // load-bearing. @clerk/shared `RedirectUrls.#getRedirectUrl` resolves
  // `signUpForceRedirectUrl` (search params, then props) BEFORE
  // `fromSearchParams.redirectUrl`, and only resolves `signUpFallbackRedirectUrl`
  // after it — and `RedirectUrls.preserved = ['redirectUrl']` means Clerk itself
  // carries `?redirect_url=` across its own SignIn/SignUp navigation. As a
  // fallback this step was skippable by an ordinary in-product link; as a force
  // it is not. A hand-written `?sign_up_force_redirect_url=` still outranks this
  // prop, which is why /signup/complete gates on assent itself rather than
  // trusting that it was reached from here.
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
