import { Redirect } from 'expo-router';
import { storage } from '@/lib/mmkv';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { isAgeGateConfirmed } from '@/src/features/auth/services/ageGate';
import { useAuthStore } from '@/src/features/auth/store';
import { useAccountAgeConfirmed } from '@/src/features/auth/store/adultEligibilityStore';
import { AGE_GATE_PATH, APP_PATH, ONBOARDING_PATH } from '@/src/features/auth/services/rootRouting';

export default function RootIndex() {
  const userId = useAuthStore((state) => state.clerkUserId);
  const accountAgeConfirmed = useAccountAgeConfirmed(userId);
  if (!isAgeGateConfirmed(FEATURES.auth && accountAgeConfirmed)) {
    return <Redirect href={{ pathname: AGE_GATE_PATH }} />;
  }

  const onboardingDone = storage.getString('onboarding-done');

  if (!onboardingDone) {
    return <Redirect href={{ pathname: ONBOARDING_PATH }} />;
  }

  return <Redirect href={{ pathname: APP_PATH }} />;
}
