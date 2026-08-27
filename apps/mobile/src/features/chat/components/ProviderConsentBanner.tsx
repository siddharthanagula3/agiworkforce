import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Globe, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { setChineseHqProviderConsent } from '@/services/providerConsent';
import {
  providerConsentErrorMessage,
  type ProviderConsentErrorState,
} from '@/src/features/chat/utils/providerConsentRecovery';

export const PROVIDER_CONSENT_BANNER_TEST_ID = 'provider-consent-banner';
export const PROVIDER_CONSENT_ENABLE_TEST_ID = 'provider-consent-enable-btn';
export const PROVIDER_CONSENT_DISMISS_TEST_ID = 'provider-consent-dismiss-btn';

const ENABLE_LABEL = 'Turn on';

interface ProviderConsentBannerProps {
  state: ProviderConsentErrorState | null;
  onEnabled: (state: ProviderConsentErrorState) => void;
  onDismiss: () => void;
}

export function ProviderConsentBanner({ state, onEnabled, onDismiss }: ProviderConsentBannerProps) {
  const colors = useThemeColors();

  const enable = useCallback(() => {
    if (!state) return;
    setChineseHqProviderConsent(state.providerId, true);
    onEnabled(state);
  }, [onEnabled, state]);

  if (!state) return null;

  const message = providerConsentErrorMessage(state);

  return (
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
        style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '500', flex: 1 }}
        numberOfLines={3}
      >
        {message}
      </Text>
      <Pressable
        testID={PROVIDER_CONSENT_ENABLE_TEST_ID}
        onPress={enable}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Turn on ${state.displayName}`}
      >
        <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}>{ENABLE_LABEL}</Text>
      </Pressable>
      <Pressable
        testID={PROVIDER_CONSENT_DISMISS_TEST_ID}
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Leave ${state.displayName} turned off`}
      >
        <X size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
