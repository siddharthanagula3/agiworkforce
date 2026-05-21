/**
 * ReportFlagButton — per-turn in-app report/flag control.
 *
 * Google Play GenAI policy requires a report/flag mechanism on every
 * assistant turn. This button renders as a small flag icon below assistant
 * messages and opens a modal for category selection + optional support email.
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
import { useThemeColors } from '@/hooks/useTheme';
import { saveContentReport, type ReportCategory } from '@/services/contentReport';

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------

const CATEGORIES: Array<{ id: ReportCategory; label: string }> = [
  { id: 'harmful', label: 'Harmful or dangerous' },
  { id: 'inaccurate', label: 'Inaccurate or misleading' },
  { id: 'offensive', label: 'Offensive or hateful' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'privacy', label: 'Privacy concern' },
  { id: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportFlagButtonProps {
  messageId: string;
  conversationId: string;
  contentExcerpt: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOpen = useCallback(() => {
    setSubmitted(false);
    setSelectedCategory(null);
    setUserNote('');
    setSendEmail(false);
    setModalVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedCategory) return;
    setLoading(true);
    try {
      await saveContentReport({
        messageId,
        conversationId,
        contentExcerpt,
        category: selectedCategory,
        userNote,
        sendEmail,
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }, [messageId, conversationId, contentExcerpt, selectedCategory, userNote, sendEmail]);

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
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
          {submitted ? (
            <View style={styles.thanksContainer}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                Thank you for your report
              </Text>
              <Text style={[styles.thanksBody, { color: colors.textSecondary }]}>
                Your feedback helps us improve AGI for everyone.
              </Text>
              <Pressable
                testID="report-close-btn"
                onPress={handleClose}
                accessibilityRole="button"
                style={[styles.submitBtn, { backgroundColor: colors.teal }]}
              >
                <Text style={[styles.submitBtnText, { color: colors.black }]}>Done</Text>
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
                Select the reason that best describes the issue.
              </Text>

              {/* Category picker */}
              <View style={styles.categoryList}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.id}
                    testID={`report-category-${cat.id}`}
                    onPress={() => setSelectedCategory(cat.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedCategory === cat.id }}
                    style={[
                      styles.categoryRow,
                      {
                        borderColor: selectedCategory === cat.id ? colors.teal : colors.border,
                        backgroundColor:
                          selectedCategory === cat.id
                            ? 'rgba(62,184,196,0.08)'
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
                            selectedCategory === cat.id ? colors.teal : 'transparent',
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
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  },
                ]}
                accessibilityLabel="Additional details about the issue"
              />

              {/* Email opt-in */}
              <Pressable
                testID="report-email-toggle"
                onPress={() => setSendEmail((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sendEmail }}
                style={styles.emailRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: sendEmail ? colors.teal : colors.border,
                      backgroundColor: sendEmail ? colors.teal : 'transparent',
                    },
                  ]}
                >
                  {sendEmail && (
                    <Text style={{ color: colors.black, fontSize: 10, fontWeight: '700' }}>✓</Text>
                  )}
                </View>
                <Text style={[styles.emailLabel, { color: colors.textSecondary }]}>
                  Send report to support team via email
                </Text>
              </Pressable>

              {/* Submit */}
              <Pressable
                testID="report-submit-btn"
                onPress={handleSubmit}
                disabled={!selectedCategory || loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: !selectedCategory || loading }}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: selectedCategory && !loading ? colors.teal : colors.border,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.black} />
                ) : (
                  <Text style={[styles.submitBtnText, { color: colors.black }]}>Submit Report</Text>
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  emailLabel: {
    fontSize: 14,
    flex: 1,
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
  thanksContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  thanksBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 8,
  },
});
