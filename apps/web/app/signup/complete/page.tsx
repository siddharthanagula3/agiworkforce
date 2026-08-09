import { getSafeRedirectUrl } from '../../../lib/safe-redirect';
import { TermsGate } from '../TermsGate';
import { RecordTermsAcceptance } from './RecordTermsAcceptance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

/**
 * The step between Clerk creating the account and the user reaching the app.
 *
 * It exists because `auth()` is unavailable under /signup — proxy.ts runs Clerk
 * middleware on `/api/(.*)` and the protected app routes, not here — so the
 * acceptance is recorded by a client call to /api/terms/accept rather than on
 * this render. `redirectTo` is re-sanitized here because it arrives as a query
 * parameter on a URL the user can edit.
 *
 * The recorder sits behind the same clickwrap as /signup, and that is what makes
 * the record mean something. Arrival here does not prove the box was ticked:
 * Clerk transfers an unknown OAuth identity from the /login SignIn card straight
 * into a sign-up, and this URL can be typed by an account that already exists.
 * Gating on the assent marker rather than on the referrer means those arrivals
 * are shown the terms and must agree before anything is written, instead of
 * having a "web-signup" acceptance manufactured for them.
 */
export default async function SignupCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo, getAppUrl(), '/chat');

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center p-6">
      <div className="w-full">
        <TermsGate blockedMessage="Accept the terms above to finish setting up your account.">
          <RecordTermsAcceptance redirectTo={redirectTo} />
        </TermsGate>
      </div>
    </main>
  );
}
