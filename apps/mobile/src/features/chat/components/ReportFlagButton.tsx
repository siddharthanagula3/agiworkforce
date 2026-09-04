/**
 * ReportFlagButton: per-turn in-app report/flag control.
 *
 * Google Play GenAI policy requires a report/flag mechanism on every
 * assistant turn. This button renders as a small flag icon below assistant
 * messages and opens a modal for category selection + optional support email.
 *
 * Reports are submitted to the server trust-and-safety intake route (see
 * services/contentReport.ts), with an on-device copy kept as an offline / Local
 * Mode fallback. The confirmation reports the outcome the service actually
 * produced (ReportDelivery), it must never read as "submitted" for a report
 * that never left the phone.
 *
 * Usage: rendered inside MessageBubble for assistant turns only.
 */
import { useState, useCallback } from 'react';
import {
  View,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  openSupportEmail,
  saveContentReport,
  type ContentReport,
  type ReportCategory,
  type ReportDelivery,
} from '@/services/contentReport';

const CATEGORIES: Array<{ id: ReportCategory; label: string }> = [
  { id: 'harmful', label: 'Harmful or dangerous' },
  { id: 'inaccurate', label: 'Inaccurate or misleading' },
  { id: 'offensive', label: 'Offensive or hateful' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'privacy', label: 'Privacy concern' },
  { id: 'other', label: 'Other' },
];

const DELIVERY_BODY: Record<ReportDelivery['kind'], string> = {
  'submitted-to-server':
    'Your report was sent to the AGI safety team for review. A copy is also kept on this device.',
  'stored-on-device':
    'You are offline (or in Local Mode), so it stays on this device for now, nothing was sent. Email it to support if you want someone to review it sooner.',
  'email-composer-opened':
    'Your mail app opened with the report filled in. Send that email to reach the support team.',
  'email-unavailable':
    'No mail app is set up on this device, so the report could not be handed off. It is still saved here.',
};

const DELIVERY_TITLE: Record<ReportDelivery['kind'], string> = {
  'submitted-to-server': 'Report submitted for review',
  'stored-on-device': 'Report saved on this device',
  'email-composer-opened': 'Report saved on this device',
  'email-unavailable': 'Report saved on this device',
};

interface ReportFlagButtonProps {
  messageId: string;
  conversationId: string;
  contentExcerpt: string;
}

