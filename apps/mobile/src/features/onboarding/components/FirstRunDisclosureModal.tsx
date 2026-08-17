import { useState } from 'react';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import type { DisclosureCopy } from '@agiworkforce/compliance';

export const PRIVACY_POLICY_URL = 'https://agiworkforce.com/privacy';
export const INDIA_DPDP_NOTICE_URL = 'https://agiworkforce.com/privacy/india';

const PRIVACY_NOTICE_TITLE = 'What we collect';
const PRIVACY_NOTICE_BODY = [
  'Local Mode: your chats stay on this device, encrypted at rest. No account, no upload.',
  'AGI Cloud (only after you sign in): your account email and name, the messages you send, any photos or files you attach, and a device identifier used for push notifications are sent to AGI Cloud and to the model provider serving your request.',
  'We never use your conversations to track you across other apps or websites.',
].join('\n\n');

interface Props {
  visible: boolean;
  copy: DisclosureCopy;
  onAccept: () => void;
  onDecline: () => void;
}

export function FirstRunDisclosureModal({ visible, copy, onAccept, onDecline }: Props) {
  const colors = useThemeColors();
  const [legalExpanded, setLegalExpanded] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceBase,
              shadowColor: colors.black,
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 24,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.neutralBorder }]} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              {copy.title}
            </Text>

            <Text style={[styles.summary, { color: colors.textSecondary }]}>{copy.summary}</Text>

            <View
              testID="disclosure-privacy-card"
              style={[
                styles.privacyCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.privacyTitle, { color: colors.textPrimary }]}
                accessibilityRole="header"
              >
                {PRIVACY_NOTICE_TITLE}
              </Text>
              <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
                {PRIVACY_NOTICE_BODY}
              </Text>
              <Pressable
                testID="disclosure-privacy-policy-link"
                onPress={() => void openInAppBrowser(PRIVACY_POLICY_URL)}
                accessibilityRole="link"
                accessibilityLabel="Read the AGI privacy policy"
              >
                <Text style={[styles.privacyLink, { color: colors.teal }]}>Privacy Policy</Text>
              </Pressable>
              <Pressable
                testID="disclosure-dpdp-notice-link"
                onPress={() => void openInAppBrowser(INDIA_DPDP_NOTICE_URL)}
                accessibilityRole="link"
                accessibilityLabel="Read the India DPDP notice"
              >
                <Text style={[styles.privacyLink, { color: colors.teal }]}>India DPDP notice</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setLegalExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={legalExpanded ? 'Collapse legal detail' : 'Why we show this'}
              style={styles.legalToggle}
            >
              <Text style={[styles.legalToggleText, { color: colors.teal }]}>
                {legalExpanded ? 'Hide legal detail' : 'Why we show this'}
              </Text>
            </Pressable>

            {legalExpanded && (
              <View
                style={[
                  styles.legalBox,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.legalText, { color: colors.textMuted }]}>
                  {copy.article50_1}
                </Text>
                <Text style={[styles.legalSource, { color: colors.teal }]}>{copy.sourceUrl}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Pressable
              testID="disclosure-accept-btn"
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel={copy.acceptLabel}
              style={[styles.acceptBtn, { backgroundColor: colors.teal }]}
            >
              <Text style={[styles.acceptBtnText, { color: colors.accentText }]}>
                {copy.acceptLabel}
              </Text>
            </Pressable>
            <Pressable
              testID="disclosure-decline-btn"
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel={copy.declineLabel}
              style={styles.declineBtn}
            >
              <Text style={[styles.declineBtnText, { color: colors.textMuted }]}>
                {copy.declineLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0,
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  privacyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  privacyLink: {
    fontSize: 13,
    fontWeight: '500',
  },
  legalToggle: {
    paddingVertical: 4,
    marginBottom: 8,
  },
  legalToggleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  legalBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  legalSource: {
    fontSize: 11,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    borderTopWidth: 1,
    gap: 8,
  },
  acceptBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  declineBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineBtnText: {
    fontSize: 14,
  },
});
