/**
 * Standalone edit modal extracted from MessageBubble.
 * Allows users to edit a previously sent message.
 */

import {
  View,
  Pressable,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface MessageEditModalProps {
  visible: boolean;
  text: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function MessageEditModal({
  visible,
  text,
  onChangeText,
  onClose,
  onSubmit,
}: MessageEditModalProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/*
       * KeyboardAvoidingView must live INSIDE <Modal>. RN renders a Modal into a
       * separate native window, so any ancestor KeyboardAvoidingView outside it
       * has no effect on this content. Without this the auto-raised keyboard
       * covered the Cancel/Send row — and because the only dismissal affordances
       * were those buttons and the backdrop behind the keyboard, an edit could
       * be neither confirmed nor cancelled without force-closing the app.
       */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityLabel="Dismiss edit dialog"
          accessibilityRole="button"
          // accessible=false: without this, a Pressable with a label/role becomes a
          // leaf accessibility element and swallows every descendant — the text
          // field and Cancel/Send buttons below would be invisible to VoiceOver,
          // reachable only as one opaque "Dismiss edit dialog" node. Those two
          // buttons are the dialog's actual accessible dismiss/confirm paths; this
          // backdrop only needs to stay tappable for sighted users, which
          // accessible=false does not affect.
          accessible={false}
        >
          <Pressable
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
            <View style={styles.buttonRow}>
              <Pressable
                style={styles.cancelBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.submitBtn}
                onPress={onSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit edit"
              >
                <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>Send</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
    padding: 20,
    borderWidth: 1,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
    borderWidth: 1,
    marginBottom: 16,
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