export function ReportFlagButton({
  messageId,
  conversationId,
  contentExcerpt,
}: ReportFlagButtonProps) {
  const colors = useThemeColors();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [userNote, setUserNote] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [saved, setSaved] = useState<{ report: ContentReport; delivery: ReportDelivery } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpen = useCallback(() => {
    setSaved(null);
    setSelectedCategory(null);
    setUserNote('');
    setSendEmail(false);
    setErrorMessage(null);
    setModalVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedCategory) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await saveContentReport({
        messageId,
        conversationId,
        contentExcerpt,
        category: selectedCategory,
        userNote,
        sendEmail,
      });
      setSaved(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Report could not be saved.');
    } finally {
      setLoading(false);
    }
  }, [messageId, conversationId, contentExcerpt, selectedCategory, userNote, sendEmail]);

  const handleEmailHandoff = useCallback(async () => {
    if (!saved) return;
    setLoading(true);
    const opened = await openSupportEmail(saved.report);
    setSaved({
      report: { ...saved.report, emailHandoffOpened: opened || saved.report.emailHandoffOpened },
      delivery: { kind: opened ? 'email-composer-opened' : 'email-unavailable' },
    });
    setLoading(false);
  }, [saved]);

  return (
    <>
      <Pressable
        testID="report-flag-button"
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel="Report this response"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.flagBtn}
      >
        <Flag size={12} color={colors.textMuted} />
        <Text style={[styles.flagLabel, { color: colors.textMuted }]}>Report</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        accessibilityViewIsModal
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={handleClose}
        />

        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
          {saved ? (
            <View style={styles.resultContainer}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {DELIVERY_TITLE[saved.delivery.kind]}
              </Text>
              <Text style={[styles.resultBody, { color: colors.textSecondary }]}>
                {DELIVERY_BODY[saved.delivery.kind]}
              </Text>
              {saved.delivery.kind !== 'email-composer-opened' && (
                <Pressable
                  testID="report-email-handoff-btn"
                  onPress={() => void handleEmailHandoff()}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Email this report to support"
                  accessibilityState={{ disabled: loading }}
                  style={[styles.submitBtn, { backgroundColor: colors.teal }]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <Text style={[styles.submitBtnText, { color: colors.accentText }]}>
                      Email this report to support
                    </Text>
                  )}
                </Pressable>
              )}
              <Pressable
                testID="report-close-btn"
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Done"
                style={
                  saved.delivery.kind === 'email-composer-opened'
                    ? [styles.submitBtn, { backgroundColor: colors.teal }]
                    : styles.cancelBtn
                }
              >
                <Text
                  style={
                    saved.delivery.kind === 'email-composer-opened'
                      ? [styles.submitBtnText, { color: colors.accentText }]
                      : [styles.cancelBtnText, { color: colors.textMuted }]
                  }
                >
                  Done
                </Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[styles.sheetTitle, { color: colors.textPrimary }]}
                accessibilityRole="header"
              >
                Report this response
              </Text>
              <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                Select the reason that best describes the issue. Your report is saved on this device
                and, when you are connected, sent to the AGI safety team for review. You can also
                email it to support below.
              </Text>

              {/* Category picker */}
              <View style={styles.categoryList}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.id}
                    testID={`report-category-${cat.id}`}
                    onPress={() => setSelectedCategory(cat.id)}
                    accessibilityRole="button"
                    accessibilityLabel={cat.label}
                    accessibilityState={{ selected: selectedCategory === cat.id }}
                    style={[
                      styles.categoryRow,
                      {
                        borderColor: selectedCategory === cat.id ? colors.teal : colors.border,
                        backgroundColor:
                          selectedCategory === cat.id
                            ? colors.accentSurface
                            : colors.surfaceElevated,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: selectedCategory === cat.id ? colors.teal : colors.border,
                          backgroundColor:
                            selectedCategory === cat.id ? colors.teal : colors.transparent,
                        },
                      ]}
                    />
                    <Text style={[styles.categoryLabel, { color: colors.textPrimary }]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Optional note */}
              <Text style={[styles.noteLabel, { color: colors.textSecondary }]}>
                Additional details (optional)
              </Text>
              <TextInput
                testID="report-note-input"
                value={userNote}
                onChangeText={setUserNote}
                placeholder="Describe the issue..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                style={[
                  styles.noteInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: colors.inputSurface,
                  },
                ]}
                accessibilityLabel="Additional details about the issue"
              />

              {/* Email hand-off opt-in, the only path off this device */}
              <Pressable
                testID="report-email-toggle"
                onPress={() => setSendEmail((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Email this report to support"
                accessibilityHint="Opens your mail app with the report filled in. You still choose to send it."
                accessibilityState={{ selected: sendEmail }}
                style={styles.emailRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: sendEmail ? colors.teal : colors.border,
                      backgroundColor: sendEmail ? colors.teal : colors.transparent,
                    },
                  ]}
                >
                  {sendEmail && (
                    <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: '700' }}>
                      ✓
                    </Text>
                  )}
                </View>
                <View style={styles.emailCopy}>
                  <Text style={[styles.emailLabel, { color: colors.textSecondary }]}>
                    Email this report to support
                  </Text>
                  <Text style={[styles.emailCaption, { color: colors.textMuted }]}>
                    Opens your mail app with the report filled in.
                  </Text>
                </View>
              </Pressable>

              {errorMessage && (
                <Text
                  selectable
                  accessibilityRole="alert"
                  style={{
                    color: colors.agentError,
                    fontSize: 13,
                    lineHeight: 18,
                    marginBottom: 12,
                  }}
                >
                  {errorMessage}
                </Text>
              )}

              {/* Save, "submit" would name a transmission that does not happen */}
              <Pressable
                testID="report-submit-btn"
                onPress={handleSubmit}
                disabled={!selectedCategory || loading}
                accessibilityRole="button"
                accessibilityLabel={loading ? 'Saving report' : 'Save report'}
                accessibilityState={{ disabled: !selectedCategory || loading }}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: selectedCategory && !loading ? colors.teal : colors.border,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.accentText} />
                ) : (
                  <Text style={[styles.submitBtnText, { color: colors.accentText }]}>
                    Save report
                  </Text>
                )}
              </Pressable>

              <Pressable
                testID="report-cancel-btn"
                onPress={handleClose}
                accessibilityRole="button"
                style={styles.cancelBtn}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    opacity: 0.6,
  },
  flagLabel: {
    fontSize: 11,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  categoryList: {
    gap: 8,
    marginBottom: 20,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  categoryLabel: {
    fontSize: 15,
    flex: 1,
  },
  noteLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  noteInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailCopy: {
    flex: 1,
    gap: 2,
  },
  emailLabel: {
    fontSize: 14,
  },
  emailCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  submitBtn: {
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
  },
  resultContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  resultBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 8,
  },
});
