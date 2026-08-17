import { Redirect } from 'expo-router';
import { storage } from '@/lib/mmkv';

export default function RootIndex() {
  const onboardingDone = storage.getString('onboarding-done');

  if (!onboardingDone) {
    return <Redirect href={{ pathname: '/(public)/onboarding' }} />;
  }

  return <Redirect href={{ pathname: '/(app)' }} />;
}
