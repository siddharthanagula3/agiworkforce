/**
 * Mobile BYOK unsupported notice.
 *
 * Mobile v1 has no BYOK mode. Keep this component fail-closed so any legacy
 * entry point explains the boundary instead of unlocking provider routing.
 */
import { useEffect, useRef } from 'react';
import { Modal, View, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLink, Lock, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';

function trackNoticeShown() {
  /* analytics.track('byok_disabled_notice_shown') */
}
function trackNoticeDismissed() {
  /* analytics.track('byok_disabled_notice_dismissed') */
}

export interface ByokConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function ByokConsentModal({ visible, onAccept, onCancel }: ByokConsentModalProps) {
  const colors = useThemeColors();
  const shownRef = useRef(false);
  void onAccept;

  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      trackNoticeShown();
    }
    if (!visible) {
      shownRef.current = false;
    }
  }, [visible]);

  const handleDismiss = () => {
    trackNoticeDismissed();
    onCancel();
  };

  return (
    <Modal
      testID="byok-consent-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal
    >
      <SafeAreaView
        testID="byok-consent-modal-inner"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            testID="byok-consent-modal-title"
            style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, flex: 1 }}
          >
            BYOK is not available on mobile
          </Text>
          <Pressable
            testID="byok-consent-cancel-icon"
            onPress={handleDismiss}
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={{ padding: 4 }}
          >
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${colors.teal}18`,
              borderWidth: 1,
              borderColor: `${colors.teal}33`,
              marginBottom: 18,
            }}
          >
            <Lock size={22} color={colors.teal} />
          </View>

          <Text
            testID="byok-consent-body-p1"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 14 }}
          >
            Provider keys cannot be added on mobile. AGI Mobile stays in Local Mode unless you
            explicitly unlock Cloud Managed with an invite code.
          </Text>
          <Text
            testID="byok-consent-body-p2"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 14 }}
          >
            Use Desktop or the developer surfaces for BYOK workflows. Mobile is intentionally kept
            to Local and AGI Managed Cloud invite paths.
          </Text>
          <Text
            testID="byok-consent-body-p3"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 24 }}
          >
            Cloud Managed remains waitlist-only. Until then, mobile chats run locally and do not
            require an account.
          </Text>

          <Pressable
            testID="byok-consent-agi-privacy-link"
            onPress={() => openExternalUrl('https://agiworkforce.com/privacy')}
            accessibilityRole="link"
            accessibilityLabel="Read the AGI privacy policy"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.teal }}>Read the AGI privacy policy</Text>
            <ExternalLink size={12} color={colors.teal} />
          </Pressable>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'android' ? 20 : 8,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            testID="byok-consent-accept-btn"
            onPress={handleDismiss}
            accessibilityLabel="Got it"
            accessibilityRole="button"
            style={{
              backgroundColor: colors.teal,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Got it</Text>
          </Pressable>
          <Pressable
            testID="byok-consent-cancel-btn"
            onPress={handleDismiss}
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={{ paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
