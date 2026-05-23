import { useState } from 'react';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { DisclosureCopy } from '@agiworkforce/compliance';

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
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 24,
            },
          ]}
        >
          <View style={styles.handle} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              {copy.title}
            </Text>

            <Text style={[styles.summary, { color: colors.textSecondary }]}>{copy.summary}</Text>

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
              <Text style={styles.acceptBtnText}>{copy.acceptLabel}</Text>
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    letterSpacing: -0.5,
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
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
    color: '#000',
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
