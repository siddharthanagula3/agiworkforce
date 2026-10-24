import { Modal, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { PRIVACY_POLICY_URL } from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import type { ChineseHqProviderId } from '@/services/providerConsent';
import { chineseHqProviderDisplayName } from '@/services/providerConsent';

export const PROVIDER_CONSENT_CONFIRM_TEST_ID = 'provider-consent-confirm';
export const PROVIDER_CONSENT_CANCEL_TEST_ID = 'provider-consent-cancel';

interface Props {
  providerId: ChineseHqProviderId | null;
  onConfirm: (providerId: ChineseHqProviderId) => void;
  onCancel: () => void;
}

export function NamedProviderConsentModal({ providerId, onConfirm, onCancel }: Props) {
  const colors = useThemeColors();
  const displayName = providerId ? chineseHqProviderDisplayName(providerId) : '';

  return (
    <Modal
      visible={providerId !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          backgroundColor: colors.scrim,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceBase,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            padding: dialogPadding,
            gap: 16,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '700' }}
          >
            Enable {displayName}?
          </Text>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 21 }}
          >
            {displayName} is based in China, and what you send its models, including files, goes to
            it.
          </Text>
          <PressableBox
            onPress={() => void openInAppBrowser(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
          >
            <Text style={{ color: colors.teal, fontSize: typeScale.subhead }}>
              Read Privacy Policy
            </Text>
          </PressableBox>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 18,
              alignItems: 'center',
            }}
          >
            <PressableBox
              testID={PROVIDER_CONSENT_CANCEL_TEST_ID}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </PressableBox>
            <PressableBox
              testID={PROVIDER_CONSENT_CONFIRM_TEST_ID}
              onPress={() => providerId && onConfirm(providerId)}
              accessibilityRole="button"
              accessibilityLabel={`Enable ${displayName} for AI inference`}
              style={{
                backgroundColor: colors.teal,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: colors.surfaceBase, fontWeight: '700' }}>
                Enable {displayName}
              </Text>
            </PressableBox>
          </View>
        </View>
      </View>
    </Modal>
  );
}
