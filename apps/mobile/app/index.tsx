import { Redirect } from 'expo-router';
import { storage } from '@/lib/mmkv';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';

/**
 * Concrete root route for cold launches and dev-client opens.
 *
 * The root layout unlocks MMKV before rendering Slot, so these synchronous
 * reads are safe here.
 */
export default function RootIndex() {
  const onboardingDone = storage.getString('onboarding-done');

  if (!onboardingDone) {
    return (
      <Redirect
        href={{
          pathname: isAgeGateConfirmed() ? '/(public)/onboarding' : '/(public)/age-gate',
        }}
      />
    );
  }

  return <Redirect href={{ pathname: '/(app)' }} />;
}
