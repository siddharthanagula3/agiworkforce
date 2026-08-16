import { getSafeRedirectUrl } from '../../../lib/safe-redirect';
import { TermsGate } from '../TermsGate';
import { RecordTermsAcceptance } from './RecordTermsAcceptance';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

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
        <TermsGate
          blockedMessage="Accept the terms above to finish setting up your account."
          restorePreAuthMarker={false}
        >
          <RecordTermsAcceptance redirectTo={redirectTo} />
        </TermsGate>
      </div>
    </main>
  );
}
