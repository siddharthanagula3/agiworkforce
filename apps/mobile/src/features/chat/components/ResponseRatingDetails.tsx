import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_REASONS,
  RESPONSE_RATING_REASON_LABELS,
  RESPONSE_RATING_SEND_FAILED,
  RESPONSE_RATING_SHARING_NOTE,
  type ResponseRatingReason,
} from '@agiworkforce/cloud-contracts';
import { PressableBox } from '@/components/ui/PressableBox';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { useThemeColors, radii } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import { keyboardAvoidingBehavior } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import type { ResponseRatingDetailsInput } from '@/src/features/chat/services/cloudMessageMutations';

export function responseRatingDetailsFailure(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : RESPONSE_RATING_SEND_FAILED;
}

export function ResponseRatingDetails({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (details: ResponseRatingDetailsInput) => Promise<void>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const [reason, setReason] = useState<ResponseRatingReason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setComment('');
    setSending(false);
    setFailure(null);
    sendingRef.current = false;
  }, [visible]);

  const hasDetails = reason !== null || comment.trim().length > 0;
  const canSubmit = hasDetails && !sending;

  const submit = useCallback(async () => {
    if (!canSubmit || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setFailure(null);
    try {
      await onSubmit({ reason, comment: comment.trim() });
      onClose();
    } catch (error) {
      setFailure(responseRatingDetailsFailure(error));
      setSending(false);
      sendingRef.current = false;
    }
  }, [canSubmit, comment, onClose, onSubmit, reason]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.surfaceElevated }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardAvoidingBehavior('modal')}>
          <View
            testID="response-rating-details"
            style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
          >
            <View style={styles.header}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: colors.textPrimary }]}
              >
                Tell us more
              </Text>
              <PressableBox
                testID="response-rating-details-close"
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close feedback form"
                style={styles.closeButton}
              >
                <X size={20} color={colors.textSecondary} />
              </PressableBox>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <View style={styles.reasons} accessibilityLabel="Reason">
                {RESPONSE_RATING_REASONS.map((option) => {
                  const selected = reason === option;
                  return (
                    <PressableBox
                      key={option}
                      testID={`response-rating-reason-${option}`}
                      onPress={() => setReason(selected ? null : option)}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel={RESPONSE_RATING_REASON_LABELS[option]}
                      accessibilityState={{ selected, disabled: sending }}
                      style={[
                        styles.reason,
                        {
                          borderColor: selected ? colors.teal : colors.border,
                          backgroundColor: selected ? colors.accentSurface : colors.surfaceHover,
                        },
                      ]}
                    >
                      {selected ? <Check size={14} color={colors.textPrimary} /> : null}
                      <Text
                        style={[
                          styles.reasonLabel,
                          { color: selected ? colors.textPrimary : colors.textSecondary },
                        ]}
                      >
                        {RESPONSE_RATING_REASON_LABELS[option]}
                      </Text>
                    </PressableBox>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Details (optional)
              </Text>
              <TextInput
                testID="response-rating-comment"
                value={comment}
                onChangeText={setComment}
                editable={!sending}
                placeholder="What was wrong with this response?"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={RESPONSE_RATING_COMMENT_MAX_CHARS}
                accessibilityLabel="Details (optional)"
                style={[
                  styles.comment,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.border,
                    backgroundColor: colors.inputSurface,
                  },
                ]}
              />

              <Text style={[styles.note, { color: colors.textMuted }]}>
                {RESPONSE_RATING_SHARING_NOTE}
              </Text>

              {failure ? (
                <Text
                  selectable
                  accessibilityRole="alert"
                  style={[styles.failure, { color: colors.agentError }]}
                >
                  {failure}
                </Text>
              ) : null}

              <PressableBox
                testID="response-rating-submit"
                onPress={() => void submit()}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel={sending ? 'Sending feedback' : 'Submit'}
                accessibilityState={{ disabled: !canSubmit, busy: sending }}
                style={[
                  styles.submit,
                  { backgroundColor: canSubmit ? colors.teal : colors.border },
                ]}
              >
                {sending ? (
                  <LoadingIndicator size="small" />
                ) : (
                  <Text style={[styles.submitLabel, { color: colors.accentText }]}>Submit</Text>
                )}
              </PressableBox>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </PageSheetSafeArea>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingHorizontal: dialogPadding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: typeScale.headline,
    fontWeight: '700',
  },
  closeButton: {
    width: FULL_SCREEN_TOUCH_TARGET,
    height: FULL_SCREEN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingBottom: 40,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  reasonLabel: {
    fontSize: typeScale.subhead,
  },
  label: {
    fontSize: typeScale.footnote,
    marginBottom: 8,
  },
  comment: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 12,
    fontSize: typeScale.subhead,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  note: {
    fontSize: typeScale.caption,
    lineHeight: 18,
    marginBottom: 16,
  },
  failure: {
    fontSize: typeScale.footnote,
    lineHeight: 18,
    marginBottom: 12,
  },
  submit: {
    borderRadius: radii.full,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitLabel: {
    fontWeight: '600',
    fontSize: typeScale.callout,
  },
});
