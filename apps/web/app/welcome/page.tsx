import { redirect } from 'next/navigation';
import { getOnboardingStatus } from '@/lib/server/user-identity';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { OnboardingWizard } from '@/features/onboarding/components/OnboardingWizard';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect('/login?redirectTo=%2Fwelcome');
  }

  await requireCurrentTermsAcceptance(userId, '/welcome');

  const scoped = await getCurrentUserRlsDb();
  if (!scoped) {
    return redirect('/login?redirectTo=%2Fwelcome');
  }

  const status = await getOnboardingStatus(scoped.db, userId);
  if (status.completed) {
    return redirect('/chat');
  }

  return <OnboardingWizard />;
}
