import { Cloud } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntentForDestination } from '@/src/features/auth/services/postAuthIntent';
import { useAppModeSwitch } from '@/src/features/chat/hooks/useAppModeSwitch';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/Common';
import { ChineseHqProviderConsentGroup } from './ChineseHqProviderConsentGroup';
import { ProductAnalyticsConsentGroup } from './ProductAnalyticsConsentGroup';
import { TrainingPreferenceGroups } from './TrainingPreferenceGroups';
import { UsOnlyRoutingGroup } from './UsOnlyRoutingGroup';

const CLOUD_PRIVACY_ROUTE = '/(app)/settings/cloud-privacy';

export function PrivacyCloudControls() {
  const router = useRouter();
  const { appMode, switchToCloud } = useAppModeSwitch();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);

  if (!isClerkLoaded) return null;

  if (isClerkSignedIn && appMode === 'cloud') {
    return (
      <>
        <TrainingPreferenceGroups />
        <UsOnlyRoutingGroup />
        <ChineseHqProviderConsentGroup />
        <ProductAnalyticsConsentGroup />
      </>
    );
  }

  const signedIn = isClerkSignedIn;
  return (
    <>
      <ChineseHqProviderConsentGroup />
      <SettingsGroup footnote="Model training, routing and analytics choices apply to AGI Cloud chats.">
        <SettingsRow
          label="AGI Cloud privacy controls"
          icon={Cloud}
          value={signedIn ? 'Switch to AGI Cloud' : 'Sign in'}
          onPress={
            signedIn
              ? () => void switchToCloud()
              : () => router.push(beginCloudPostAuthIntentForDestination(CLOUD_PRIVACY_ROUTE))
          }
          isLast
        />
      </SettingsGroup>
    </>
  );
}
