import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getOnboardingStatus } from '@/lib/server/user-identity';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { OnboardingWizard } from '@/features/onboarding/components/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const { userId } = await auth();

  if (!userId) {
    return redirect('/login?redirectTo=%2Fwelcome');
  }

  await requireCurrentTermsAcceptance(userId, '/welcome');

  const status = await getOnboardingStatus(userId);
  if (status.completed) {
    return redirect('/chat');
  }

  return <OnboardingWizard />;
}
