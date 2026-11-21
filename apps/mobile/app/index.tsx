import { Redirect } from 'expo-router';
import { storage } from '@/lib/mmkv';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { AGE_GATE_PATH, APP_PATH, ONBOARDING_PATH } from '@/src/features/auth/services/rootRouting';

export default function RootIndex() {
  if (!isAgeGateConfirmed()) return <Redirect href={{ pathname: AGE_GATE_PATH }} />;

  const onboardingDone = storage.getString('onboarding-done');

  if (!onboardingDone) {
    return <Redirect href={{ pathname: ONBOARDING_PATH }} />;
  }

  return <Redirect href={{ pathname: APP_PATH }} />;
}
