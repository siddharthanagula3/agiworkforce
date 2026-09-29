import { useState } from 'react';
import { View, Modal, TextInput, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { confirmDiscardChanges } from '@/src/shared/hooks/useUnsavedChangesGuard';
import { Paperclip } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, dialogPadding } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useFullScreenChrome } from '@/src/features/chat/chrome/fullScreenChrome';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import type { MessageAttachment } from '@/types/chat';

interface MessageEditModalProps {
  visible: boolean;
  text: string;
  attachments?: MessageAttachment[];
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function MessageEditModal({
  visible,
  text,
  attachments,
  onChangeText,
  onClose,
  onSubmit,
}: MessageEditModalProps) {
  const colors = useThemeColors();
  const keyboard = useKeyboardSafeComposer('modal');
  const [originalText, setOriginalText] = useState(text);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOriginalText(text);
  }
  const closeEdit = () => {
    if (text.trim() !== originalText.trim()) {
      confirmDiscardChanges(onClose);
    } else {
      onClose();
    }
  };
  const discard = {
    onPress: closeEdit,
    label: 'Cancel edit',
    hint: 'Closes without changing the message',
  };
  const chrome = useFullScreenChrome({
    surface: 'chat.message.edit',
    back: discard,
    close: discard,
    cancel: discard,
  });
  const cancelControl = chrome.cancel ?? chrome.close;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={chrome.onRequestClose}
      accessibilityViewIsModal
    >
      {/*
       * KeyboardAvoidingView must live INSIDE <Modal>. RN renders a Modal into a
       * separate native window, so any ancestor KeyboardAvoidingView outside it
       * has no effect on this content. Without this the auto-raised keyboard
       * covered the Cancel/Send row, and because the only dismissal affordances
       * were those buttons and the backdrop behind the keyboard, an edit could
       * be neither confirmed nor cancelled without force-closing the app.
       */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboard.behavior}
        keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
      >
        <PressableBox
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={closeEdit}
          accessibilityLabel="Dismiss edit dialog"
          accessibilityRole="button"
          accessible={false}
        >
          <PressableBox
            style={[
              styles.dialog,
              {
                backgroundColor: colors.surfaceBase,
                borderColor: colors.border,
              },
            ]}
            onPress={() => undefined}
            accessible={false}
          >
            <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Edit Message</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputSurface,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              value={text}
              onChangeText={onChangeText}
              multiline
              autoFocus
              placeholderTextColor={colors.textMuted}
              placeholder="Edit your message…"
              accessibilityLabel="Edit message text"
              accessibilityHint="Modify your message then tap Send"
            />
            {attachments && attachments.length > 0 ? (
              <View style={styles.attachments} accessibilityLabel="Attachments kept on this edit">
                {attachments.map((attachment) => (
                  <View key={attachment.url} style={styles.attachmentRow}>
                    <Paperclip size={12} color={colors.textMuted} />
                    <Text
                      style={{ flex: 1, fontSize: typeScale.caption, color: colors.textSecondary }}
                      numberOfLines={1}
                    >
                      {attachment.fileName}
                    </Text>
                  </View>
                ))}
                <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                  These stay attached when you send the edit.
                </Text>
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <PressableBox {...cancelControl} style={[styles.cancelBtn, cancelControl.style]}>
                <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
                  Cancel
                </Text>
              </PressableBox>
              <PressableBox
                style={styles.submitBtn}
                onPress={onSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit edit"
              >
                <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
                  Send
                </Text>
              </PressableBox>
            </View>
          </PressableBox>
        </PressableBox>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    borderRadius: 14,
    padding: dialogPadding,
    borderWidth: 1,
  },
  dialogTitle: {
    fontSize: typeScale.callout,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: typeScale.body,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
    borderWidth: 1,
    marginBottom: 16,
  },
  attachments: {
    gap: 6,
    marginBottom: 16,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  cancelBtn: {
    padding: 8,
  },
  submitBtn: {
    padding: 8,
  },
});
