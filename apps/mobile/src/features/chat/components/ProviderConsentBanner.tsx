import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Globe, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { setChineseHqProviderConsent } from '@/services/providerConsent';
import { NamedProviderConsentModal } from '@/src/features/settings/cloud-privacy/NamedProviderConsentModal';
import {
  providerConsentErrorMessage,
  type ProviderConsentErrorState,
} from '@/src/features/chat/utils/providerConsentRecovery';

export const PROVIDER_CONSENT_BANNER_TEST_ID = 'provider-consent-banner';
export const PROVIDER_CONSENT_ENABLE_TEST_ID = 'provider-consent-enable-btn';
export const PROVIDER_CONSENT_DISMISS_TEST_ID = 'provider-consent-dismiss-btn';

const ENABLE_LABEL = 'Review';

interface ProviderConsentBannerProps {
  state: ProviderConsentErrorState | null;
  onEnabled: (state: ProviderConsentErrorState) => void;
  onDismiss: () => void;
}

export function ProviderConsentBanner({ state, onEnabled, onDismiss }: ProviderConsentBannerProps) {
  const colors = useThemeColors();
  const [reviewing, setReviewing] = useState(false);

  const enable = useCallback(() => {
    if (!state) return;
    try {
      setChineseHqProviderConsent(state.providerId, true);
    } catch {
      setReviewing(false);
      Alert.alert(
        'Privacy disclosure required',
        'Complete the privacy disclosure before enabling this provider.',
      );
      return;
    }
    setReviewing(false);
    onEnabled(state);
  }, [onEnabled, state]);

  if (!state) return null;

  const message = providerConsentErrorMessage(state);

  return (
    <>
      <View
        testID={PROVIDER_CONSENT_BANNER_TEST_ID}
        accessibilityRole="alert"
        accessibilityLabel={message}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.accentSurface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: 8,
        }}
      >
        <Globe size={14} color={colors.teal} strokeWidth={2} />
        <Text
          style={{
            fontSize: typeScale.caption,
            color: colors.textPrimary,
            fontWeight: '500',
            flex: 1,
          }}
          numberOfLines={3}
        >
          {message}
        </Text>
        <PressableBox
          testID={PROVIDER_CONSENT_ENABLE_TEST_ID}
          onPress={() => setReviewing(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Review ${state.displayName} provider consent`}
        >
          <Text style={{ fontSize: typeScale.caption, color: colors.teal, fontWeight: '600' }}>
            {ENABLE_LABEL}
          </Text>
        </PressableBox>
        <PressableBox
          testID={PROVIDER_CONSENT_DISMISS_TEST_ID}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Leave ${state.displayName} turned off`}
        >
          <X size={14} color={colors.textMuted} />
        </PressableBox>
      </View>
      <NamedProviderConsentModal
        providerId={reviewing ? state.providerId : null}
        onConfirm={enable}
        onCancel={() => setReviewing(false)}
      />
    </>
  );
}
